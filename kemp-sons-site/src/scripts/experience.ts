import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * Wires smooth scrolling (Lenis), scroll-linked animation (GSAP ScrollTrigger)
 * and the 3D stage together. Each `[data-stage]` section advances the 3D
 * story by one step as it scrolls into view.
 */
export async function initExperience() {
  gsap.registerPlugin(ScrollTrigger)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Smooth scrolling, skipped for people who ask for reduced motion.
  let lenis: Lenis | null = null
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.1, anchors: { offset: -80 }, autoRaf: false })
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add((time) => lenis!.raf(time * 1000))
    gsap.ticker.lagSmoothing(0)
  }

  // Text reveals (set up first, so text never waits on the 3D code)
  if (!reduced) {
    ScrollTrigger.batch('.reveal', {
      start: 'top 88%',
      once: true,
      onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, overwrite: true }),
    })
  }

  // 3D stage
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null
  // Three.js loads after the page's text so the first paint stays fast.
  const { createScene } = await import('./scene')
  const exp = canvas ? createScene(canvas, { reducedMotion: reduced }) : null
  if (!exp) document.documentElement.classList.add('no-webgl')

  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-stage]'))
  // Text sits on the opposite side of the 3D object.
  exp?.setSide(sections.map((s) => (s.classList.contains('right') ? -1 : 1)))
  exp?.setCopy(sections.map((s) => s.querySelector<HTMLElement>('.copy')))
  const progress = sections.map(() => 0)
  sections.forEach((section, i) => {
    if (i === 0) return
    ScrollTrigger.create({
      trigger: section,
      start: 'top 85%',
      end: 'top 25%',
      onUpdate: (self) => {
        progress[i] = self.progress
        exp?.setStage(progress.reduce((a, b) => a + b, 0))
      },
    })
  })

  // Fade the 3D stage out once the solid sections (form, visit, footer) take over.
  const quote = document.getElementById('custom')
  if (canvas && quote) {
    ScrollTrigger.create({
      trigger: quote,
      start: 'top 70%',
      end: 'top 10%',
      onUpdate: (self) => { canvas.style.opacity = String(1 - self.progress) },
    })
  }

  // Re-measure once fonts and images settle.
  window.addEventListener('load', () => ScrollTrigger.refresh())
}
