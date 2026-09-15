import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import Img from './Img.jsx'
import { useCart } from '../shop/hooks/useCart.jsx'
import { useWishlist } from '../shop/hooks/useWishlist.jsx'
import { ASSETS, NAV_LINKS, NAV_CTA } from '../data/content.js'
import './navbar.css'

/* Counts above 9 would burst the badge circle, so they cap at 9+. */
const badge = n => (n > 9 ? '9+' : String(n))

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { count: cartCount } = useCart()
  const { count: savedCount } = useWishlist()

  // Only the home page has a dark hero behind the bar. Every other route is
  // cream, where the light nav text would be unreadable while transparent.
  const isHome = pathname === '/'
  const solid = scrolled || !isHome

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setOpen(false), [pathname])

  return (
    <header className={`nav-bar${solid ? ' nav-solid' : ''}`}>
      <div className="container nav-inner">
        <Link className="nav-logo" to="/" aria-label="Chennai Rice home">
          <Img src={ASSETS.logo} alt="Chennai Rice Industries" />
        </Link>

        <nav className="nav-links">
          {NAV_LINKS.map(link => (
            <NavLink
              key={link.label}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) => (isActive ? 'nav-link nav-active' : 'nav-link')}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="nav-actions">
          <Link
            className="nav-icon"
            to="/wishlist"
            aria-label={savedCount ? `Saved items, ${savedCount} saved` : 'Saved items'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 20s-7-4.35-9.5-8.5C1 8 2.5 4.5 6 4c2-.3 3.8.8 6 3 2.2-2.2 4-3.3 6-3 3.5.5 5 4 3.5 7.5C19 15.65 12 20 12 20z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            {savedCount > 0 && <span className="nav-badge">{badge(savedCount)}</span>}
          </Link>

          <Link
            className="nav-icon"
            to="/cart"
            aria-label={cartCount ? `Cart, ${cartCount} items` : 'Cart'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 4h2.2l2 11.2a1.6 1.6 0 0 0 1.6 1.3h8.5a1.6 1.6 0 0 0 1.6-1.25L20.5 8H6.2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="10" cy="20" r="1.4" fill="currentColor" />
              <circle cx="17" cy="20" r="1.4" fill="currentColor" />
            </svg>
            {cartCount > 0 && <span className="nav-badge">{badge(cartCount)}</span>}
          </Link>
        </div>

        <Link className="nav-cta" to={NAV_CTA.to}>
          {NAV_CTA.label}
        </Link>

        <button
          className="nav-burger"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {open && (
        <div className="nav-mobile">
          {NAV_LINKS.map(link => (
            <Link key={link.label} to={link.to} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
          <Link to="/wishlist" onClick={() => setOpen(false)}>
            Saved Items{savedCount > 0 ? ` (${savedCount})` : ''}
          </Link>
          <Link to="/cart" onClick={() => setOpen(false)}>
            Cart{cartCount > 0 ? ` (${cartCount})` : ''}
          </Link>
          <Link className="nav-mobile-cta" to={NAV_CTA.to} onClick={() => setOpen(false)}>
            {NAV_CTA.label}
          </Link>
        </div>
      )}
    </header>
  )
}
