// The academy's certificate design lives in the website's files (/assets/js/cert-nibras.js and
// /assets/css/cert-nibras.css) so the website and the portal print the very same certificate.
// Loaded once, the first time a certificate in that design is shown.
const FONTS = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Figtree:wght@400;700&family=Almarai:wght@400;700&family=Pinyon+Script&family=Open+Sans:wght@400;700&display=swap';
let kit = null;

function add(tag, attrs) {
  const el = document.createElement(tag);
  Object.assign(el, attrs);
  document.head.appendChild(el);
  return el;
}

export function loadCertKit() {
  if (window.NibrasCertificate) return Promise.resolve(window.NibrasCertificate);
  if (!kit) {
    kit = new Promise((resolve, reject) => {
      add('link', { rel: 'stylesheet', href: FONTS });
      add('link', { rel: 'stylesheet', href: '/assets/css/cert-nibras.css?v=20261119' });
      const s = add('script', { src: '/assets/js/cert-nibras.js?v=20261119', async: true });
      // the fonts are waited for, but never more than 2.5 seconds
      const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
      s.onload = () => Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]).then(() => resolve(window.NibrasCertificate));
      s.onerror = () => { kit = null; reject(new Error('The certificate design could not be loaded.')); };
    });
  }
  return kit;
}
