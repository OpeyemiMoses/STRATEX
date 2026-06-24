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
import DecisionConsole from './components/DecisionConsole.jsx'; // NEW (#5)

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
    el.style.transform = 'translateY(48px)';
    el.style.transition = 'opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1), transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)';
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

    cards.forEach((card, i) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(40px)';
      card.style.transition = `opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1) ${i % 6 * 0.06}s, transform 0.55s cubic-bezier(0.22, 1, 0.36, 1) ${i % 6 * 0.06}s`;
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
      {/* Mounted outside AnimatedPage so it persists across route changes
          instead of fading in/out on every navigation (#5) */}
      <DecisionConsole />
    </div>
  );
}