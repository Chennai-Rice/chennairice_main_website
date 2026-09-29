import Hero from '../components/Hero.jsx'
import ProductsShowcase from '../components/ProductsShowcase.jsx'
import FeatureStrip from '../components/FeatureStrip.jsx'
import Celebrities from '../components/Celebrities.jsx'
import Testimonials from '../components/Testimonials.jsx'
import { showAmbassadors } from '../config.js'
import usePageMeta from '../shop/hooks/usePageMeta.js'

export default function HomePage() {
  usePageMeta('Chennai Rice Industries — Finest Rice, Finest Life', 'Ponni, Sappadu and Rajabhogam rice milled and sealed at our own facility in Erode, Tamil Nadu. Packs from 5 kg to 26 kg.')
  return (
    <main>
      <Hero />
      <ProductsShowcase />
      <FeatureStrip />
      {/* Brand Ambassadors is behind a switch rather than deleted — the
          section, its copy and its portraits all stay in the repo, so putting
          it back is a change of one environment variable. */}
      {showAmbassadors && <Celebrities />}
      <Testimonials />
    </main>
  )
}
