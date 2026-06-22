export default function Badge({ status }) {
  const map = {
    active: {
      cls: { background: 'rgba(0,214,143,0.1)', color: '#00D68F', border: '1px solid rgba(0,214,143,0.25)' },
      label: 'Active',
    },
    paused: {
      cls: { background: 'rgba(245,166,35,0.1)', color: '#F5A623', border: '1px solid rgba(245,166,35,0.25)' },
      label: 'Paused',
    },
    backtesting: {
      cls: { background: 'rgba(27,111,248,0.1)', color: '#1B6FF8', border: '1px solid rgba(27,111,248,0.25)' },
      label: 'Backtesting',
    },
  };

  const { cls, label } = map[status] || map.backtesting;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 500,
      fontFamily: 'var(--mono)',
      ...cls,
    }}>
      <span style={{
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: 'currentColor',
      }} />
      {label}
    </span>
  );
}