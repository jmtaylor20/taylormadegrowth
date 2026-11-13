import * as THREE from 'three'

/**
 * Printed-piece artwork, drawn on canvases so the 3D products carry real
 * Kemp & Sons-style designs without any stock imagery.
 */

const C = {
  navy: '#103750',
  navyDeep: '#0a2536',
  burgundy: '#982b38',
  gray: '#838783',
  black: '#111111',
  paper: '#fbfaf6',
  ivory: '#f6f1e7',
  gold: '#b89a5e',
}

const SERIF = 'Georgia, "Times New Roman", serif'
const SANS = 'Arial, Helvetica, sans-serif'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

function toTexture(c: HTMLCanvasElement, renderer: THREE.WebGLRenderer) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  return t
}

function centerText(g: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string, spacing = 0) {
  g.font = font
  g.fillStyle = color
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`
  g.fillText(text, x, y)
  if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'
}

function lines(g: CanvasRenderingContext2D, x: number, y: number, w: number, count: number, gap: number, color: string, center = true) {
  g.fillStyle = color
  for (let i = 0; i < count; i++) {
    const lw = w * (0.62 + ((i * 37) % 30) / 100)
    g.fillRect(center ? x - lw / 2 : x, y + i * gap, lw, Math.max(3, gap * 0.28))
  }
}

function photo(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, oval = true) {
  g.save()
  g.beginPath()
  if (oval) g.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2)
  else g.rect(x - w / 2, y - h / 2, w, h)
  g.clip()
  const gr = g.createLinearGradient(0, y - h / 2, 0, y + h / 2)
  gr.addColorStop(0, '#9fb6c8')
  gr.addColorStop(1, '#ead6bb')
  g.fillStyle = gr
  g.fillRect(x - w / 2, y - h / 2, w, h)
  // soft rolling hills
  for (const [off, col] of [[0.18, '#8aa0b2'], [0.32, '#6f879b']] as const) {
    g.fillStyle = col
    g.beginPath()
    g.moveTo(x - w / 2, y + h / 2)
    for (let i = 0; i <= 20; i++) {
      const px = x - w / 2 + (w * i) / 20
      g.lineTo(px, y + h * off + Math.sin(i * 0.7 + off * 10) * h * 0.05)
    }
    g.lineTo(x + w / 2, y + h / 2)
    g.fill()
  }
  g.restore()
}

/** Funeral program: four panels (outside: back + front cover, inside: left + right). */
export function programTextures(r: THREE.WebGLRenderer) {
  const W = 550, H = 850
  const panel = (draw: (g: CanvasRenderingContext2D) => void) => {
    const [c, g] = canvas(W, H)
    g.fillStyle = C.ivory
    g.fillRect(0, 0, W, H)
    g.strokeStyle = C.gold
    g.lineWidth = 3
    g.strokeRect(26, 26, W - 52, H - 52)
    g.lineWidth = 1
    g.strokeRect(36, 36, W - 72, H - 72)
    draw(g)
    return toTexture(c, r)
  }
  const front = panel((g) => {
    centerText(g, 'In Loving Memory', W / 2, 96, `italic 44px ${SERIF}`, C.burgundy)
    photo(g, W / 2, 330, 280, 350)
    g.strokeStyle = C.gold
    g.lineWidth = 4
    g.beginPath(); g.ellipse(W / 2, 330, 142, 177, 0, 0, Math.PI * 2); g.stroke()
    centerText(g, 'MARGARET ELLEN', W / 2, 580, `600 40px ${SERIF}`, C.navy, 3)
    centerText(g, 'HAYES', W / 2, 628, `600 40px ${SERIF}`, C.navy, 3)
    centerText(g, 'Sunrise March 3, 1942', W / 2, 690, `italic 22px ${SERIF}`, C.gray)
    centerText(g, 'Sunset October 28, 2026', W / 2, 720, `italic 22px ${SERIF}`, C.gray)
    lines(g, W / 2, 762, 300, 2, 22, '#c9bfa9')
  })
  const back = panel((g) => {
    centerText(g, 'With Gratitude', W / 2, 110, `italic 38px ${SERIF}`, C.burgundy)
    lines(g, W / 2, 170, 380, 5, 26, '#bdb4a2')
    centerText(g, 'Pallbearers', W / 2, 360, `italic 30px ${SERIF}`, C.burgundy)
    lines(g, W / 2, 400, 320, 3, 26, '#bdb4a2')
    centerText(g, 'Interment', W / 2, 530, `italic 30px ${SERIF}`, C.burgundy)
    lines(g, W / 2, 570, 260, 2, 26, '#bdb4a2')
    centerText(g, 'Printed by Kemp & Sons', W / 2, 770, `14px ${SANS}`, C.gray, 2)
  })
  const insideLeft = panel((g) => {
    centerText(g, 'Obituary', W / 2, 100, `italic 40px ${SERIF}`, C.burgundy)
    lines(g, 70, 160, 410, 22, 26, '#b9b1a1', false)
  })
  const insideRight = panel((g) => {
    centerText(g, 'Order of Service', W / 2, 100, `italic 40px ${SERIF}`, C.burgundy)
    g.fillStyle = '#b9b1a1'
    for (let i = 0; i < 11; i++) {
      const y = 170 + i * 44
      g.fillRect(80, y, 120 + ((i * 29) % 70), 6)
      for (let d = 230; d < 380; d += 12) g.fillRect(d, y + 2, 4, 4)
      g.fillRect(390, y, 80, 6)
    }
  })
  return { front, back, insideLeft, insideRight }
}

export function christmasTexture(r: THREE.WebGLRenderer) {
  const W = 500, H = 700
  const [c, g] = canvas(W, H)
  photo(g, W / 2, 245, W, 490, false)
  // snowy pines over the photo
  g.fillStyle = '#2f4f45'
  for (const [x, h] of [[90, 170], [170, 120], [330, 200], [420, 140]] as const) {
    g.beginPath(); g.moveTo(x, 470 - h); g.lineTo(x + h * 0.32, 470); g.lineTo(x - h * 0.32, 470); g.fill()
  }
  g.fillStyle = C.burgundy
  g.fillRect(0, 490, W, 210)
  g.fillStyle = C.gold
  g.fillRect(0, 490, W, 6)
  centerText(g, 'Merry Christmas', W / 2, 570, `italic 54px ${SERIF}`, '#fff7ec')
  centerText(g, 'THE BASS FAMILY', W / 2, 640, `bold 18px ${SANS}`, '#f1d9c8', 5)
  return toTexture(c, r)
}

export function yardSignTexture(r: THREE.WebGLRenderer) {
  const W = 960, H = 720
  const [c, g] = canvas(W, H)
  g.fillStyle = C.navy
  g.fillRect(0, 0, W, H)
  g.fillStyle = C.burgundy
  g.fillRect(0, H - 170, W, 170)
  g.fillStyle = '#ffffff'
  g.beginPath(); g.arc(230, 280, 160, 0, Math.PI * 2); g.fill()
  photo(g, 230, 280, 296, 296)
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  g.fillStyle = '#e8c8a0'
  g.font = `bold 46px ${SANS}`
  g.fillText('CONGRATULATIONS', 430, 170)
  g.fillStyle = '#ffffff'
  g.font = `bold 92px ${SANS}`
  g.fillText('JORDAN', 430, 270)
  g.fillText('HAYES', 430, 362)
  g.fillStyle = '#e8c8a0'
  g.font = `bold 50px ${SANS}`
  g.fillText('CLASS OF 2027', 430, 440)
  centerText(g, 'We are so proud of you!', W / 2, H - 85, `italic 64px ${SERIF}`, '#ffffff')
  return toTexture(c, r)
}

export function stickerSheetTexture(r: THREE.WebGLRenderer) {
  const W = 680, H = 880
  const [c, g] = canvas(W, H)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, H)
  const fills = [C.burgundy, C.navy, C.burgundy, C.navy, C.burgundy, C.navy]
  let i = 0
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const x = 190 + col * 300, y = 165 + row * 275
      g.fillStyle = fills[i]
      g.beginPath(); g.arc(x, y, 122, 0, Math.PI * 2); g.fill()
      g.strokeStyle = 'rgba(255,255,255,0.85)'
      g.lineWidth = 4
      g.beginPath(); g.arc(x, y, 106, 0, Math.PI * 2); g.stroke()
      centerText(g, i % 2 ? 'Cheers!' : 'Happy', x, y - 16, `italic 40px ${SERIF}`, '#ffffff')
      centerText(g, i % 2 ? 'EST. 2026' : 'BIRTHDAY', x, y + 30, `bold 20px ${SANS}`, '#ffffff', 3)
      g.setLineDash([8, 7])
      g.strokeStyle = 'rgba(17,17,17,0.25)'
      g.lineWidth = 2
      g.beginPath(); g.arc(x, y, 130, 0, Math.PI * 2); g.stroke()
      g.setLineDash([])
      i++
    }
  }
  return toTexture(c, r)
}

export function sportsProgramTexture(r: THREE.WebGLRenderer) {
  const W = 620, H = 800
  const [c, g] = canvas(W, H)
  g.fillStyle = C.black
  g.fillRect(0, 0, W, H)
  g.fillStyle = C.burgundy
  g.beginPath(); g.moveTo(0, 520); g.lineTo(W, 380); g.lineTo(W, H); g.lineTo(0, H); g.fill()
  g.strokeStyle = 'rgba(255,255,255,0.12)'
  g.lineWidth = 3
  for (let y = 80; y < 520; y += 60) { g.beginPath(); g.moveTo(40, y); g.lineTo(W - 40, y); g.stroke() }
  centerText(g, 'FRIDAY', W / 2, 150, `bold 96px ${SANS}`, '#ffffff', 6)
  centerText(g, 'NIGHT', W / 2, 250, `bold 96px ${SANS}`, '#ffffff', 6)
  centerText(g, 'LIGHTS', W / 2, 350, `bold 96px ${SANS}`, C.gray, 6)
  centerText(g, 'OFFICIAL GAME PROGRAM', W / 2, 620, `bold 26px ${SANS}`, '#ffffff', 5)
  centerText(g, '2026 Season', W / 2, 680, `italic 34px ${SERIF}`, '#f3dede')
  return toTexture(c, r)
}

export function letterheadTexture(r: THREE.WebGLRenderer, logo: HTMLImageElement | null) {
  const W = 680, H = 880
  const [c, g] = canvas(W, H)
  g.fillStyle = C.paper
  g.fillRect(0, 0, W, H)
  if (logo) g.drawImage(logo, 50, 40, 200, 132)
  g.fillStyle = C.burgundy
  g.fillRect(50, 196, W - 100, 4)
  lines(g, 50, 250, 560, 16, 30, '#cfd3d6', false)
  centerText(g, '2301 Enterprise Drive  |  Opelika, Alabama', W / 2, 840, `15px ${SANS}`, C.gray, 1)
  return toTexture(c, r)
}

/** Owners' business card, front: the full-color wordmark on bright white stock. */
export function businessCardFront(r: THREE.WebGLRenderer, logo: HTMLImageElement | null) {
  const W = 1050, H = 600
  const [c, g] = canvas(W, H)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, H)
  if (logo) g.drawImage(logo, (W - 600) / 2, 70, 600, 396)
  g.fillStyle = C.burgundy
  g.fillRect(0, H - 34, W, 34)
  return toTexture(c, r)
}

/** Owners' business card, back: navy with contact details. */
export function businessCardBack(r: THREE.WebGLRenderer) {
  const W = 1050, H = 600
  const [c, g] = canvas(W, H)
  g.fillStyle = C.navy
  g.fillRect(0, 0, W, H)
  g.fillStyle = C.burgundy
  g.fillRect(70, 96, 70, 8)
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  g.fillStyle = '#ffffff'
  g.font = `bold 64px ${SANS}`
  g.fillText('BRIAN & SUSAN BASS', 70, 190)
  g.fillStyle = '#c9d3db'
  g.font = `30px ${SANS}`
  g.fillText('Owners, Kemp & Sons Printing', 70, 240)
  g.fillStyle = '#ffffff'
  g.font = `32px ${SANS}`
  g.fillText('(334) 705-5888', 70, 400)
  g.fillText('printing@kempandsons.com', 70, 448)
  g.fillText('2301 Enterprise Drive, Opelika, AL', 70, 496)
  return toTexture(c, r)
}

export function plainPaper(r: THREE.WebGLRenderer, tint = C.paper) {
  const [c, g] = canvas(8, 8)
  g.fillStyle = tint
  g.fillRect(0, 0, 8, 8)
  return toTexture(c, r)
}

export const PAPER_COLORS = C
