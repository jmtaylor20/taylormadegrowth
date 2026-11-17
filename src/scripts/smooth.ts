// Sitewide smooth scrolling (Lenis). One shared instance so the homepage
// scroll story and the layout never create two scrollers.
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

let lenis: Lenis | null = null;

export function initSmooth(): Lenis | null {
  if (lenis) return lenis;
  if (typeof window === 'undefined') return null;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;

  lenis = new Lenis({
    lerp: 0.09,
    smoothWheel: true,
    anchors: { offset: -16 },
  });

  const raf = (time: number) => {
    lenis?.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  return lenis;
}

export function getLenis(): Lenis | null {
  return lenis;
}
