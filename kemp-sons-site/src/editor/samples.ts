/**
 * Soft illustrated scenes drawn on a canvas, used only to fill photo frames
 * in gallery thumbnails. Original artwork, no stock photos.
 */

type Scene = 'dawn' | 'snow' | 'meadow' | 'lake' | 'dusk' | 'garden'
export const SCENES: Scene[] = ['dawn', 'meadow', 'lake', 'garden', 'dusk', 'snow']

const cache = new Map<Scene, string>()

function hills(g: CanvasRenderingContext2D, S: number, base: number, amp: number, color: string, phase: number) {
  g.fillStyle = color
  g.beginPath()
  g.moveTo(0, S)
  for (let x = 0; x <= S; x += 8) g.lineTo(x, base + Math.sin(x / S * Math.PI * 1.6 + phase) * amp + Math.sin(x / S * 7 + phase) * amp * 0.25)
  g.lineTo(S, S)
  g.closePath()
  g.fill()
}

export function sampleScene(scene: Scene): string {
  const hit = cache.get(scene)
  if (hit) return hit
  const S = 800
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const sky = (top: string, bottom: string) => {
    const gr = g.createLinearGradient(0, 0, 0, S)
    gr.addColorStop(0, top)
    gr.addColorStop(1, bottom)
    g.fillStyle = gr
    g.fillRect(0, 0, S, S)
  }
  const sun = (x: number, y: number, r: number, color: string) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 3)
    gr.addColorStop(0, color)
    gr.addColorStop(0.3, color)
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, S, S)
  }
  switch (scene) {
    case 'dawn':
      sky('#a9c0d6', '#f6d6b8')
      sun(560, 470, 60, 'rgba(255,240,215,0.95)')
      hills(g, S, 520, 40, '#9fb2c4', 0.4)
      hills(g, S, 590, 45, '#7f97ab', 2.1)
      hills(g, S, 670, 35, '#5f778c', 4)
      break
    case 'dusk':
      sky('#4e5d86', '#e9b39a')
      sun(300, 520, 55, 'rgba(255,214,170,0.9)')
      hills(g, S, 560, 50, '#6a6f8f', 1)
      hills(g, S, 650, 40, '#4a5070', 3)
      break
    case 'meadow':
      sky('#9ec5e4', '#e8f1f2')
      hills(g, S, 500, 35, '#a9c79a', 0.2)
      hills(g, S, 590, 40, '#86ad78', 2.5)
      hills(g, S, 690, 30, '#6a9460', 5)
      break
    case 'lake': {
      sky('#b6cfe0', '#f1e9dc')
      hills(g, S, 430, 45, '#8aa3a0', 1.2)
      g.fillStyle = '#9cb9c9'
      g.fillRect(0, 500, S, 300)
      g.fillStyle = 'rgba(255,255,255,0.35)'
      for (let i = 0; i < 9; i++) g.fillRect(80 + i * 70, 540 + (i % 3) * 60, 90, 3)
      hills(g, S, 720, 25, '#6f8f73', 3)
      break
    }
    case 'garden':
      sky('#f3e1e3', '#fbf4ef')
      for (let i = 0; i < 26; i++) {
        const x = (i * 137) % S
        const y = 380 + ((i * 89) % 380)
        const r = 28 + ((i * 31) % 40)
        g.fillStyle = ['#eab3c1', '#f1c9d3', '#d98ea4', '#c9d9b9'][i % 4]
        g.globalAlpha = 0.85
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
      break
    case 'snow':
      sky('#3f5172', '#b9c6d9')
      g.fillStyle = '#eef3f7'
      g.beginPath()
      g.ellipse(400, 820, 620, 220, 0, 0, Math.PI * 2)
      g.fill()
      for (const [x, h] of [[150, 260], [260, 200], [560, 300], [680, 220]]) {
        g.fillStyle = '#2d4a44'
        g.beginPath()
        g.moveTo(x, 640 - h)
        g.lineTo(x + h * 0.32, 640)
        g.lineTo(x - h * 0.32, 640)
        g.closePath()
        g.fill()
      }
      g.fillStyle = 'rgba(255,255,255,0.8)'
      for (let i = 0; i < 70; i++) g.fillRect((i * 113) % S, (i * 71) % 600, 3, 3)
      break
  }
  const url = c.toDataURL('image/jpeg', 0.85)
  cache.set(scene, url)
  return url
}
