import Ornament from './Ornament.jsx'

/**
 * Centered section header: gold ornamented label + big serif title
 * + small divider ornament under the title (as in the reference design).
 */
export default function SectionHead({ label, title, divider = true }) {
  return (
    <div className="section-head" style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
      <div className="section-label">
        <Ornament />
        <span>{label}</span>
        <Ornament flip />
      </div>
      <h2 className="section-title">{title}</h2>
      {divider && (
        <svg width="60" height="10" viewBox="0 0 60 10" fill="none" aria-hidden="true">
          <path d="M0 5h22" stroke="#c69a3f" strokeWidth="1" />
          <circle cx="30" cy="5" r="3" stroke="#c69a3f" strokeWidth="1" fill="none" />
          <path d="M38 5h22" stroke="#c69a3f" strokeWidth="1" />
        </svg>
      )}
    </div>
  )
}
