import type { Template } from '../types'
import { christmasVeryMerry } from './christmas-very-merry'
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

/** Every template on the site. Add new ones here. */
export const TEMPLATES: Template[] = [
  christmasVeryMerry,
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
]

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id)
export const templatesIn = (category: Template['category']) => TEMPLATES.filter((t) => t.category === category)
