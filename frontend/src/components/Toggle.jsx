export default function Toggle({ checked, onChange }) {
  return (
    <label style={{
      position: 'relative',
      width: 36,
      height: 20,
      cursor: 'pointer',
      display: 'inline-block',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
      />
      <div style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 10,
        background: checked ? 'var(--blue)' : 'var(--bg3)',
        border: `1px solid ${checked ? 'var(--blue)' : 'var(--border)'}`,
        transition: '0.2s',
      }} />
      <div style={{
        position: 'absolute',
        top: 3,
        left: checked ? 19 : 3,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: checked ? '#fff' : 'var(--text-dim)',
        transition: '0.2s',
      }} />
    </label>
  );
}