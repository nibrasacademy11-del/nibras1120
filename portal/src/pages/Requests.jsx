// One page for the requests about customer data (16 Nov 2026): changes customers asked for to
// their locked details, and employees asking to open a file that is not theirs.
import ProfileRequests from './ProfileRequests.jsx';
import AccessRequests from './AccessRequests.jsx';
import { useAuth } from '../auth.jsx';

export default function Requests() {
  const { can } = useAuth();
  return (
    <div className="requests-page">
      {can('profile_requests.view', 'all') && <section className="requests-page__part"><ProfileRequests /></section>}
      {can('access_requests.view') && <section className="requests-page__part"><AccessRequests /></section>}
    </div>
  );
}
