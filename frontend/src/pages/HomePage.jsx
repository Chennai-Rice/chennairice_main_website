import Hero from '../components/Hero.jsx'
import ProductsShowcase from '../components/ProductsShowcase.jsx'
import FeatureStrip from '../components/FeatureStrip.jsx'
import Celebrities from '../components/Celebrities.jsx'
import Testimonials from '../components/Testimonials.jsx'
import HomeFaq from '../components/HomeFaq.jsx'
import { HomeIntro, HomeBulk } from '../components/HomeIntro.jsx'
import { showAmbassadors } from '../config.js'
import usePageMeta from '../shop/hooks/usePageMeta.js'
import { PAGE_META } from '../seo.js'

export default function HomePage() {
  usePageMeta(PAGE_META.home.title, PAGE_META.home.description)
  return (
    <main>
      <Hero />
      <HomeIntro />
      <ProductsShowcase />
      <FeatureStrip />
      {/* Brand Ambassadors is behind a switch rather than deleted — the
          section, its copy and its portraits all stay in the repo, so putting
          it back is a change of one environment variable. */}
      {showAmbassadors && <Celebrities />}
      <Testimonials />
      <HomeBulk />
      <HomeFaq />
    </main>
  )
}
