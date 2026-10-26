import { Link } from 'react-router-dom';
import logo from '../../assets/logo/985dc272-7657-42a7-aa1e-fd9ad04c085f.png';
import wordmark from '../../assets/logo/juvcare-wordmark.png';
import './Home.css';

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
    check: <path d="m5 12 4 4 10-10" />,
  };
  return <svg className={`parent-home__icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

function PreviewButton({ children, className = '', ...props }) {
  return <button type="button" disabled className={className} {...props}>{children}</button>;
}
function Placeholder({ className = '', label }) {
  return <div className={`parent-home__placeholder ${className}`} role="img" aria-label={label} />;
}

export default function Home({ user }) {
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
      <PreviewButton className="parent-home__notification" aria-label="Notifications (preview only)"><Icon name="bell" /><span>3</span></PreviewButton>
      <PreviewButton className="parent-home__profile"><Placeholder label="Parent portrait placeholder" /><span>{parentName}<small>Parent</small></span></PreviewButton>
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
            {[[ 'Aarav', '6', '1'], ['Kavin', '7', '2']].map(([name, age, grade]) => <PreviewButton className="parent-home__child" key={name}><Placeholder label={`${name} portrait placeholder`} /><span><strong>{name}</strong><small>{age} years old <span className="parent-home__divider">|</span> Grade {grade}</small></span><span className="parent-home__chevron">›</span></PreviewButton>)}
          </section>
          <section className="parent-home__card parent-home__progress" aria-labelledby="progress-title">
            <div className="parent-home__card-heading"><h2 id="progress-title"><Icon name="chart" />Child's Progress</h2><PreviewButton className="parent-home__period">This Week ⌄</PreviewButton></div>
            <div className="parent-home__progress-body"><div className="parent-home__ring" role="img" aria-label="Sample progress: 3 of 5 activities completed"><div><strong>3/5</strong><span>Activities<br />Completed</span></div></div><ul className="parent-home__statuses">{[['done', '✓', '2 Completed'], ['ongoing', '◷', '1 In Progress'], ['pending', '›', '2 Pending'], ['skipped', '×', '0 Skipped']].map(([style, symbol, text]) => <li key={style}><span className={style}>{symbol}</span>{text}</li>)}</ul></div>
            <PreviewButton className="parent-home__details">View Progress Details <span>→</span></PreviewButton>
          </section>
          <section className="parent-home__card parent-home__quick" aria-labelledby="quick-title"><h2 id="quick-title"><Icon name="bolt" />Quick Actions</h2><div className="parent-home__tiles">{[['robot', 'AI Guidance'], ['calendar', 'Parenting Plan'], ['game', 'Child Activities'], ['book', 'Stories'], ['leaf', 'Calm Corner'], ['book', 'Educational Content']].map(([icon, label]) => <PreviewButton key={label}><Icon name={icon} /><span>{label}</span></PreviewButton>)}</div></section>
        </div>
        <div className="parent-home__right-stack">
          <section className="parent-home__card parent-home__plan" aria-labelledby="plan-title">
            <div className="parent-home__plan-heading"><Icon name="calendar" /><div><h2 id="plan-title">Today's 7-Day Plan</h2><p>Simple daily activities for a happier tomorrow</p></div><div className="parent-home__date"><PreviewButton aria-label="Previous week">‹</PreviewButton><span>14 Apr 2025</span><PreviewButton aria-label="Next week">›</PreviewButton></div><PreviewButton className="parent-home__soft-button">View Full Plan <span>→</span></PreviewButton></div>
            <div className="parent-home__days" aria-label="Sample week, 14–20 April 2025">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => <PreviewButton key={day} className={index === 0 ? 'is-selected' : ''}>{day}<strong>{14 + index}</strong></PreviewButton>)}</div>
            <div className="parent-home__activity"><Placeholder label="Boy meditating" /><div className="parent-home__activity-copy"><span className="parent-home__category"><Icon name="calendar" />Feelings &amp; Emotions</span><h3>Listen with Patience</h3><div className="parent-home__activity-meta"><span><Icon name="clock" />15 minutes</span><span><Icon name="sun" />Evening</span></div><p>A simple activity to help your child express their feelings and feel heard.</p></div><PreviewButton className="parent-home__round" aria-label="Open sample activity">→</PreviewButton></div>
            <div className="parent-home__dots" aria-label="Sample activity 1 of 4"><span /><span /><span /><span /></div>
          </section>
          <section className="parent-home__card parent-home__guidance" aria-labelledby="guidance-title"><div className="parent-home__guidance-heading"><Icon name="spark" /><div><h2 id="guidance-title">AI Guidance for You</h2><p>Get personalised advice based on your child's needs</p></div></div><div className="parent-home__guidance-body"><div className="parent-home__guidance-copy"><h3>Building<br /><span>Calm Connections</span></h3><p>Practical ways to understand your child's behaviour and create a more peaceful home.</p><PreviewButton className="parent-home__coral-button">Get Guidance <span>→</span></PreviewButton></div><div className="parent-home__guidance-art" role="img" aria-label="Mother embracing her child" /><ul>{['Understand behaviour', 'Get practical tips', 'Improve communication', 'Build positive routines'].map(item => <li key={item}><Icon name="check" />{item}</li>)}</ul></div></section>
        </div>
        <section className="parent-home__card parent-home__learning" aria-labelledby="learning-title"><div className="parent-home__card-heading"><div className="parent-home__learning-heading"><Icon name="book" /><div><h2 id="learning-title">Learning for a Brighter Future</h2><p>Stories, activities and tips based on your child's age and interests.</p></div></div><PreviewButton className="parent-home__soft-button">See All <span>→</span></PreviewButton></div><div className="parent-home__resources">{[['Story', '3–5 years', 'A Little Cat Learns to Take a Break'], ['Tips', 'For Parents', 'Everyday Kindness Tips for Parents'], ['Video', '4 min', 'Calm Down Breathing for Kids']].map(([type, age, title]) => <article key={title}><Placeholder label={`${type} illustration placeholder`} /><div><p><span>{type}</span> · {age}</p><h3>{title}</h3><PreviewButton aria-label={`Open ${title}`}>→</PreviewButton></div></article>)}</div></section>
      </div>
    </main>
  </div>;
}
