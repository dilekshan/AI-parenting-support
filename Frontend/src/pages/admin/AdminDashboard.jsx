import { useEffect, useState } from 'react';
import { getDashboardSummary, getRecentRegistrations } from '../../services/adminService.js';
import { Link } from 'react-router-dom';
import logo from '../../assets/logo/985dc272-7657-42a7-aa1e-fd9ad04c085f.png';
import wordmark from '../../assets/logo/juvcare-wordmark.png';
import './AdminDashboard.css';

function Icon({ name }) {
  const shapes = {
    home: <><path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z" /></>,
    people: <><circle cx="9" cy="7" r="3" /><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2" /></>,
    child: <><circle cx="12" cy="9" r="5" /><path d="M4 22v-2a8 8 0 0 1 16 0v2M8 5l2-3m4 3 2-3M10 10h.01M14 10h.01" /></>,
    issue: <><path d="M21 11a9 9 0 0 1-9 9H4l-2 2 2-7a9 9 0 1 1 17-4Z" /><path d="M10 8a2 2 0 1 1 3 2c-1 1-1 1-1 3m0 3h.01" /></>,
    spark: <><path d="m10 2 3 7 7 3-7 3-3 7-3-7-5-3 5-3ZM20 2v5m-2-3h4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="17" rx="2" /><path d="M7 2v6m10-6v6M8 14h8m-4-4v8" /></>,
    document: <><path d="M5 2h10l5 5v15H5Zm10 0v6h5M9 12h7m-7 4h5" /></>,
    report: <><path d="M5 2h10l5 5v15H5Zm10 0v6h5M9 18v-4m4 4v-7m4 7v-2" /></>,
    settings: <><path d="m9 3 1-2h4l1 2 3 2 3 1v4l-2 2 2 2v4l-3 1-3 2-1 2h-4l-1-2-3-2-3-1v-4l2-2-2-2V6l3-1Z" /><circle cx="12" cy="12" r="4" /></>,
    search: <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></>,
    bell: <><path d="M5 17h14l-2-4V8a5 5 0 0 0-10 0v5ZM10 21h4M12 1v2" /></>,
    shield: <><path d="m12 2 9 4v6c0 5-5 9-9 10-4-1-9-5-9-10V6Z" /><path d="M8 12h8m-4-4v8" /></>,
    add: <><circle cx="9" cy="6" r="4" /><path d="M1 22v-3a8 8 0 0 1 16 0v3M19 8v8m-4-4h8" /></>,
    arrow: <path d="M3 12h18m-6-6 6 6-6 6" />,
    up: <path d="M12 21V3m-7 7 7-7 7 7" />,
    chevron: <path d="m9 4 8 8-8 8" />,
  };
  return <svg className="admin-dashboard__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

const navigation = [['home', 'Dashboard'], ['child', 'Children'], ['people', 'Parents'], ['issue', 'Parenting Issues'], ['spark', 'AI Guidance'], ['calendar', 'Activities & Content'], ['document', 'Subscriptions'], ['report', 'Reports & Analytics'], ['people', 'Users & Admins'], ['settings', 'Settings']];
const summaries = [['child', 'Total Children', 'total_children', 'mint'], ['people', 'Total Parents', 'total_parents', 'peach'], ['people', 'Active Users', 'active_users', 'mint'], ['shield', 'Subscription Users', 'subscription_users', 'gold']];
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
const loadingState = () => ({ status: 'loading', data: null, error: null });

export default function AdminDashboard({ user }) {
  const [summary, setSummary] = useState(loadingState);
  const [registrations, setRegistrations] = useState(loadingState);
  useEffect(() => {
    let active = true;
    setSummary(loadingState());
    setRegistrations(loadingState());
    const load = (request, setState) => request().then(
      data => { if (active) setState({ status: 'success', data, error: null }); },
      error => { if (active) setState({ status: 'error', data: null, error: error.message }); },
    );
    load(getDashboardSummary, setSummary);
    load(getRecentRegistrations, setRegistrations);
    return () => { active = false; };
  }, [user?.user_id]);
  const adminName = user?.name?.trim() || 'Admin';
  const initials = adminName.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('');
  return <div className="admin-dashboard">
    <aside className="admin-dashboard__sidebar">
      <Link to="/admin/dashboard" className="admin-dashboard__brand" aria-label="JuvCare admin dashboard"><img src={logo} alt="" /><img src={wordmark} alt="JuvCare" /></Link>
      <nav aria-label="Admin navigation">{navigation.map(([icon, label], index) => index === 0
        ? <Link key={label} to="/admin/dashboard" aria-current="page"><Icon name={icon} /><span>{label}</span></Link>
        : <button key={label} type="button" disabled title="Not available in this UI preview"><Icon name={icon} /><span>{label}</span></button>)}</nav>
    </aside>
    <header className="admin-dashboard__header">
      <div className="admin-dashboard__search"><Icon name="search" /><input aria-label="Search (preview only)" placeholder="Search anything..." disabled /></div>
      <button className="admin-dashboard__notifications" type="button" disabled aria-label="Notifications (preview only)"><Icon name="bell" /><span /></button>
      <div className="admin-dashboard__profile"><span className="admin-dashboard__avatar" aria-hidden="true">{initials}</span><span>{adminName}</span></div>
    </header>
    <main className="admin-dashboard__main">
      <div className="admin-dashboard__intro"><div><h1>Dashboard</h1><p>Overview of JuvCare platform</p></div></div>
      {summary.status === 'error' && <p role="alert">Unable to load dashboard totals: {summary.error}</p>}
      <section className="admin-dashboard__summaries" aria-label="Platform totals" aria-busy={summary.status === 'loading'}>{summaries.map(([icon, label, key, tone]) => <article className="admin-dashboard__summary" key={key}><span className={`admin-dashboard__tile admin-dashboard__tile--${tone}`}><Icon name={icon} /></span><div><h2>{label}</h2><strong aria-label={summary.status === 'loading' ? 'Loading' : summary.status === 'error' ? 'Unable to load' : summary.data[key] === null ? 'Not available' : undefined}>{summary.status === 'loading' ? '\u2026' : summary.status === 'success' ? (summary.data[key] ?? '\u2014') : '\u2014'}</strong></div>{summary.status === 'loading' && <p role="status">Loading...</p>}</article>)}</section>
      <div className="admin-dashboard__panels">
        <section className="admin-dashboard__panel" aria-labelledby="admin-registrations"><div className="admin-dashboard__panel-heading"><h2 id="admin-registrations">Recent Registrations</h2><button type="button" disabled>View All <Icon name="arrow" /></button></div>
          <div className="admin-dashboard__table-wrap" aria-busy={registrations.status === 'loading'}><table><caption className="admin-dashboard__sr-only">Recent registered users</caption><thead className="admin-dashboard__sr-only"><tr><th scope="col">User name</th><th scope="col">Role</th><th scope="col">Date and time</th></tr></thead><tbody>
            {registrations.status === 'loading' && <tr><td colSpan={3} role="status">Loading recent registrations...</td></tr>}
            {registrations.status === 'error' && <tr><td colSpan={3} role="alert">Unable to load recent registrations: {registrations.error}</td></tr>}
            {registrations.status === 'success' && registrations.data.length === 0 && <tr><td colSpan={3}>No recent registrations</td></tr>}
            {registrations.status === 'success' && registrations.data.map((row, index) => <tr key={row.user_id}><td><div className="admin-dashboard__person"><span className={`admin-dashboard__avatar admin-dashboard__tile--${['peach', 'rose', 'peach', 'gold'][index % 4]}`} aria-hidden="true">{Array.from(row.name.trim())[0]}</span><span><strong>{row.name}</strong></span></div></td><td><span className={`admin-dashboard__badge admin-dashboard__badge--${row.role === 'admin' ? 'child' : 'parent'}`}>{row.role === 'admin' ? 'Admin' : 'Parent'}</span></td><td><time dateTime={row.created_at}>{dateFormat.format(new Date(row.created_at))} <span>{timeFormat.format(new Date(row.created_at))}</span></time></td></tr>)}
          </tbody></table></div>
        </section>
        <section className="admin-dashboard__panel" aria-labelledby="admin-quick-actions"><div className="admin-dashboard__panel-heading"><h2 id="admin-quick-actions">Quick Actions</h2></div><div className="admin-dashboard__actions">{[['add', 'Add Child', 'rose'], ['add', 'Add Parent', 'gold'], ['document', 'Add Content', 'blue'], ['report', 'View Reports', 'mint']].map(([icon, label, tone]) => <button key={label} type="button" disabled><span className={`admin-dashboard__tile admin-dashboard__tile--${tone}`}><Icon name={icon} /></span><span>{label}</span><Icon name="chevron" /></button>)}</div></section>
      </div>
    </main>
  </div>;
}
