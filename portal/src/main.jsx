import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { I18nProvider } from './i18n.jsx';
import { AuthProvider } from './auth.jsx';
import App from './App.jsx';
import './styles.css';
import './refresh.css';
import './motion.css';
import './charts.css';

let reported = 0;
function report(message, stack) {
  if (reported >= 5 || !message) return;
  reported += 1;
  fetch('/api/v2/client-errors', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: String(message).slice(0, 500), stack: String(stack || '').slice(0, 3000), route: location.pathname }) }).catch(() => {});
}
window.addEventListener('error', (e) => report(e.message, e.error && e.error.stack));
window.addEventListener('unhandledrejection', (e) => report(e.reason && (e.reason.message || e.reason), e.reason && e.reason.stack));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/portal">
      <I18nProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>
);
