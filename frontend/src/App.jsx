import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import Navbar from './components/Navbar.jsx';
import Landing from './pages/Landing.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CreateStrategy from './pages/CreateStrategy.jsx';
import BacktestResults from './pages/BacktestResults.jsx';
import BotDetail from './pages/BotDetail.jsx';
import Signals from './pages/Signals.jsx';
import Bots from './pages/Bots.jsx';
import QwenAnalysis from './pages/QwenAnalysis.jsx';
import TradeHistory from './pages/TradeHistory.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pathname]);
  return null;
}

function AnimatedPage({ children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    });
  }, []);

  // Scroll reveal
  useEffect(() => {
    const cards = document.querySelectorAll('[data-reveal]');
    if (!cards.length) return;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    cards.forEach(card => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(24px)';
      card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      observer.observe(card);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {children}
    </div>
  );
}

export default function App() {
  const location = useLocation();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg0)' }}>
      <Navbar />
      <ScrollToTop />
      <AnimatedPage key={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/bots" element={<Bots />} />
          <Route path="/create" element={<CreateStrategy />} />
          <Route path="/backtest" element={<BacktestResults />} />
          <Route path="/bot/:id" element={<BotDetail />} />
          <Route path="/signals" element={<Signals />} />
          <Route path="/qwen" element={<QwenAnalysis />} />
          <Route path="/history" element={<TradeHistory />} />
        </Routes>
      </AnimatedPage>
    </div>
  );
}