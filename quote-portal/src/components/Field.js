// Field component (ES module)
export default function Field({ label, children, help, className, style }) {
  const cls = ['card', className].filter(Boolean).join(' ')
  return React.createElement('div', { className: cls, style },
    React.createElement('label', null, label),
    children,
    help ? React.createElement('div', { className: 'help', style: { marginTop: 6 } }, help) : null
  )
}

