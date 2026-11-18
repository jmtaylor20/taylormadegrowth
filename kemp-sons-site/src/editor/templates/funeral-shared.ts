import type { Field } from '../types'

/*
 * Fields shared by every funeral program, so families can switch designs
 * without retyping. Sample text is fictional.
 */

const HIDE = 'Leave blank to hide this section.'

/**
 * Fields shared by every funeral program so families can switch designs
 * without retyping. Individual templates may add their own (e.g. a collage).
 */
export const FUNERAL_FIELDS: Field[] = [
  { id: 'name', type: 'text', label: 'Full name', default: 'Mrs. Margaret Ellen Hayes', section: 'Front cover' },
  { id: 'firstName', type: 'text', label: 'First name or nickname', default: 'Margaret', hint: 'Used in headings inside the program.', section: 'Front cover' },
  { id: 'birthDate', type: 'text', label: 'Date of birth', default: 'March 3, 1942', section: 'Front cover' },
  { id: 'deathDate', type: 'text', label: 'Date of passing', default: 'October 28, 2026', section: 'Front cover' },
  { id: 'photo', type: 'photo', label: 'Portrait photo', hint: 'Drag the photo on the preview to reposition it.', section: 'Front cover' },

  { id: 'serviceDate', type: 'text', label: 'Service date', default: 'Saturday, November 7, 2026', section: 'Service details' },
  { id: 'serviceTime', type: 'text', label: 'Service time', default: '11:00 AM', section: 'Service details' },
  { id: 'location', type: 'text', label: 'Location', default: 'Grace Community Church', section: 'Service details' },
  { id: 'locationAddress', type: 'textarea', rows: 2, label: 'Location address', default: '412 Maple Street\nSpringfield', section: 'Service details' },
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
  { id: 'closingQuote', type: 'text', label: 'Closing quote', default: '"Those we love never truly leave us."', hint: 'Shown under the obituary. ' + HIDE, section: 'Inside' },
  {
    id: 'orderOfService',
    type: 'textarea',
    label: 'Order of service',
    rows: 7,
    section: 'Inside',
    hint: 'Type "Item | Person" for a dotted line. Start a line with | to right-align it.',
    default:
      'Prelude | Mrs. Linda Carter, Musician\nProcessional\nOpening Prayer | Deacon James Reed\nScripture Reading | Psalm 23\nHymn | Amazing Grace\nReading of the Obituary\nWords of Remembrance | Family and Friends\nEulogy | Reverend Daniel Brooks\n| Pastor, Grace Community Church\nClosing Prayer\nRecessional',
  },

  { id: 'pallbearers', type: 'textarea', label: 'Pallbearers', rows: 3, section: 'Back cover', hint: HIDE, default: 'Michael Hayes, James Carter\nDavid Hayes, Thomas Reed\nAndrew Miller, Paul Jensen' },
  { id: 'flowerBearers', type: 'textarea', label: 'Flower bearers', rows: 2, section: 'Back cover', hint: HIDE, default: 'Granddaughters of the family' },
  { id: 'interment', type: 'textarea', label: 'Interment', rows: 2, section: 'Back cover', hint: HIDE, default: 'Oak Hill Cemetery\nSpringfield' },
  { id: 'repast', type: 'textarea', label: 'Repast', rows: 3, section: 'Back cover', hint: HIDE, default: 'Fellowship Hall\nGrace Community Church\n412 Maple Street' },
  {
    id: 'familyMessage',
    type: 'textarea',
    label: 'Words of thanks',
    rows: 4,
    section: 'Back cover',
    hint: HIDE,
    default: 'The family thanks you for every prayer, every meal, and every kind word. Your love has carried us through these days.',
  },
  { id: 'funeralHome', type: 'text', label: 'Funeral home', default: 'Whitfield Family Funeral Home', section: 'Back cover' },
  { id: 'funeralHomeDetails', type: 'textarea', rows: 2, label: 'Funeral home address and phone', default: '220 Main Street, Springfield\n(555) 014-2290', section: 'Back cover' },
]

/** The back-cover sections, in order. Blank ones drop out and the rest close up. */
export const BACK_SECTIONS = [
  { heading: 'Pallbearers', body: '{{pallbearers}}' },
  { heading: 'Flower Bearers', body: '{{flowerBearers}}' },
  { heading: 'Interment', body: '{{interment}}' },
  { heading: 'Repast', body: '{{repast}}' },
  { heading: 'Words of Thanks', body: '{{familyMessage}}' },
]

/** Insert extra fields right after the field with the given id. */
export function withFields(after: string, extra: Field[]): Field[] {
  const i = FUNERAL_FIELDS.findIndex((f) => f.id === after)
  return [...FUNERAL_FIELDS.slice(0, i + 1), ...extra, ...FUNERAL_FIELDS.slice(i + 1)]
}


/**
 * Sample people for the funeral programs (all fictional; portraits are
 * AI-generated, see public/kiosk/samples/CREDITS.txt). Each design opens
 * with one of them, so the galleries show a range of families. The sample
 * text is written for Margaret; withPersona swaps in the other names (and
 * pronouns and obituary for the men).
 */
export interface Persona {
  title: 'Mrs.' | 'Mr.'
  first: string
  middle: string
  last: string
  he: boolean
  portrait: string
  /** Spouse, for the men's obituary. */
  spouse?: string
}

export const PERSONAS: Persona[] = [
  { title: 'Mrs.', first: 'Margaret', middle: 'Ellen', last: 'Hayes', he: false, portrait: '/kiosk/samples/portrait.jpg' },
  { title: 'Mrs.', first: 'Dorothy', middle: 'Mae', last: 'Williams', he: false, portrait: '/kiosk/samples/portrait-dorothy.jpg' },
  { title: 'Mr.', first: 'James', middle: 'Earl', last: 'Johnson', he: true, spouse: 'Ruth', portrait: '/kiosk/samples/portrait-james.jpg' },
  { title: 'Mrs.', first: 'Rosa', middle: 'Maria', last: 'Delgado', he: false, portrait: '/kiosk/samples/portrait-rosa.jpg' },
  { title: 'Mr.', first: 'Robert', middle: 'Lee', last: 'Turner', he: true, spouse: 'Betty', portrait: '/kiosk/samples/portrait-robert.jpg' },
  { title: 'Mrs.', first: 'Helen', middle: 'Mei', last: 'Chen', he: false, portrait: '/kiosk/samples/portrait-helen.jpg' },
]

const manObituary = (p: Persona) =>
  `${p.first} ${p.middle} ${p.last} was born on March 3, 1942, the second of four children. He grew up on the family farm, where he learned to work hard, to fix most anything with his hands, and to never leave a neighbor in need.\n\nHe married his high school sweetheart, ${p.spouse}, in 1963, and together they raised three children in the house on Maple Street. ${p.first} worked at the mill for thirty-one years and served as a deacon at his church for most of them.\n\nHe loved fishing at daybreak, Sunday dinners, gospel music, and a good game of dominoes. Most of all, he loved his family.\n\n${p.first} is survived by his wife, ${p.spouse}; his children, Susan, Michael, and Anne; eight grandchildren; and two great-grandchildren.`

/** Rewrites a design's sample text for another sample person. */
export function withPersona<T extends { fields: Field[] }>(t: T, p: Persona): T {
  if (p === PERSONAS[0]) return t
  const swap = (s: string) => {
    let out = s
      .replaceAll('Mrs. Margaret Ellen Hayes', `${p.title} ${p.first} ${p.middle} ${p.last}`)
      .replaceAll('Mrs. Margaret Ellen', `${p.title} ${p.first} ${p.middle}`)
      .replaceAll('Margaret Ellen Hayes', `${p.first} ${p.middle} ${p.last}`)
      .replaceAll('Margaret Ellen', `${p.first} ${p.middle}`)
      .replaceAll('Margaret', p.first)
      .replaceAll('Hayes', p.last)
    if (p.he) out = out.replace(/\bShe\b/g, 'He').replace(/\bshe\b/g, 'he').replace(/\bHer\b/g, 'His').replace(/\bher\b/g, 'his')
    return out
  }
  return {
    ...t,
    fields: t.fields.map((f) => {
      if (f.type === 'photo') return f
      if (f.id === 'obituary' && p.he) return { ...f, default: manObituary(p) }
      return { ...f, default: swap(f.default) }
    }),
  }
}
