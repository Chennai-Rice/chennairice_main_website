/* Minimal line icons used across the Soru Kutty chatbot. No external icon
   library — matches the project's existing inline-SVG convention. */

export const RiceGrainIcon = props => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M12 3c3.5 3 5.5 7 5.5 10.5a5.5 5.5 0 11-11 0C6.5 10 8.5 6 12 3z"
      fill="currentColor"
    />
    <path d="M12 3c1.2 3 1.6 7 1.2 11" stroke="rgba(0,0,0,0.15)" strokeWidth="1" strokeLinecap="round" />
  </svg>
)

export const CloseIcon = props => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

export const MinimizeIcon = props => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path d="M6 12h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

export const PlusIcon = props => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

export const MicIcon = props => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

export const SendIcon = props => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const SearchIcon = props => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M20 20l-4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

export const LeafIcon = props => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M5 19c2-4 6-8 10-10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

export const PotIcon = props => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path d="M4 10h16l-1.5 8a2 2 0 01-2 1.7H7.5a2 2 0 01-2-1.7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M2 10h20M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

export const BookIcon = props => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path d="M5 4.5A1.5 1.5 0 016.5 3H19v16H6.5A1.5 1.5 0 005 20.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9 8h6M9 11h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

export const StarIcon = props => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M12 3l2.6 5.9L21 9.7l-4.6 4.2 1.2 6.1L12 16.9l-5.6 3.1 1.2-6.1L3 9.7l6.4-.8z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
)

export const TruckIcon = props => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path d="M2 7h11v10H2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M13 10h5l3 3v4h-8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="6.5" cy="18" r="1.6" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="17" cy="18" r="1.6" stroke="currentColor" strokeWidth="1.4" />
  </svg>
)

export const QUICK_ACTION_ICONS = {
  search: SearchIcon,
  leaf: LeafIcon,
  pot: PotIcon,
  book: BookIcon,
  star: StarIcon,
  truck: TruckIcon,
}
