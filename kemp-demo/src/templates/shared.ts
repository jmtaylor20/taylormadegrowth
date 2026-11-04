import type { Field, Template } from './types'

/** Fields shared by every funeral program so families can switch designs without retyping. */
export const FUNERAL_FIELDS: Field[] = [
  { id: 'name', type: 'text', label: 'Full name', default: 'Margaret Ellen Hayes', section: 'Front cover' },
  { id: 'firstName', type: 'text', label: 'First name or nickname', default: 'Margaret', hint: 'Used in the inside heading', section: 'Front cover' },
  { id: 'birthDate', type: 'text', label: 'Date of birth', default: 'Sunrise March 3, 1942', section: 'Front cover' },
  { id: 'deathDate', type: 'text', label: 'Date of passing', default: 'Sunset October 28, 2026', section: 'Front cover' },
  { id: 'photo', type: 'photo', label: 'Portrait photo', hint: 'Drag the photo on the preview to reposition it.', section: 'Front cover' },

  { id: 'serviceDate', type: 'text', label: 'Service date', default: 'Saturday, November 7, 2026', section: 'Service details' },
  { id: 'serviceTime', type: 'text', label: 'Service time', default: '11:00 AM', section: 'Service details' },
  { id: 'location', type: 'text', label: 'Location', default: 'Grace Community Church', section: 'Service details' },
  { id: 'locationAddress', type: 'text', label: 'Location address', default: '412 Maple Street', section: 'Service details' },
  { id: 'officiant', type: 'text', label: 'Officiant', default: 'Reverend Daniel Brooks', section: 'Service details' },

  {
    id: 'obituary',
    type: 'textarea',
    label: 'Obituary',
    rows: 6,
    section: 'Inside',
    hint: 'Long text shrinks to fit the panel.',
    default:
      'Margaret Ellen Hayes was born on March 3, 1942, the second of four children. She grew up on the family farm, where she learned to bake, to sew, and to never leave a neighbor in need.\n\nShe married her high school sweetheart, Robert, in 1963, and together they raised three children in the house on Maple Street. Margaret taught second grade for thirty-one years, and former students still stopped her at the grocery store to say hello.\n\nShe loved her garden, her church choir, Sunday dinners, and a good game of cards. Most of all, she loved her family.\n\nMargaret is survived by her children, Susan, Michael, and Anne; eight grandchildren; and two great-grandchildren. She was preceded in death by her husband, Robert.',
  },
  {
    id: 'orderOfService',
    type: 'textarea',
    label: 'Order of service',
    rows: 6,
    section: 'Inside',
    default:
      'Prelude\nOpening Prayer\nScripture Reading, Psalm 23\nHymn, Amazing Grace\nReading of the Obituary\nWords of Remembrance\nEulogy\nClosing Prayer\nRecessional',
  },

  {
    id: 'familyMessage',
    type: 'textarea',
    label: 'Family message',
    rows: 4,
    section: 'Back cover',
    default:
      'The family of Margaret Hayes thanks you for every prayer, every meal, and every kind word. Your love has carried us through these days, and we are grateful beyond words.',
  },
  { id: 'pallbearers', type: 'textarea', label: 'Pallbearers', rows: 3, section: 'Back cover', default: 'Michael Hayes  ·  James Carter\nDavid Hayes  ·  Thomas Reed\nAndrew Miller  ·  Paul Jensen' },
  { id: 'interment', type: 'text', label: 'Interment', default: 'Oak Hill Cemetery', section: 'Back cover' },
  { id: 'funeralHome', type: 'text', label: 'Funeral home', default: 'Whitfield Family Funeral Home', section: 'Back cover' },
]

export const FUNERAL_OPTIONS: Pick<Template, 'quantities' | 'papers' | 'paperLabel' | 'rush'> = {
  quantities: [
    { qty: 50, price: 72 },
    { qty: 100, price: 98 },
    { qty: 150, price: 129 },
    { qty: 200, price: 155 },
    { qty: 300, price: 205 },
  ],
  paperLabel: 'Paper',
  papers: [
    { id: 'gloss', label: '80 lb Gloss Text', detail: 'Bright and smooth', multiplier: 1 },
    { id: 'matte', label: '100 lb Matte Text', detail: 'Soft, no glare', multiplier: 1.15 },
    { id: 'linen', label: 'Linen Cover', detail: 'Textured, heirloom feel', multiplier: 1.3 },
  ],
  rush: { label: 'Rush (funeral orders)', detail: 'Printed same day or by 9 AM next morning', price: 35 },
}

export const CARD_OPTIONS: Pick<Template, 'quantities' | 'papers' | 'paperLabel'> = {
  quantities: [
    { qty: 25, price: 39 },
    { qty: 50, price: 59 },
    { qty: 100, price: 89 },
    { qty: 200, price: 149 },
  ],
  paperLabel: 'Card stock',
  papers: [
    { id: 'matte', label: '14 pt Matte', detail: 'Classic and sturdy', multiplier: 1 },
    { id: 'gloss', label: '14 pt Gloss', detail: 'Makes photos pop', multiplier: 1 },
    { id: 'felt', label: 'Felt Cotton', detail: 'Luxury textured stock', multiplier: 1.35 },
  ],
}
