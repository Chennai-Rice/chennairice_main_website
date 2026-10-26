import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import InfraShowcase from './InfraShowcase.jsx'
import InfraJourney from './journey/InfraJourney.jsx'
import useGsapContext from '../../hooks/useGsapContext.js'
import usePageMeta from '../../shop/hooks/usePageMeta.js'
import './infrastructure.css'
import { PAGE_META } from '../../seo.js'

gsap.registerPlugin(ScrollTrigger)

/**
 * Infrastructure — a single editorial showcase: rotating hero, stat strip,
 * capability grid and closing band. All content lives in data/infrastructure.js.
 */
export default function InfrastructurePage() {
  usePageMeta(PAGE_META.infrastructure.title, PAGE_META.infrastructure.description)
  const rootRef = useRef(null)

  useGsapContext(
    () => {
      // Fade/rise reveal for anything tagged .infra-reveal. The hidden state is
      // only armed here, so a failure degrades to "no animation", never
      // "no content".
      gsap.utils.toArray('.infra-reveal').forEach(el => {
        ScrollTrigger.create({
          trigger: el,
          start: 'top 85%',
          once: true,
          onEnter: () => el.classList.add('is-in'),
        })
      })
    },
    rootRef,
    []
  )

  return (
    <main className="infra" ref={rootRef}>
      {/* From Paddy to Packed Rice — the process first (owner, Oct 2026), then the facility showcase. */}
      <InfraJourney />
      <InfraShowcase />
    </main>
  )
}
