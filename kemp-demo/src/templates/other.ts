import type { Element, Template } from './types'

/* ---------- Wedding: Botanical Elegance, 5 x 7 ---------- */

const SAGE = '#8fa58a'
const SAGE_DARK = '#5f7a5c'
const WINK = '#2f3330'

/** A simple leafy sprig: a curved stem with paired leaves. */
function sprig(x: number, y: number, len: number, angle: number, flip = 1): Element[] {
  const out: Element[] = [{ type: 'line', x, y, points: [0, 0, len * 0.15 * flip, len * 0.5, 0, len], stroke: SAGE_DARK, strokeWidth: 0.7, rotation: angle }]
  const rad = (angle * Math.PI) / 180
  for (let i = 1; i <= 5; i++) {
    const t = i / 6
    const px = x + (0.15 * flip * len * Math.sin(t * Math.PI)) * Math.cos(rad) - len * t * Math.sin(rad)
    const py = y + (0.15 * flip * len * Math.sin(t * Math.PI)) * Math.sin(rad) + len * t * Math.cos(rad)
    const size = len * (0.13 - t * 0.04)
    out.push({ type: 'ellipse', x: px + size * 0.7, y: py, rx: size * 0.38, ry: size, rotation: angle + 55, fill: SAGE, opacity: 0.9 })
    out.push({ type: 'ellipse', x: px - size * 0.7, y: py, rx: size * 0.38, ry: size, rotation: angle - 55, fill: SAGE, opacity: 0.9 })
  }
  return out
}

export const weddingBotanical: Template = {
  id: 'wedding-botanical',
  category: 'wedding',
  name: 'Botanical Elegance',
  description: 'Hand-drawn greenery, flowing script names, and a details card on the back.',
  trim: { w: 5, h: 7 },
  sizeLabel: '5 x 7 in flat invitation',
  safeMargin: 0.2,
  quantities: [
    { qty: 50, price: 95 },
    { qty: 100, price: 150 },
    { qty: 150, price: 205 },
    { qty: 200, price: 255 },
  ],
  paperLabel: 'Paper',
  papers: [
    { id: 'smooth', label: '120 lb Smooth Cover', detail: 'Bright white, crisp print', multiplier: 1 },
    { id: 'felt', label: 'Felt Cotton', detail: 'Soft texture, classic feel', multiplier: 1.25 },
    { id: 'pearl', label: 'Pearl Shimmer', detail: 'Subtle sheen', multiplier: 1.35 },
  ],
  fields: [
    { id: 'partner1', type: 'text', label: 'First name', default: 'Emma Carter', section: 'Front' },
    { id: 'partner2', type: 'text', label: 'Second name', default: 'James Bennett', section: 'Front' },
    { id: 'date', type: 'text', label: 'Date', default: 'Saturday, June 12, 2027', section: 'Front' },
    { id: 'time', type: 'text', label: 'Time', default: 'Four o\'clock in the afternoon', section: 'Front' },
    { id: 'venue', type: 'text', label: 'Venue', default: 'The Magnolia House', section: 'Front' },
    { id: 'address', type: 'text', label: 'Venue address', default: '18 Orchard Lane, Springfield', section: 'Front' },
    { id: 'reception', type: 'text', label: 'Reception line', default: 'Dinner and dancing to follow', hint: 'Leave blank to hide.', section: 'Front' },
    { id: 'initials', type: 'text', label: 'Monogram', default: 'E & J', section: 'Back' },
    { id: 'rsvp', type: 'textarea', rows: 2, label: 'RSVP', default: 'Kindly reply by May 1, 2027\nemmaandjames.com', hint: 'Leave blank to hide.', section: 'Back' },
    { id: 'stay', type: 'textarea', rows: 2, label: 'Accommodations', default: 'A room block is held at the\nSpringfield Inn under "Carter Bennett"', hint: 'Leave blank to hide.', section: 'Back' },
    { id: 'attire', type: 'text', label: 'Attire', default: 'Garden formal', hint: 'Leave blank to hide.', section: 'Back' },
  ],
  sides: [
    {
      id: 'front',
      label: 'Front',
      background: '#faf7f0',
      elements: [
        ...sprig(0.3, 0.05, 1.15, -40, 1),
        ...sprig(4.7, 0.05, 1.15, 40, -1),
        { type: 'text', text: 'Together with their families', x: 0.6, y: 1.25, w: 3.8, h: 0.25, font: 'Montserrat', weight: 500, size: 7.5, uppercase: true, letterSpacing: 0.25, color: SAGE_DARK },
        { type: 'text', text: '{{partner1}}', x: 0.35, y: 1.55, w: 4.3, h: 0.8, font: 'Great Vibes', size: 40, minSize: 20, color: WINK },
        { type: 'text', text: 'and', x: 1.5, y: 2.32, w: 2, h: 0.36, font: 'Cormorant Garamond', italic: true, size: 17, color: SAGE_DARK },
        { type: 'text', text: '{{partner2}}', x: 0.35, y: 2.62, w: 4.3, h: 0.8, font: 'Great Vibes', size: 40, minSize: 20, color: WINK },
        { type: 'text', text: 'request the pleasure of your company\nat the celebration of their marriage', x: 0.5, y: 3.6, w: 4, h: 0.55, font: 'Cormorant Garamond', size: 13, color: WINK, lineHeight: 1.2 },
        { type: 'text', text: '{{date}}', x: 0.5, y: 4.4, w: 4, h: 0.28, font: 'Montserrat', weight: 600, size: 9.5, minSize: 6, uppercase: true, letterSpacing: 0.18, color: WINK },
        { type: 'text', text: '{{time}}', x: 0.5, y: 4.72, w: 4, h: 0.3, font: 'Cormorant Garamond', italic: true, size: 13, minSize: 8, color: WINK },
        { type: 'text', text: '{{venue}}', x: 0.5, y: 5.2, w: 4, h: 0.32, font: 'Cormorant Garamond', weight: 700, size: 15, minSize: 9, color: WINK },
        { type: 'text', text: '{{address}}', x: 0.5, y: 5.5, w: 4, h: 0.28, font: 'Cormorant Garamond', size: 12.5, minSize: 8, color: WINK },
        { type: 'text', text: '{{reception}}', x: 0.5, y: 5.95, w: 4, h: 0.3, font: 'Cormorant Garamond', italic: true, size: 13, minSize: 8, color: SAGE_DARK, showIf: 'reception' },
      ],
    },
    {
      id: 'back',
      label: 'Back',
      background: '#eef1ea',
      elements: [
        { type: 'ellipse', x: 2.5, y: 1.25, rx: 0.68, ry: 0.68, stroke: SAGE_DARK, strokeWidth: 0.8 },
        { type: 'text', text: '{{initials}}', x: 1.6, y: 0.9, w: 1.8, h: 0.7, font: 'Great Vibes', size: 30, minSize: 14, color: WINK },
        ...sprig(0.4, 5.6, 1.3, -150, 1),
        ...sprig(4.6, 5.6, 1.3, 150, -1),
        {
          type: 'stack', x: 0.6, y: 2.25, w: 3.8, h: 3.6, gap: 0.3, headingGap: 0.06, valign: 'top',
          heading: { font: 'Montserrat', weight: 600, size: 8, uppercase: true, letterSpacing: 0.25, color: SAGE_DARK },
          body: { font: 'Cormorant Garamond', weight: 500, size: 13.5, color: WINK, lineHeight: 1.2 },
          items: [
            { heading: 'RSVP', body: '{{rsvp}}' },
            { heading: 'Accommodations', body: '{{stay}}' },
            { heading: 'Attire', body: '{{attire}}' },
          ],
        },
      ],
    },
  ],
}

/* ---------- Yard sign: Graduate, 24 x 18 ---------- */

const NAVY = '#1f2f4f'
const GOLD = '#d9b45a'

export const yardGrad: Template = {
  id: 'yard-sign-graduate',
  category: 'yard-signs',
  name: 'Graduate',
  description: 'Bold, readable from the street, with a big circle photo of your grad.',
  trim: { w: 24, h: 18 },
  sizeLabel: '24 x 18 in, includes H-stake',
  safeMargin: 0.5,
  quantities: [
    { qty: 1, price: 29 },
    { qty: 5, price: 115 },
    { qty: 10, price: 195 },
    { qty: 25, price: 395 },
  ],
  paperLabel: 'Print',
  papers: [
    { id: 'single', label: 'Single sided', detail: '4 mm corrugated plastic, weatherproof', multiplier: 1 },
    { id: 'double', label: 'Double sided', detail: 'Same design on both sides', multiplier: 1.4 },
  ],
  fields: [
    { id: 'photo', type: 'photo', label: 'Graduate photo', hint: 'Drag the photo on the preview to reposition it.', section: 'Sign' },
    { id: 'headline', type: 'text', label: 'Headline', default: 'Congratulations', section: 'Sign' },
    { id: 'name', type: 'text', label: 'Graduate name', default: 'Jordan Hayes', section: 'Sign' },
    { id: 'classOf', type: 'text', label: 'Class line', default: 'Class of 2027', section: 'Sign' },
    { id: 'school', type: 'text', label: 'School', default: 'Springfield High School', section: 'Sign' },
    { id: 'tagline', type: 'text', label: 'Bottom line', default: 'We are so proud of you!', section: 'Sign' },
  ],
  sides: [
    {
      id: 'front',
      label: 'Sign',
      background: NAVY,
      elements: [
        { type: 'ellipse', x: 6, y: 7.2, rx: 4.85, ry: 4.85, fill: GOLD },
        { type: 'photo', field: 'photo', x: 1.5, y: 2.7, w: 9, h: 9, shape: 'ellipse', placeholder: '#3d4f72' },
        { type: 'text', text: '{{headline}}', x: 11.6, y: 1.9, w: 11.6, h: 1.4, font: 'Montserrat', weight: 800, size: 70, minSize: 30, uppercase: true, letterSpacing: 0.04, color: GOLD },
        { type: 'text', text: '{{name}}', x: 11.6, y: 3.5, w: 11.6, h: 5.2, font: 'Montserrat', weight: 800, size: 150, minSize: 60, uppercase: true, lineHeight: 0.98, color: '#ffffff' },
        { type: 'text', text: '{{classOf}}', x: 11.6, y: 8.9, w: 11.6, h: 1.6, font: 'Montserrat', weight: 800, size: 84, minSize: 36, uppercase: true, color: GOLD },
        { type: 'text', text: '{{school}}', x: 11.6, y: 10.6, w: 11.6, h: 1.1, font: 'Montserrat', weight: 600, size: 44, minSize: 20, color: '#ffffff' },
        { type: 'rect', x: -0.125, y: 13.6, w: 24.25, h: 4.525, fill: GOLD },
        { type: 'text', text: '{{tagline}}', x: 1, y: 14.4, w: 22, h: 2.8, font: 'Playfair Display', weight: 700, italic: true, size: 120, minSize: 50, color: NAVY },
      ],
    },
  ],
}

/* ---------- Banner: Grand Opening, 6 x 3 ft ---------- */

const CLAY = '#c8553d'

export const bannerOpening: Template = {
  id: 'banner-grand-opening',
  category: 'banners',
  name: 'Grand Opening',
  description: 'A high contrast vinyl banner for openings, events and announcements.',
  trim: { w: 72, h: 36 },
  sizeLabel: '6 x 3 ft vinyl, hemmed with grommets',
  safeMargin: 1,
  quantities: [
    { qty: 1, price: 119 },
    { qty: 2, price: 219 },
    { qty: 3, price: 309 },
    { qty: 5, price: 475 },
  ],
  paperLabel: 'Material',
  papers: [
    { id: 'vinyl13', label: '13 oz vinyl', detail: 'Indoor and outdoor, single sided', multiplier: 1 },
    { id: 'blockout', label: '15 oz blockout vinyl', detail: 'Double sided, no show-through', multiplier: 1.5 },
  ],
  fields: [
    { id: 'business', type: 'text', label: 'Business name', default: 'Maple Street Coffee', section: 'Banner' },
    { id: 'headline', type: 'text', label: 'Headline', default: 'Grand Opening', section: 'Banner' },
    { id: 'date', type: 'text', label: 'Date line', default: 'Saturday, March 6', section: 'Banner' },
    { id: 'details', type: 'text', label: 'Details', default: 'Free coffee  ·  Door prizes  ·  Ribbon cutting at 10 AM', section: 'Banner' },
    { id: 'address', type: 'text', label: 'Address', default: '412 Maple Street  ·  (555) 014-2290', section: 'Banner' },
  ],
  sides: [
    {
      id: 'front',
      label: 'Banner',
      background: '#2b2a28',
      elements: [
        { type: 'text', text: '{{business}}', x: 4, y: 2.6, w: 64, h: 2.6, font: 'Montserrat', weight: 600, size: 120, minSize: 50, uppercase: true, letterSpacing: 0.3, color: CLAY },
        { type: 'text', text: '{{headline}}', x: 3, y: 5.6, w: 66, h: 9.6, font: 'Montserrat', weight: 800, size: 560, minSize: 200, uppercase: true, lineHeight: 1, color: '#ffffff' },
        { type: 'text', text: '{{date}}', x: 4, y: 15.6, w: 64, h: 4.4, font: 'Playfair Display', italic: true, size: 230, minSize: 90, color: '#f1e6d6' },
        { type: 'text', text: '{{details}}', x: 4, y: 21.2, w: 64, h: 3.2, font: 'Montserrat', weight: 500, size: 120, minSize: 50, color: '#d9d4cb' },
        { type: 'rect', x: -0.125, y: 27.5, w: 72.25, h: 8.625, fill: CLAY },
        { type: 'text', text: '{{address}}', x: 4, y: 29.2, w: 64, h: 4.8, font: 'Montserrat', weight: 700, size: 170, minSize: 70, color: '#ffffff' },
      ],
    },
  ],
}
