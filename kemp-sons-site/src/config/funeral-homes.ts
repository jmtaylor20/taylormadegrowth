/**
 * Funeral homes with their own back-cover panel (logo, address, phone,
 * website), from the artwork Kemp prints on their programs. Panels live in
 * /public/funeral-homes/<slug>.png with a transparent background, cropped tight.
 * `aspect` is the panel's width / height.
 */
export interface FuneralHomePanel {
  slug: string
  name: string
  /** Address and phone as plain text (saved on the order and used for add-ons). */
  details: string
  aspect: number
}

export const FUNERAL_HOMES: FuneralHomePanel[] = [
  { slug: 'peterson-williams', name: 'Peterson and Williams Funeral Home', details: '1016 McCoy Street, Opelika, AL 36801\n334-745-6473', aspect: 1178 / 259 },
  { slug: 'harris', name: 'Harris Funeral Home', details: '515 South 6th Street, Opelika, AL 36801\n(334) 749-6583', aspect: 989 / 388 },
  { slug: 'morgan-sons', name: 'Morgan & Sons Funeral Home', details: '418 North 12th Ave., Lanett, AL 36863\n334-644-4064', aspect: 1011 / 575 },
  { slug: 'silmon-seroyer', name: 'Silmon Seroyer Funeral Home', details: '612 M.L. King Dr. SE, LaFayette, AL 36862\n334-864-7208', aspect: 1047 / 237 },
]

export const OTHER_HOME = 'other'

/** Match a funeral home's name (e.g. from the partner portal) to its panel. */
export function homePanelFor(name: string | null | undefined): FuneralHomePanel | undefined {
  const key = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '')
  const n = key(name ?? '')
  if (!n) return undefined
  return FUNERAL_HOMES.find((h) => n.includes(key(h.name).replace(/funeralhome$/, '')))
}
