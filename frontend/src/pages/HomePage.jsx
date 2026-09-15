import Hero from '../components/Hero.jsx'
import ProductsShowcase from '../components/ProductsShowcase.jsx'
import FeatureStrip from '../components/FeatureStrip.jsx'
import Celebrities from '../components/Celebrities.jsx'
import Testimonials from '../components/Testimonials.jsx'

export default function HomePage() {
  return (
    <main>
      <Hero />
      <ProductsShowcase />
      <FeatureStrip />
      <Celebrities />
      <Testimonials />
    </main>
  )
}
