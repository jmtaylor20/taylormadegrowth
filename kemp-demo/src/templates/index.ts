import type { CategoryId, Template } from './types'
import { funeralClassic } from './funeral-classic'
import { christmasEvergreen } from './christmas-evergreen'

/** Add a template: create a config file, then list it here. */
export const TEMPLATES: Template[] = [funeralClassic, christmasEvergreen]

export interface Category {
  id: CategoryId
  name: string
  blurb: string
}

export const CATEGORIES: Category[] = [
  { id: 'funeral', name: 'Funeral Programs', blurb: 'Folded programs, ready as fast as tomorrow morning.' },
  { id: 'christmas', name: 'Christmas Cards', blurb: 'Photo cards and greetings for the season.' },
  { id: 'wedding', name: 'Wedding Invitations', blurb: 'Elegant invitations with matching details.' },
  { id: 'yard-signs', name: 'Yard Signs', blurb: 'Weatherproof signs for grads, events and businesses.' },
  { id: 'banners', name: 'Banners', blurb: 'Vinyl banners for openings, reunions and events.' },
]

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id)
export const templatesIn = (c: CategoryId) => TEMPLATES.filter((t) => t.category === c)
