import { useEffect, useState } from 'react';
import { getParentDashboard } from '../../services/parentDashboardService.js';
import { Link, useNavigate } from 'react-router-dom';
import { logout } from '../../services/authService.js';
import logo from '../../assets/logo/985dc272-7657-42a7-aa1e-fd9ad04c085f.png';
import wordmark from '../../assets/logo/juvcare-wordmark.png';
import './Home.css';
import ProfileAvatar from '../../components/common/ProfileAvatar.jsx';

// Reuse the same SVG style for the icons on this dashboard.
function Icon({ name, className = '' }) {
  const shapes = {
    home: <><path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z" /></>,
    people: <><circle cx="9" cy="7" r="3" /><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2" /></>,
    spark: <><path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3ZM21 2v4m-2-2h4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="17" rx="2" /><path d="M7 2v6m10-6v6M3 11h18M7 15h2m4 0h2m2 0h1M7 18h2m4 0h2" /></>,
    game: <><path d="M7 7h10c3 0 5 11 4 13s-5-3-6-3H9c-1 0-5 5-6 3S4 7 7 7Z M6 11v5m-2-2h5m6-2h1m2 3h1" /></>,
    book: <><path d="M12 5C8 2 4 3 2 4v17c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Zm0 0v17" /></>,
    search: <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></>,
    bell: <><path d="M5 17h14l-2-4V8a5 5 0 0 0-10 0v5ZM10 21h4M12 1v2" /></>,
    chart: <><path d="M4 20v-7m8 7V8m8 12V3" strokeWidth="5" /></>,
    bolt: <path d="m14 2-9 12h6l-1 8 9-13h-6Z" />,
    robot: <><rect x="3" y="7" width="18" height="14" rx="4" /><path d="M12 3v4M1 11v6m22-6v6M8 12h.1m8 0h.1M8 17h8" /><circle cx="12" cy="2" r="1" /></>,
    leaf: <><path d="M12 22C1 18 2 8 3 4c7 1 10 8 9 18Zm0 0C22 18 22 8 21 4c-7 1-10 8-9 18Zm0-8V2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    sun: <><circle cx="12" cy="12" r="5" /><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
    check: <path d="m5 12 4 4 10-10" />,
  };
  return <svg className={`parent-home__icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

// Keep unfinished actions visible without allowing clicks.
function PreviewButton({ children, className = '', ...props }) {
  return <button type="button" disabled className={className} {...props}>{children}</button>;
}
// Reserve image space without showing an invented user photo.
function Placeholder({ className = '', label }) {
  return <div className={`parent-home__placeholder ${className}`} role="img" aria-label={label} />;
}

// Show this parent's dashboard while keeping account actions together.
export default function Home({ user: authenticatedUser }) {
  const [profileUpdate, setProfileUpdate] = useState(null);
  const user = profileUpdate?.user_id === authenticatedUser?.user_id ? { ...authenticatedUser, ...profileUpdate } : authenticatedUser;
  const navigate = useNavigate();
  // Keep dashboard data and loading failures separate from the account profile.
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');
  // Reload for the authenticated parent and ignore results after leaving the page.
  useEffect(() => {
    let active = true;
    setDashboard(null); setError('');
    getParentDashboard(user?.user_id).then(data => { if (active) setDashboard(data); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [user?.user_id]);
  const loading = !dashboard && !error;
  const message = (section, empty) => loading ? 'Loading...' : error ? `Unavailable: ${error}` : dashboard?.unavailable?.[section] ? `${empty} ${dashboard.unavailable[section]}` : empty;
  const progress = dashboard?.progress;
  // Choose the latest available plan without inserting sample records.
  const plans = [...(dashboard?.plans || [])].sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
  const plan = plans[0];
  const planActivities = (dashboard?.activities || []).filter(item => plan && item.plan_id === plan.plan_id);
  const today = new Date().toLocaleDateString('en-CA');
  const activity = planActivities.find(item => String(item.date || '').slice(0, 10) === today) || [...planActivities].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))[0];
  const guidance = [...(dashboard?.guidance || [])].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
  const formatDate = value => value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '?';
  // Build the calendar from the saved plan start date; missing dates stay blank.
  const days = Array.from({ length: 7 }, (_, index) => {
    if (!plan?.start_date) return null;
    const day = new Date(plan.start_date); day.setDate(day.getDate() + index); return day;
  });
  // Clear the local session before returning to the login page.
  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }
  const parentName = user?.name?.trim() || 'Parent';
  const greetingName = parentName.split(/\s+/)[0];
  return <div className="parent-home">
    <header className="parent-home__header">
      <Link className="parent-home__brand" to="/parent/home" aria-label="JuvCare parent home"><img src={logo} alt="" /><img src={wordmark} alt="JuvCare" /></Link>
      <nav aria-label="Parent navigation" className="parent-home__nav">
        <Link to="/parent/home" aria-current="page"><Icon name="home" />Home</Link>
        {[['people', 'Children'], ['calendar', 'Parenting Plans'], ['spark', 'AI Guidance'], ['game', 'Activities'], ['book', 'Library']].map(([icon, text]) => <PreviewButton key={text}><Icon name={icon} />{text}</PreviewButton>)}
      </nav>
      <div className="parent-home__search"><Icon name="search" /><input aria-label="Search (preview only)" placeholder="Search guidance, activities, stories..." disabled /></div>
      <PreviewButton className="parent-home__notification" aria-label="Notifications (preview only)"><Icon name="bell" /><span aria-label="Notification count unavailable">?</span></PreviewButton>
      <div className="parent-home__profile"><ProfileAvatar user={user} editProfile onProfileUpdated={setProfileUpdate} className="parent-home__placeholder" /><span title={parentName}>{user?.name?.trim()}</span></div>
      <button type="button" className="parent-home__logout" aria-label="Logout" title="Logout" onClick={handleLogout}><Icon name="logout" /></button>
    </header>
    <aside className="parent-home__welcome">
      <p className="parent-home__eyebrow">A BRIGHTER TOMORROW</p>
      <h1><span className="parent-home__greeting-line">Good</span><span className="parent-home__greeting-line">morning,</span><span className="parent-home__greeting-name" style={{ fontSize: `${Math.min(1, 5 / Array.from(greetingName).reduce((width, letter) => width + (/[MW]/.test(letter) ? 1.6 : 1), 0))}em` }}>{greetingName}! <Icon name="sun" /></span></h1>
      <p className="parent-home__welcome-copy">Every small step you take today helps your child grow happier, kinder and stronger tomorrow.</p>
      <PreviewButton className="parent-home__journey">Continue Your Journey <span>→</span></PreviewButton>
      <blockquote>“Kind<br />Parents<br />Raise<br />Confident<br />Children”</blockquote>
    </aside>
    <main className="parent-home__main">
      <div className="parent-home__grid">
        <div className="parent-home__left-stack">
          <section className="parent-home__card parent-home__children" aria-labelledby="children-title">
            <div className="parent-home__card-heading"><h2 id="children-title"><Icon name="people" />My Children</h2><PreviewButton className="parent-home__add">＋ Add Child</PreviewButton></div>
            {dashboard?.children?.length ? dashboard.children.map((child, index) => <PreviewButton className="parent-home__child" key={index}><Placeholder label="Child portrait placeholder" /><span><strong>{child.name || 'Name unavailable'}</strong><small>{child.age == null ? 'Age unavailable' : `${child.age} years old`}{child.grade != null && <> <span className="parent-home__divider">|</span> Grade {child.grade}</>}</small></span><span className="parent-home__chevron">?</span></PreviewButton>) : <p role="status">{message('children', 'No children added yet.')}</p>}
          </section>
          <section className="parent-home__card parent-home__progress" aria-labelledby="progress-title">
            <div className="parent-home__card-heading"><h2 id="progress-title"><Icon name="chart" />Child's Progress</h2><PreviewButton className="parent-home__period">This Week ⌄</PreviewButton></div>
            <div className="parent-home__progress-body"><div className="parent-home__ring" role="img" aria-label={progress ? `${progress.completed} of ${progress.total} activities completed` : 'Progress unavailable'} style={{ background: `conic-gradient(from -5deg, #205d4e 0%, #073c33 ${progress?.total ? progress.completed / progress.total * 100 : 0}%, #ece0ce 0%)` }}><div><strong>{progress ? `${progress.completed}/${progress.total}` : '?'}</strong><span>Activities<br />Completed</span></div></div><ul className="parent-home__statuses">{[['done', '?', 'completed', 'Completed'], ['ongoing', '?', 'in_progress', 'In Progress'], ['pending', '?', 'pending', 'Pending'], ['skipped', '?', 'skipped', 'Skipped']].map(([style, symbol, key, text]) => <li key={style}><span className={style}>{symbol}</span>{progress ? progress[key] : '?'} {text}</li>)}</ul></div>
            {!progress && <p role="status">{message('progress', 'Progress unavailable.')}</p>}
            {progress?.total === 0 && <p role="status">No activities available this week.</p>}
            <PreviewButton className="parent-home__details">View Progress Details <span>→</span></PreviewButton>
          </section>
          <section className="parent-home__card parent-home__quick" aria-labelledby="quick-title"><h2 id="quick-title"><Icon name="bolt" />Quick Actions</h2><div className="parent-home__tiles">{[['robot', 'AI Guidance'], ['calendar', 'Parenting Plan'], ['game', 'Child Activities'], ['book', 'Stories'], ['leaf', 'Calm Corner'], ['book', 'Educational Content']].map(([icon, label]) => <PreviewButton key={label}><Icon name={icon} /><span>{label}</span></PreviewButton>)}</div></section>
        </div>
        <div className="parent-home__right-stack">
          <section className="parent-home__card parent-home__plan" aria-labelledby="plan-title">
            <div className="parent-home__plan-heading"><Icon name="calendar" /><div><h2 id="plan-title">Today's 7-Day Plan</h2><p>Simple daily activities for a happier tomorrow</p></div><div className="parent-home__date"><PreviewButton aria-label="Previous week">‹</PreviewButton><span>{formatDate(plan?.start_date)}</span><PreviewButton aria-label="Next week">›</PreviewButton></div><PreviewButton className="parent-home__soft-button">View Full Plan <span>→</span></PreviewButton></div>
            <div className="parent-home__days" aria-label="Plan dates">{days.map((day, index) => <PreviewButton key={index} className={day?.toDateString() === new Date().toDateString() ? 'is-selected' : ''}>{day ? day.toLocaleDateString('en-GB', { weekday: 'short' }) : '?'}<strong>{day ? day.getDate() : '?'}</strong></PreviewButton>)}</div>
            <div className="parent-home__activity"><Placeholder label="Boy meditating" /><div className="parent-home__activity-copy"><span className="parent-home__category"><Icon name="calendar" />{activity?.category || activity?.status || '?'}</span><h3>{activity?.title || '?'}</h3><div className="parent-home__activity-meta"><span><Icon name="clock" />{activity?.duration != null ? `${activity.duration} minutes` : '?'}</span><span><Icon name="sun" />{activity?.time || '?'}</span></div><p>{activity?.description || (activity ? '' : plan ? message('activities', 'No activities available yet.') : message('plans', 'No parenting plan available yet.'))}{activity?.date && <> {formatDate(activity.date)}</>}{activity?.status && <> ? {activity.status}</>}</p></div><PreviewButton className="parent-home__round" aria-label="Open activity">?</PreviewButton></div>
            <div className="parent-home__dots" aria-label="Activity availability">{planActivities.map((_, index) => <span key={index} />)}</div>
          </section>
          <section className="parent-home__card parent-home__guidance" aria-labelledby="guidance-title"><div className="parent-home__guidance-heading"><Icon name="spark" /><div><h2 id="guidance-title">AI Guidance for You</h2><p>Get personalised advice based on your child's needs</p></div></div><div className="parent-home__guidance-body"><div className="parent-home__guidance-copy"><h3>{guidance?.title || "?"}</h3><p>{guidance?.description || (guidance ? "Guidance text unavailable." : message("guidance", "No AI guidance available yet."))}</p><PreviewButton className="parent-home__coral-button">Get Guidance <span>→</span></PreviewButton></div><div className="parent-home__guidance-art" role="img" aria-label="Mother embracing her child" /><ul>{guidance?.created_at && <li><Icon name="check" />{formatDate(guidance.created_at)}</li>}</ul></div></section>
        </div>
        <section className="parent-home__card parent-home__learning" aria-labelledby="learning-title"><div className="parent-home__card-heading"><div className="parent-home__learning-heading"><Icon name="book" /><div><h2 id="learning-title">Learning for a Brighter Future</h2><p>Stories, activities and tips based on your child's age and interests.</p></div></div><PreviewButton className="parent-home__soft-button">See All <span>→</span></PreviewButton></div><div className="parent-home__resources">{[0, 1, 2].map(index => <article key={index}><Placeholder label="Learning illustration placeholder" /><div><p>?</p><h3>{index === 0 ? message('learning', 'No learning content available yet.') : '?'}</h3><PreviewButton aria-label="Open learning content">?</PreviewButton></div></article>)}</div></section>
      </div>
    </main>
  </div>;
}
