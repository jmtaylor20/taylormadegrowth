/**
 * Template config format.
 *
 * Every template is plain data: a list of form fields plus, for each printed
 * side, a list of elements positioned in INCHES from the top-left corner of
 * the trim (the final cut edge). Negative values or values past the trim
 * extend into the 0.125 in bleed. Font sizes are in POINTS (1 in = 72 pt).
 *
 * Text elements reference form fields with {{fieldId}} tokens, so one field
 * can feed several places and static copy can sit next to it.
 */

export type CategoryId = 'funeral' | 'christmas' | 'wedding' | 'yard-signs' | 'banners'

export type FontFamily =
  | 'Cormorant Garamond'
  | 'Playfair Display'
  | 'Great Vibes'
  | 'Montserrat'
  | 'Inter'

export interface TextField {
  id: string
  type: 'text' | 'textarea'
  label: string
  /** Sample content shown when the template first opens. */
  default: string
  placeholder?: string
  hint?: string
  rows?: number
  /** Form section heading this field sits under. */
  section?: string
}

export interface PhotoField {
  id: string
  type: 'photo'
  label: string
  /**
   * For collages: number of photo slots. Slots are stored as
   * "<id>_1" ... "<id>_N" and photo elements reference those ids.
   */
  count?: number
  hint?: string
  section?: string
}

export type Field = TextField | PhotoField

interface Base {
  x: number
  y: number
  rotation?: number
  opacity?: number
  /** Hide this element when the named field is left blank. */
  showIf?: string
}

export interface RectEl extends Base {
  type: 'rect'
  w: number
  h: number
  fill?: string
  stroke?: string
  strokeWidth?: number // points
  radius?: number
  dash?: number[] // points
}

export interface EllipseEl extends Base {
  type: 'ellipse'
  /** Center point is (x, y). */
  rx: number
  ry: number
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface LineEl extends Base {
  type: 'line'
  /** Flat list of x,y pairs in inches. */
  points: number[]
  stroke: string
  strokeWidth: number // points
  closed?: boolean
  fill?: string
  dash?: number[]
}

export interface StarEl extends Base {
  type: 'star'
  points: number
  innerRadius: number
  outerRadius: number
  fill: string
}

export interface TextEl extends Base {
  type: 'text'
  /** Copy with {{fieldId}} tokens. Use \n for line breaks. */
  text: string
  w: number
  h: number
  font: FontFamily
  /** Preferred size in points. Text shrinks from here to fit the box. */
  size: number
  /** Smallest size allowed when shrinking. Defaults to 45% of size. */
  minSize?: number
  weight?: number
  italic?: boolean
  color: string
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  lineHeight?: number
  /** Extra tracking in em (0.1 = 10% of the font size). */
  letterSpacing?: number
  uppercase?: boolean
  /**
   * Dotted leader rows, as in an order of service. Each line written as
   * "Item | Person" draws the item on the left, the person on the right and
   * dots between. A line starting with "|" is right-aligned on its own.
   */
  leaders?: boolean
}

export type TextStyle = Pick<TextEl, 'font' | 'size' | 'weight' | 'italic' | 'color' | 'lineHeight' | 'letterSpacing' | 'uppercase' | 'align'>

/**
 * A vertical stack of titled sections (Pallbearers, Interment, Repast...).
 * Sections whose body is blank are left out and the rest close the gap.
 * Everything scales down together if the stack is too tall for its box.
 */
export interface StackEl extends Base {
  type: 'stack'
  w: number
  h: number
  valign?: 'top' | 'middle' | 'bottom'
  /** Space between sections, in inches. */
  gap: number
  /** Space between a heading and its body, in inches. */
  headingGap: number
  heading: TextStyle
  body: TextStyle
  items: { heading: string; body: string }[]
  /** Smallest scale allowed when shrinking (default 0.55). */
  minScale?: number
}

export interface PhotoEl extends Base {
  type: 'photo'
  /** Id of a PhotoField. */
  field: string
  w: number
  h: number
  shape?: 'rect' | 'ellipse' | 'arch'
  radius?: number
  stroke?: string
  strokeWidth?: number
  /** Placeholder tint when no photo is uploaded yet. */
  placeholder?: string
  /** Draw nothing (no placeholder) until a photo is added, e.g. a faint background photo. */
  optional?: boolean
}

export type Element = RectEl | EllipseEl | LineEl | StarEl | TextEl | StackEl | PhotoEl

export interface Side {
  id: string
  label: string
  background: string
  elements: Element[]
  /** Vertical fold positions in inches from the left trim, drawn as guides. */
  folds?: number[]
  /** Panel names shown under the canvas, left to right. */
  panels?: string[]
}

export interface QuantityTier {
  qty: number
  price: number
}

export interface PaperOption {
  id: string
  label: string
  detail?: string
  /** Multiplier on the quantity price (1 = included). */
  multiplier: number
}

export interface Template {
  id: string
  category: CategoryId
  name: string
  description: string
  /** Flat (unfolded) trim size in inches. */
  trim: { w: number; h: number }
  /** Human size label, e.g. "8.5 x 11 in, folds to 5.5 x 8.5 in". */
  sizeLabel: string
  /** Distance inside the trim that important content should stay within. */
  safeMargin: number
  fields: Field[]
  sides: Side[]
  quantities: QuantityTier[]
  papers: PaperOption[]
  paperLabel?: string
  rush?: { label: string; detail: string; price: number }
  /** Which side the thumbnail shows. Defaults to the first. */
  thumbnailSide?: string
  /** For thumbnails of folded pieces, crop to this region of the side (inches). */
  thumbnailCrop?: { x: number; y: number; w: number; h: number }
}

export const BLEED = 0.125
