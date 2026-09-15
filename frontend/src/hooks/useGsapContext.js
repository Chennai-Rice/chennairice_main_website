import { useLayoutEffect } from 'react'
import gsap from 'gsap'

/**
 * Runs a GSAP setup inside a scoped context and reverts it on cleanup, so
 * StrictMode double-mounts and HMR never leave a stale pin or tween behind.
 */
export default function useGsapContext(setup, scopeRef, deps = []) {
  useLayoutEffect(() => {
    const ctx = gsap.context(setup, scopeRef)
    return () => ctx.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
