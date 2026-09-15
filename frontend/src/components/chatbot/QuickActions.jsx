import { QUICK_ACTIONS } from '../../data/chatbot.js'
import { QUICK_ACTION_ICONS } from './icons.jsx'

export function QuickActionsGrid({ onSelect }) {
  return (
    <div className="sk-quick-actions">
      {QUICK_ACTIONS.map((action, index) => {
        const Icon = QUICK_ACTION_ICONS[action.icon]
        return (
          <button
            key={action.id}
            type="button"
            className="sk-quick-btn"
            style={{ animationDelay: `${index * 0.06}s` }}
            onClick={() => onSelect(action.prompt)}
          >
            {Icon && <Icon />}
            <span>{action.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Reusable pill row for branch options (cooking type, nutrition variety, etc). */
export function OptionPills({ options, onSelect, label }) {
  return (
    <div className="sk-cooking-options" role="group" aria-label={label}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          className="sk-cooking-btn"
          onClick={() => onSelect(option.prompt)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
