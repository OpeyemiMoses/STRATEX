import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// Toast types: 'success' | 'error' | 'warning' | 'info' | 'confirm'
const COLORS = {
  success: { bg: 'rgba(0,214,143,0.1)', border: 'rgba(0,214,143,0.3)', icon: '✓', color: 'var(--green)' },
  error:   { bg: 'rgba(255,77,106,0.1)', border: 'rgba(255,77,106,0.3)', icon: '✕', color: 'var(--red)' },
  warning: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: '⚠', color: '#F59E0B' },
  info:    { bg: 'rgba(27,111,248,0.1)',  border: 'rgba(27,111,248,0.3)', icon: 'ℹ', color: 'var(--blue)' },
  confirm: { bg: 'rgba(27,111,248,0.08)', border: 'rgba(27,111,248,0.25)', icon: '⚡', color: 'var(--blue)' },
};

let _setToasts = null;
let _id = 0;

// Global imperative API — call from anywhere without prop drilling
export const toast = {
  success: (msg, duration = 3000) => _add('success', msg, duration),
  error:   (msg, duration = 4000) => _add('error',   msg, duration),
  warning: (msg, duration = 3500) => _add('warning', msg, duration),
  info:    (msg, duration = 3000) => _add('info',    msg, duration),
  // Returns a Promise<boolean> — resolves true on confirm, false on cancel
  confirm: (msg) => new Promise(resolve => _add('confirm', msg, 0, resolve)),
};

function _add(type, message, duration, resolve = null) {
  if (!_setToasts) return;
  const id = ++_id;
  _setToasts(prev => [...prev, { id, type, message, duration, resolve }]);
  return id;
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  _setToasts = setToasts;

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return createPortal(
    <div style={{
      position: 'fixed', top: 72, right: 16, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      maxWidth: 360, width: 'calc(100vw - 32px)',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onRemove={remove} />
      ))}
    </div>,
    document.body
  );
}

function ToastItem({ toast: t, onRemove }) {
  const c = COLORS[t.type];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const showTimer = setTimeout(() => setVisible(true), 10);
    // Auto-dismiss for non-confirm toasts
    if (t.duration > 0) {
      const hideTimer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => onRemove(t.id), 300);
      }, t.duration);
      return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
    }
    return () => clearTimeout(showTimer);
  }, []);

  const handleConfirm = (result) => {
    t.resolve?.(result);
    setVisible(false);
    setTimeout(() => onRemove(t.id), 300);
  };

  return (
    <div style={{
      background: '#0D1117',
      border: `1px solid ${c.border}`,
      borderLeft: `3px solid ${c.color}`,
      borderRadius: 8,
      padding: '12px 14px',
      fontFamily: 'var(--mono)',
      fontSize: 12,
      color: 'var(--text)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      pointerEvents: 'all',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateX(0)' : 'translateX(20px)',
      transition: 'opacity 0.25s ease, transform 0.25s ease',
      lineHeight: 1.5,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ color: c.color, fontSize: 14, flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
        <span style={{ flex: 1, color: 'var(--text-mid)' }}>{t.message}</span>
        {t.type !== 'confirm' && (
          <button
            onClick={() => { setVisible(false); setTimeout(() => onRemove(t.id), 300); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0 }}
          >
            ✕
          </button>
        )}
      </div>
      {t.type === 'confirm' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={() => handleConfirm(false)}
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 5, color: 'var(--text-dim)', padding: '5px 14px',
              fontSize: 11, cursor: 'pointer', fontFamily: 'var(--mono)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => handleConfirm(true)}
            style={{
              background: 'var(--blue)', border: 'none',
              borderRadius: 5, color: '#fff', padding: '5px 14px',
              fontSize: 11, cursor: 'pointer', fontFamily: 'var(--mono)', fontWeight: 600,
            }}
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}