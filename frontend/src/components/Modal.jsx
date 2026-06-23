/**
 * Simple blurred-backdrop modal. Click outside or the close button to dismiss.
 * Used by TradeHistory.jsx to show audit results and the downloadable PnL
 * card without them competing for space with the floating DecisionConsole
 * icon or the page's own layout (the original problem: inline expansion
 * pushed table rows around and collided with the mobile tab bar / console
 * button).
 */
export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 8, 12, 0.7)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg2, #0D1117)',
          border: '1px solid var(--border, #1f2937)',
          borderRadius: '12px',
          maxWidth: '1080px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border, #1f2937)',
            position: 'sticky',
            top: 0,
            background: 'var(--bg2, #0D1117)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--mono, monospace)',
              fontSize: 11,
              color: 'var(--text-dim, #6e7681)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim, #6e7681)',
              fontSize: 18,
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '16px' }}>{children}</div>
      </div>
    </div>
  );
}