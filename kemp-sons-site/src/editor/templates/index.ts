import type { Template } from '../types'
import { christmasVeryMerry } from './christmas-very-merry'
import { christmasPhotoFrames } from './christmas-photo-frames'
import { funeralCloudsDoves } from './funeral-clouds-doves'
import { funeralFlagTabloid } from './funeral-flag-tabloid'
import { funeralGoneFishing } from './funeral-gone-fishing'
import { funeralFlagTrifold } from './funeral-flag-trifold'
import { funeralPinkStagger } from './funeral-pink-stagger'
import { funeralGoldBooklet } from './funeral-gold-booklet'
import { funeralPurpleLilacs } from './funeral-purple-lilacs'
import { funeralPinkTulips } from './funeral-pink-tulips'
import { funeralPinkFloral } from './funeral-pink-floral'
import { funeralRedRoses } from './funeral-red-roses'
import { withKempFonts } from './kemp-fonts'
import { funeralThemes } from './funeral-themes'
import { PERSONAS, withPersona } from './funeral-shared'
import { ADDON_TEMPLATES } from './memorial-addons'

/**
 * Funeral programs take turns opening with each sample person, so the
 * galleries show a range of families. Designs whose sample shows a cut-out
 * portrait keep Margaret, the one sample with a cut-out.
 */
function withSamplePerson(t: Template, i: number): Template {
  if (t.category !== 'funeral-programs') return t
  const cutout = t.fields.some((f) => f.type === 'photo' && f.removeBackground)
  const p = cutout ? PERSONAS[0] : PERSONAS[i % PERSONAS.length]
  return { ...withPersona(t, p), samplePortrait: p.portrait }
}

/** Every template on the site. Add new ones here. */
export const TEMPLATES: Template[] = [
  christmasVeryMerry,
  ...christmasPhotoFrames,
  // Funeral programs
  funeralCloudsDoves,
  funeralRedRoses,
  funeralPinkFloral,
  funeralPinkTulips,
  funeralPurpleLilacs,
  funeralGoldBooklet,
  funeralPinkStagger,
  funeralFlagTrifold,
  funeralGoneFishing,
  funeralFlagTabloid,
  // The theme collection: 20 backgrounds in four sizes
  ...funeralThemes,
]
  .map(withKempFonts) // Kemp's own fonts, matched to each original program
  .map(withSamplePerson)

/** Every template, including memorial add-ons (made from a program, never listed in galleries). */
export const ALL_TEMPLATES: Template[] = [...TEMPLATES, ...ADDON_TEMPLATES]

export const templateById = (id: string) => ALL_TEMPLATES.find((t) => t.id === id)
export const templatesIn = (category: Template['category']) => TEMPLATES.filter((t) => t.category === category)
