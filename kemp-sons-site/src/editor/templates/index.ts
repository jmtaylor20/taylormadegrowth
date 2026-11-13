import type { Template } from '../types'
import { christmasVeryMerry } from './christmas-very-merry'

/** Every template on the site. Add new ones here. */
export const TEMPLATES: Template[] = [christmasVeryMerry]

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id)
export const templatesIn = (category: Template['category']) => TEMPLATES.filter((t) => t.category === category)
