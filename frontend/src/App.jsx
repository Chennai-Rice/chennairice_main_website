import { MOVED_PAGES } from './seo.js'
import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { CartProvider } from './shop/hooks/useCart.jsx'
import { WishlistProvider } from './shop/hooks/useWishlist.jsx'
import { CookieConsentProvider } from './hooks/useCookieConsent.jsx'
import { useVisitorTracking } from './hooks/useVisitorTracking.jsx'
import { useMetaPixel } from './hooks/useMetaPixel.js'
import { useGoogleAnalytics } from './hooks/useGoogleAnalytics.js'
import { useTagManagerConsent } from './hooks/useTagManagerConsent.js'
import './shop/styles/styles.scoped.css'
import './styles/shop-bridge.css'

import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import SoruKutty from './components/chatbot/SoruKutty.jsx'
import CookieBanner from './components/CookieBanner.jsx'
import ContestPopup from './components/ContestPopup.jsx'

import HomePage from './pages/HomePage.jsx'
import ComingSoonPage from './pages/ComingSoonPage.jsx'
import ContactPage from './pages/ContactPage.jsx'
import TrackOrderPage from './pages/TrackOrderPage.jsx'
import BulkOrderPage from './pages/BulkOrderPage.jsx'
import LandingPage from './pages/LandingPage.jsx'
import { LANDING_PAGES } from './data/landing.js'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage.jsx'
import TermsPage from './pages/TermsPage.jsx'
import ProductsPage from './shop/pages/ProductsPage.jsx'
import ProductDetailPage from './shop/pages/ProductDetailPage.jsx'
import AboutPage from './shop/pages/AboutPage.jsx'
import ContestPage from './shop/pages/ContestPage.jsx'
import FounderPage from './shop/pages/FounderPage.jsx'
import CartPage from './shop/pages/CartPage.jsx'
import CheckoutPage from './shop/pages/CheckoutPage.jsx'
import { isCheckoutEnabled } from './config.js'
import WishlistPage from './shop/pages/WishlistPage.jsx'
import InfrastructurePage from './pages/infrastructure/InfrastructurePage.jsx'

/* Lazily loaded so the dashboard and the Supabase auth code it pulls in stay
   out of the bundle every ordinary shopper downloads — only someone who
   actually opens /admin pays for it. */
const AdminPage = lazy(() => import('./pages/admin/AdminPage.jsx'))
// Staff-only order screen for the mill; loaded only when visited.
const WarehousePage = lazy(() => import('./pages/warehouse/WarehousePage.jsx'))

/* The journal is split out too. It carries its own Markdown renderer, and
   most visitors come for the packs — there is no reason for every one of
   them to download an article reader they never open. */
const BlogListPage = lazy(() => import('./pages/blog/BlogListPage.jsx'))
const BlogPostPage = lazy(() => import('./pages/blog/BlogPostPage.jsx'))

/* Routes that exist in the navigation and footer but whose copy is still
   being written. Listed here so no link in the footer ever 404s. */
const PLACEHOLDER_PAGES = [
  { path: '/our-team', title: 'Our Team', blurb: 'Profiles of the people who run the mill are being put together and will appear here shortly.' },
  { path: '/careers', title: 'Careers', blurb: 'Open roles across our mills, logistics and sales will be listed here. Write to us in the meantime and we will keep your details on file.' },
  { path: '/quality', title: 'Quality', blurb: 'Our sorting, grading and testing process is being documented and will be published here shortly.' },
  { path: '/packaging', title: 'Packaging', blurb: 'Pack sizes, materials and our move to recyclable packaging are being written up for this page.' },
  { path: '/recipes', title: 'Recipes', blurb: 'Family recipes for biryani, pongal, idli and more are being collected and will be shared here.' },
  { path: '/csr', title: 'CSR', blurb: 'Our work with farming families and the community around Erode is being written up for this page.' },
  { path: '/downloads', title: 'Downloads', blurb: 'Product sheets, certifications and trade catalogues will be available to download here.' },
  { path: '/shipping', title: 'Shipping & Delivery', blurb: 'Dispatch timelines, delivery areas and freight terms are on their way to this page.' },
  { path: '/refund', title: 'Refund Policy', blurb: 'Our returns and refund process is being documented and will be published here shortly.' },
]

/** Client routing keeps scroll position between pages; always open at the top,
 *  or at the section a link names (/#faqs). The home page's pinned sections
 *  settle their height after load, so the jump is repeated once they have. */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0)
      return undefined
    }
    const go = () => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
    const timers = [60, 600, 1400].map((ms) => window.setTimeout(go, ms))
    return () => timers.forEach(window.clearTimeout)
  }, [pathname, hash])
  return null
}

/** Visitor analytics — gated on cookie consent inside the hook itself. */
function VisitorTracking() {
  useVisitorTracking()
  return null
}

/** Meta Pixel — only after the visitor accepts marketing cookies. */
function MetaPixel() {
  useMetaPixel()
  return null
}

/** Google Analytics — only after the visitor accepts analytics cookies. */
function GoogleAnalytics() {
  useGoogleAnalytics()
  useTagManagerConsent()
  return null
}

/* The heatmap panel in /admin loads the real site into an iframe so click
   positions can be drawn on top of the layout they were recorded against.
   That embedded copy must not be counted as a visit — the dashboard would
   otherwise appear in its own numbers — and the decorative chrome only
   obscures the overlay, so both are suppressed whenever the app is framed.
   Navigation and footer stay, because clicks landed on them too. */
const isEmbedded = typeof window !== 'undefined' && window.self !== window.top

export default function App() {
  const { pathname } = useLocation()
  /* The dashboard is an internal tool, not part of the storefront. It gets
     none of the marketing chrome, and — importantly — no visitor tracking:
     the analyst reading the numbers must not be counted inside them. */
  /* The one staff portal — analytics and the journal both live behind it.
     It gets no marketing chrome and, importantly, no visitor tracking:
     whoever is reading the numbers or writing the posts must not appear
     inside them. */
  const isTool = pathname.startsWith('/admin') || pathname.startsWith('/warehouse')
  const isStorefront = !isTool && !isEmbedded

  return (
    <CookieConsentProvider>
    <CartProvider>
      <WishlistProvider>
      <ScrollToTop />
      {isStorefront && <VisitorTracking />}
      {isStorefront && <MetaPixel />}
      {isStorefront && <GoogleAnalytics />}
      {!isTool && <Navbar />}
      <Routes>
        {/* Must be declared before the "*" catch-all below, which would
            otherwise redirect /admin straight back to the home page. */}
        <Route
          path="/admin"
          element={
            <Suspense fallback={null}>
              <AdminPage />
            </Suspense>
          }
        />
        <Route
          path="/warehouse"
          element={
            <Suspense fallback={null}>
              <WarehousePage />
            </Suspense>
          }
        />
        <Route path="/" element={<HomePage />} />
        {/* The FAQs live on the home page. */}
        <Route path="/faqs" element={<Navigate to="/#faqs" replace />} />
        <Route path="/rice-products" element={<ProductsPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        {/* The Super Slogan Contest page, opened from the nav's Contest button. */}
        <Route path="/contest" element={<ContestPage />} />
        <Route path="/contact-us" element={<ContactPage />} />
        <Route path="/track-order" element={<TrackOrderPage />} />
        <Route path="/bulk-order" element={<BulkOrderPage />} />
        {/* Topic landing pages and the Tamil pages (SEO sheet Phase 2). */}
        {LANDING_PAGES.map(({ path, key }) => (
          <Route key={path} path={path} element={<LandingPage key={key} id={key} />} />
        ))}
        <Route path="/about-us" element={<AboutPage />} />
        {/* Old addresses (and /home) still land on the right page; firebase.json
            also answers them with a permanent 301 for search engines. */}
        {Object.entries(MOVED_PAGES).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        <Route path="/founder" element={<FounderPage />} />
        <Route path="/infrastructure" element={<InfrastructurePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />

        {/* Writing now lives in the one staff portal at /admin. This
            redirect keeps any saved link working, and must stay declared
            before /blog/:slug, which would otherwise swallow it as a post
            called "studio". */}
        <Route path="/blog/studio" element={<Navigate to="/admin" replace />} />
        <Route
          path="/blog"
          element={
            <Suspense fallback={null}>
              <BlogListPage />
            </Suspense>
          }
        />
        <Route
          path="/blog/:slug"
          element={
            <Suspense fallback={null}>
              <BlogPostPage />
            </Suspense>
          }
        />
        <Route path="/terms" element={<TermsPage />} />
        {PLACEHOLDER_PAGES.map(page => (
          <Route
            key={page.path}
            path={page.path}
            element={<ComingSoonPage title={page.title} blurb={page.blurb} />}
          />
        ))}
        <Route path="/cart" element={<CartPage />} />
        {/* Checkout is built and working, but stays behind VITE_CHECKOUT_ENABLED
            until payments go live. Gating the route (not just the cart button)
            means typing /checkout directly lands on Coming Soon too. */}
        <Route
          path="/checkout"
          element={
            isCheckoutEnabled ? (
              <CheckoutPage />
            ) : (
              <ComingSoonPage
                title="Checkout"
                blurb="Online ordering and payment are almost ready. In the meantime, call or write to us and we will take your order directly."
              />
            )
          }
        />
        <Route
          path="/order-confirmed"
          element={
            isCheckoutEnabled ? (
              <CheckoutPage />
            ) : (
              <ComingSoonPage
                title="Checkout"
                blurb="Online ordering and payment are almost ready. In the meantime, call or write to us and we will take your order directly."
              />
            )
          }
        />
        <Route path="/wishlist" element={<WishlistPage />} />
        {/* legacy deep links from the product-page repo */}
        <Route path="/index.html" element={<Navigate to="/rice-products" replace />} />
        <Route path="/about.html" element={<Navigate to="/about-us" replace />} />
        <Route path="/cart.html" element={<Navigate to="/cart" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!isTool && <Footer />}
      {isStorefront && <SoruKutty />}
      {isStorefront && <CookieBanner />}
      {/* Appears 8 seconds into the visit; once closed, not again for a day. */}
      {isStorefront && <ContestPopup />}
      </WishlistProvider>
    </CartProvider>
    </CookieConsentProvider>
  )
}
