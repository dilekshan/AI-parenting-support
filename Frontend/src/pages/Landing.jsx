import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import profileImage from '../assets/images/how-it-works-profile.png';
import robotImage from '../assets/images/how-it-works-robot.png';
import familyImage from '../assets/images/how-it-works-family.png';
import aboutImage from '../assets/images/about-family.png';
import wordmark from '../assets/logo/juvcare-wordmark.png';
import originalLogo from '../assets/logo/985dc272-7657-42a7-aa1e-fd9ad04c085f.png';
import './Landing.css';

function FeatureIcon({ type }) {
  const paths = {
    family: <><circle cx="12" cy="7" r="4" /><path d="M6 21v-3a6 6 0 0 1 12 0v3ZM5 5a3.5 3.5 0 0 0 0 7M19 5a3.5 3.5 0 0 1 0 7M5 14a5 5 0 0 0-4 5v1h3M19 14a5 5 0 0 1 4 5v1h-3" /></>,
    book: <><path d="M12 5C9 3 5 2 2 4v17c3-2 7-1 10 1 3-2 7-3 10-1V4c-3-2-7-1-10 1Zm0 0v17" /><path d="M4 18c2-1 5 0 6 1m4 0c2-1 4-2 6-1" /></>,
    calendar: <><path d="M8 2v5M17 2v5M21 13V5H3v17h10M3 10h18M7 14h1m4 0h1m-6 4h1" /><circle cx="19" cy="19" r="4" /><path d="M19 17v2l1 1" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-9.6a5.5 5.5 0 0 0 0-7.8Z" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg>;
}

const features = [
  ['family', 'Personalized', 'AI Guidance'],
  ['book', 'Practical', 'Parenting Activities'],
  ['calendar', 'Simple', 'Parenting Plans'],
  ['heart', 'A Happier', 'Tomorrow'],
];

export default function Landing() {
  const [activeSection, setActiveSection] = useState('home');
  useEffect(() => {
    const sections = ['home', 'how-it-works', 'about'].map(id => document.getElementById(id));
    const footer = document.getElementById('footer');
    let frame = 0;
    const update = () => {
      frame = 0;
      const headerHeight = document.querySelector('.juv-landing__header').getBoundingClientRect().height;
      const offset = headerHeight + 24;
      let current = 'home';
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= offset) current = section.id;
      }
      const footerBounds = footer.getBoundingClientRect();
      const scrollRoot = document.scrollingElement || document.documentElement;
      const atBottom = scrollRoot.scrollTop + scrollRoot.clientHeight >= scrollRoot.scrollHeight - 2;
      const aboutBounds = sections[2].getBoundingClientRect();
      // A footer preview below About must not override the current section.
      // Short footers cannot reach the header: accept their final scroll position
      // only after the beginning of About has scrolled behind the fixed navbar.
      const reachedFooter = footerBounds.top <= offset;
      const reachedShortFooter = atBottom && footerBounds.bottom <= window.innerHeight + 2
        && aboutBounds.top < headerHeight - 24;
      if (reachedFooter || reachedShortFooter) current = 'footer';
      setActiveSection(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);
  return (
    <div className="juv-landing">
      <header className="juv-landing__header">
        <a className="juv-landing__brand" href="#home" aria-label="JuvCare home">
          <img className="juv-landing__original-logo" src={originalLogo} alt="" />
          <img src={wordmark} alt="JuvCare" />
        </a>
        <nav className="juv-landing__nav" aria-label="Main navigation">
          <a href="#home" aria-current={activeSection === 'home' ? 'location' : undefined}>Home</a>
          <a href="#how-it-works" aria-current={activeSection === 'how-it-works' ? 'location' : undefined}>How It Works</a>
          <a href="#about" aria-current={activeSection === 'about' ? 'location' : undefined}>About</a>
          <a href="#footer" aria-current={activeSection === 'footer' ? 'location' : undefined}>Footer</a>
        </nav>
      </header>
      <main>
      <section id="home" className="juv-landing__hero" aria-label="Welcome to JuvCare">
        <div className="juv-landing__content">
          <p className="juv-landing__eyebrow">A BRIGHTER TOMORROW FOR EVERY FAMILY</p>
          <h1><span>Parenting Is a Journey.</span><span>You Don't Have to Walk</span><span>It Alone.</span></h1>
          <p className="juv-landing__description">JuvCare supports parents with personalized AI guidance,<br className="juv-landing__desktop-break" /> practical activities, and thoughtful parenting plans for a<br className="juv-landing__desktop-break" /> brighter tomorrow.</p>
          <Link className="juv-landing__start" to="/login">Get Started <span aria-hidden="true">→</span></Link>
          <ul className="juv-landing__features" aria-label="JuvCare benefits">
            {features.map(([type, first, second]) => <li key={type}>
              <span className="juv-landing__icon"><FeatureIcon type={type} /></span>
              <span>{first}<br />{second}</span>
            </li>)}
          </ul>
        </div>
      </section>
      <section id="how-it-works" className="juv-landing__how" aria-labelledby="how-title">
        <p className="juv-landing__section-kicker">HOW IT WORKS</p>
        <h2 id="how-title">Simple Steps. Meaningful Support.</h2>
        <p className="juv-landing__how-intro">JuvCare makes parenting support easy, personalized, and effective —<br className="juv-landing__wide-break" /> so you can focus on what matters most.</p>
        <ol className="juv-landing__steps">
          {[
            [profileImage, 'Create Your Profile', "Tell us a bit about your family, your child's age, and your goals."],
            [robotImage, 'Get Personalized Guidance', 'Receive AI-powered insights, practical activities, and tailored parenting plans.'],
            [familyImage, 'Grow Together', 'Build confidence, create meaningful moments, and enjoy a brighter tomorrow.'],
          ].map(([image, title, description], index) => <li key={title}>
            <div className="juv-landing__step-art"><img src={image} alt="" /><span className="juv-landing__step-number">{index + 1}</span></div>
            <h3>{title}</h3><p>{description}</p>
          </li>)}
        </ol>
      </section>
      <section id="about" className="juv-landing__about" aria-labelledby="about-title">
        <div className="juv-landing__about-copy">
          <p className="juv-landing__section-kicker">ABOUT JUVCARE</p>
          <h2 id="about-title">Support for Real Parents.<br /><span>A Brighter Tomorrow.</span></h2>
          <p>JuvCare is an AI-powered parenting companion designed to support families at every stage of their journey. We combine trusted knowledge, practical tools, and personalized guidance to help parents feel more confident, prepared, and connected with their children.</p>
          <p>Because every family is unique, and every child deserves a brighter tomorrow.</p>
        </div>
        <div className="juv-landing__about-art"><img src={aboutImage} alt="A mother cuddling her smiling child" /></div>
      </section>
      </main>
      <footer id="footer" className="juv-landing__footer">
        <div className="juv-landing__footer-columns">
          <div className="juv-landing__footer-intro">
            <p className="juv-landing__footer-tagline">A Brighter Tomorrow for Every Family.</p>
            <p>Helping parents feel supported, confident and connected through every step of their parenting journey.</p>
            <p className="juv-landing__footer-care">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /><path d="m12 5.7-4 4a2 2 0 0 0 3 2l2-2 5 5M7 16l2-2m1 5 2-2" /></svg>
              <span>Made with care for every family</span>
            </p>
          </div>
          <nav className="juv-landing__footer-explore" aria-label="Footer navigation">
            <h2>Explore</h2>
            <a href="#home" aria-current={activeSection === 'home' ? 'location' : undefined}>Home</a>
            <a href="#how-it-works" aria-current={activeSection === 'how-it-works' ? 'location' : undefined}>How It Works</a>
            <a href="#about">About JuvCare</a>
            <a href="#footer">Footer</a>
          </nav>
          <div>
            <h2>Our Promise</h2>
            <ul className="juv-landing__footer-promise">
              {['Parent-focused', 'Personalized guidance', 'Practical activities'].map(item => <li key={item}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>
                <span>{item}</span>
              </li>)}
            </ul>
          </div>
        </div>
        <div className="juv-landing__footer-bottom">
          <p>© 2026 JuvCare. All rights reserved.</p>
          <p>Growing together, one day at a time</p>
        </div>
      </footer>
    </div>
  );
}
