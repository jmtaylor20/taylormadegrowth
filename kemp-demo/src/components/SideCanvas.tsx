import { memo, useMemo } from 'react'
import { Stage, Layer, Group, Rect, Ellipse, Line, Star, Text, Image as KImage, Circle } from 'react-konva'
import type Konva from 'konva'
import type { Context } from 'konva/lib/Context'
import { BLEED, type Element, type PhotoEl, type Side, type StackEl, type Template, type TextEl } from '../templates/types'
import { fieldsOf, fillTokens, fitStack, fitText, konvaFontStyle } from '../lib/textFit'
import type { PhotoState } from '../lib/draft'
import { useImages } from '../lib/images'

/**
 * Renders one side of a template. Everything inside is drawn in points
 * (1/72 in) in a group scaled to the requested pixels per inch, so the same
 * component produces the editor preview, the proof, thumbnails and the
 * print file.
 *
 * mode
 *  editor  full sheet including bleed; guides optional; bleed masked when guides are off
 *  trim    final trimmed piece only (proof, thumbnails)
 *  print   full sheet including bleed, nothing masked, no guides
 */
export type RenderMode = 'editor' | 'trim' | 'print'

interface Props {
  template: Template
  side: Side
  values: Record<string, string>
  photos: Record<string, PhotoState>
  /** Pixels per inch on screen. */
  ppi: number
  mode: RenderMode
  showGuides?: boolean
  /** Color used to hide the bleed when guides are off (match the page). */
  maskColor?: string
  highlightField?: string | null
  onPhotoChange?: (fieldId: string, next: PhotoState) => void
  onPhotoTap?: (fieldId: string) => void
  stageRef?: React.Ref<Konva.Stage>
}

const PT = 72

export function stageSize(t: Template, mode: RenderMode, ppi: number) {
  const b = mode === 'trim' ? 0 : BLEED
  return { w: Math.round((t.trim.w + 2 * b) * ppi), h: Math.round((t.trim.h + 2 * b) * ppi) }
}

export const SideCanvas = memo(function SideCanvas(p: Props) {
  const { template: t, side, mode, ppi } = p
  const size = stageSize(t, mode, ppi)
  const scale = ppi / PT
  const offset = mode === 'trim' ? 0 : BLEED * PT
  const photoSrcs = Object.values(p.photos).map((ph) => ph.src)
  const images = useImages(photoSrcs)
  const bleedPt = BLEED * PT
  const W = t.trim.w * PT
  const H = t.trim.h * PT

  return (
    <Stage width={size.w} height={size.h} ref={p.stageRef}>
      <Layer>
        <Group x={offset * scale} y={offset * scale} scaleX={scale} scaleY={scale}>
          <Rect x={-bleedPt} y={-bleedPt} width={W + 2 * bleedPt} height={H + 2 * bleedPt} fill={side.background} listening={false} />
          {side.elements.map((el, i) => (
            <ElementNode
              key={i}
              el={el}
              values={p.values}
              photos={p.photos}
              images={images}
              interactive={mode === 'editor' && !!p.onPhotoChange}
              showPlaceholderLabel={mode === 'editor'}
              highlight={p.highlightField ?? null}
              onPhotoChange={p.onPhotoChange}
              onPhotoTap={p.onPhotoTap}
            />
          ))}
        </Group>
      </Layer>
      {mode === 'editor' && (
        <Layer listening={false}>
          <Group x={offset * scale} y={offset * scale} scaleX={scale} scaleY={scale}>
            {p.showGuides ? (
              <Guides t={t} side={side} scale={scale} />
            ) : (
              <BleedMask W={W} H={H} b={bleedPt} color={p.maskColor ?? '#ffffff'} />
            )}
          </Group>
        </Layer>
      )}
    </Stage>
  )
})

interface NodeProps {
  el: Element
  values: Record<string, string>
  photos: Record<string, PhotoState>
  images: Record<string, HTMLImageElement>
  interactive: boolean
  showPlaceholderLabel: boolean
  highlight: string | null
  onPhotoChange?: (fieldId: string, next: PhotoState) => void
  onPhotoTap?: (fieldId: string) => void
}

function ElementNode({ el, ...rest }: NodeProps) {
  if (el.showIf && !(rest.values[el.showIf] ?? '').trim()) return null
  const common = { rotation: el.rotation, opacity: el.opacity, listening: false }
  switch (el.type) {
    case 'rect':
      return (
        <Rect
          {...common}
          x={el.x * PT}
          y={el.y * PT}
          width={el.w * PT}
          height={el.h * PT}
          fill={el.fill}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
          cornerRadius={el.radius ? el.radius * PT : 0}
          dash={el.dash}
        />
      )
    case 'ellipse':
      return (
        <Ellipse
          {...common}
          x={el.x * PT}
          y={el.y * PT}
          radiusX={el.rx * PT}
          radiusY={el.ry * PT}
          fill={el.fill}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
        />
      )
    case 'line':
      return (
        <Line
          {...common}
          x={el.x * PT}
          y={el.y * PT}
          points={el.points.map((v) => v * PT)}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
          closed={el.closed}
          fill={el.fill}
          dash={el.dash}
          lineCap="round"
          lineJoin="round"
        />
      )
    case 'star':
      return (
        <Star
          {...common}
          x={el.x * PT}
          y={el.y * PT}
          numPoints={el.points}
          innerRadius={el.innerRadius * PT}
          outerRadius={el.outerRadius * PT}
          fill={el.fill}
        />
      )
    case 'text':
      return <TextNode el={el} values={rest.values} highlight={rest.highlight} />
    case 'stack':
      return <StackNode el={el} values={rest.values} highlight={rest.highlight} />
    case 'photo':
      return <PhotoNode el={el} {...rest} />
  }
}

function TextNode({ el, values, highlight }: { el: TextEl; values: Record<string, string>; highlight: string | null }) {
  const raw = fillTokens(el.text, values)
  const fit = fitText(raw, el)
  const lh = el.lineHeight ?? 1.2
  const textH = fit.lines.length * fit.size * lh
  const boxH = el.h * PT
  const boxW = el.w * PT
  const dy = el.valign === 'top' ? 0 : el.valign === 'bottom' ? boxH - textH : (boxH - textH) / 2
  const isHot = highlight != null && fieldsOf(el).includes(highlight)
  const font = { fontFamily: el.font, fontStyle: konvaFontStyle(el), fontSize: fit.size, fill: el.color, letterSpacing: (el.letterSpacing ?? 0) * fit.size, wrap: 'none' as const }
  return (
    <Group x={el.x * PT} y={el.y * PT} rotation={el.rotation} opacity={el.opacity} listening={false}>
      {isHot && <Rect x={-3} y={-3} width={boxW + 6} height={boxH + 6} stroke="#d08a3c" strokeWidth={1} dash={[3, 2]} cornerRadius={2} />}
      {fit.rows ? (
        fit.rows.map((r, i) => {
          const y = dy + i * fit.size * lh
          return (
            <Group key={i} y={y}>
              {r.left && <Text {...font} text={r.left} lineHeight={lh} />}
              {r.dots && <Text {...font} x={r.dotsX} text={r.dots} lineHeight={lh} opacity={0.7} />}
              {r.right && <Text {...font} width={boxW} align="right" text={r.right} lineHeight={lh} />}
            </Group>
          )
        })
      ) : (
        <Text {...font} y={dy} width={boxW} text={fit.lines.join('\n')} lineHeight={lh} align={el.align ?? 'center'} />
      )}
    </Group>
  )
}

function StackNode({ el, values, highlight }: { el: StackEl; values: Record<string, string>; highlight: string | null }) {
  const fit = fitStack(el, values)
  const boxH = el.h * PT
  const boxW = el.w * PT
  const dy = el.valign === 'top' ? 0 : el.valign === 'bottom' ? boxH - fit.height : (boxH - fit.height) / 2
  const isHot = highlight != null && fieldsOf(el).includes(highlight)
  const style = (st: StackEl['heading'], size: number) => ({
    fontFamily: st.font,
    fontStyle: konvaFontStyle(st),
    fontSize: size,
    fill: st.color,
    letterSpacing: (st.letterSpacing ?? 0) * size,
    align: st.align ?? 'center',
    width: boxW,
    wrap: 'none' as const,
  })
  return (
    <Group x={el.x * PT} y={el.y * PT} rotation={el.rotation} opacity={el.opacity} listening={false}>
      {isHot && <Rect x={-3} y={-3} width={boxW + 6} height={boxH + 6} stroke="#d08a3c" strokeWidth={1} dash={[3, 2]} cornerRadius={2} />}
      {fit.blocks.map((b, i) => (
        <Group key={i} y={dy}>
          <Text {...style(el.heading, b.heading.size)} y={b.y} text={b.heading.lines.join('\n')} lineHeight={el.heading.lineHeight ?? 1.15} />
          <Text {...style(el.body, b.body.size)} y={b.bodyY} text={b.body.lines.join('\n')} lineHeight={el.body.lineHeight ?? 1.25} />
        </Group>
      ))}
    </Group>
  )
}

function clipFor(el: PhotoEl) {
  const w = el.w * PT
  const h = el.h * PT
  return (ctx: Context) => {
    ctx.beginPath()
    if (el.shape === 'ellipse') {
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    } else if (el.shape === 'arch') {
      const r = w / 2
      ctx.moveTo(0, h)
      ctx.lineTo(0, r)
      ctx.arc(r, r, r, Math.PI, 0)
      ctx.lineTo(w, h)
    } else {
      const r = (el.radius ?? 0) * PT
      if (r > 0) ctx.roundRect(0, 0, w, h, r)
      else ctx.rect(0, 0, w, h)
    }
    ctx.closePath()
  }
}

/** Size and position of a photo inside its frame, clamped so it always covers the frame. */
export function photoLayout(img: { width: number; height: number }, frameW: number, frameH: number, ph: PhotoState) {
  const cover = Math.max(frameW / img.width, frameH / img.height)
  const s = cover * Math.max(1, ph.zoom)
  const iw = img.width * s
  const ih = img.height * s
  const maxX = (iw - frameW) / 2
  const maxY = (ih - frameH) / 2
  const ox = Math.max(-maxX, Math.min(maxX, ph.ox))
  const oy = Math.max(-maxY, Math.min(maxY, ph.oy))
  return { iw, ih, x: frameW / 2 + ox - iw / 2, y: frameH / 2 + oy - ih / 2, ox, oy, maxX, maxY }
}

function PhotoNode({ el, photos, images, interactive, showPlaceholderLabel, onPhotoChange, onPhotoTap, highlight }: NodeProps & { el: PhotoEl }) {
  const ph = photos[el.field]
  const img = ph ? images[ph.src] : undefined
  const w = el.w * PT
  const h = el.h * PT
  const clip = useMemo(() => clipFor(el), [el])
  const lay = img && ph ? photoLayout(img, w, h, ph) : null
  if (!lay && el.optional) return null

  return (
    <Group x={el.x * PT} y={el.y * PT} rotation={el.rotation} opacity={el.opacity}>
      <Group clipFunc={clip}>
        {img && ph && lay ? (
          <KImage
            image={img}
            x={lay.x}
            y={lay.y}
            width={lay.iw}
            height={lay.ih}
            draggable={interactive}
            listening={interactive}
            onMouseEnter={(e) => interactive && (e.target.getStage()!.container().style.cursor = 'grab')}
            onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
            onDragMove={(e) => {
              const n = e.target
              const ox = Math.max(-lay.maxX, Math.min(lay.maxX, n.x() + lay.iw / 2 - w / 2))
              const oy = Math.max(-lay.maxY, Math.min(lay.maxY, n.y() + lay.ih / 2 - h / 2))
              n.position({ x: w / 2 + ox - lay.iw / 2, y: h / 2 + oy - lay.ih / 2 })
              onPhotoChange?.(el.field, { ...ph, ox, oy })
            }}
          />
        ) : (
          <Placeholder w={w} h={h} tint={el.placeholder ?? '#d9d4cb'} label={showPlaceholderLabel} onTap={interactive ? () => onPhotoTap?.(el.field) : undefined} />
        )}
      </Group>
      {el.stroke && <Outline el={el} w={w} h={h} />}
      {highlight != null && fieldsOf(el).includes(highlight) && <Outline el={{ ...el, stroke: '#d08a3c', strokeWidth: 1.5 }} w={w} h={h} dash />}
    </Group>
  )
}

function Outline({ el, w, h, dash }: { el: PhotoEl; w: number; h: number; dash?: boolean }) {
  const common = { stroke: el.stroke, strokeWidth: el.strokeWidth ?? 1, listening: false, dash: dash ? [4, 3] : undefined }
  if (el.shape === 'ellipse') return <Ellipse {...common} x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} />
  if (el.shape === 'arch') {
    const r = w / 2
    const pts: number[] = [0, h, 0, r]
    for (let a = 180; a <= 360; a += 6) {
      const rad = (a * Math.PI) / 180
      pts.push(r + r * Math.cos(rad), r + r * Math.sin(rad))
    }
    pts.push(w, h)
    return <Line {...common} points={pts} closed />
  }
  return <Rect {...common} width={w} height={h} cornerRadius={(el.radius ?? 0) * PT} />
}

function Placeholder({ w, h, tint, label, onTap }: { w: number; h: number; tint: string; label: boolean; onTap?: () => void }) {
  const r = Math.min(w, h, 260) * 0.16
  const cx = w / 2
  const cy = h / 2 - r * 0.6
  return (
    <Group onClick={onTap} onTap={onTap} listening={!!onTap}>
      <Rect width={w} height={h} fill={tint} />
      <Circle x={cx} y={cy} radius={r} fill="#ffffff" opacity={0.55} listening={false} />
      <Ellipse x={cx} y={cy + r * 2.5} radiusX={r * 1.9} radiusY={r * 1.25} fill="#ffffff" opacity={0.55} listening={false} />
      {label && (
        <Text
          y={h - Math.min(h * 0.18, 30)}
          width={w}
          align="center"
          text="Tap to add photo"
          fontFamily="Inter"
          fontStyle="600"
          fontSize={Math.max(6, Math.min(11, w / 11))}
          fill="#6f685d"
          listening={false}
        />
      )}
    </Group>
  )
}

function BleedMask({ W, H, b, color }: { W: number; H: number; b: number; color: string }) {
  return (
    <>
      <Rect x={-b} y={-b} width={W + 2 * b} height={b} fill={color} />
      <Rect x={-b} y={H} width={W + 2 * b} height={b} fill={color} />
      <Rect x={-b} y={0} width={b} height={H} fill={color} />
      <Rect x={W} y={0} width={b} height={H} fill={color} />
      <Rect x={0} y={0} width={W} height={H} stroke="rgba(0,0,0,0.12)" strokeWidth={0.6} />
    </>
  )
}

function Guides({ t, side, scale }: { t: Template; side: Side; scale: number }) {
  const W = t.trim.w * PT
  const H = t.trim.h * PT
  const b = BLEED * PT
  const s = t.safeMargin * PT
  // Keep guide lines and labels a constant size on screen.
  const px = 1 / scale
  const label = (text: string, x: number, y: number, color: string) => (
    <Text x={x} y={y} text={text} fontFamily="Inter" fontStyle="700" fontSize={9 * px} fill={color} letterSpacing={0.5 * px} />
  )
  const red = '#d64545'
  const green = '#2f8f5b'
  return (
    <>
      {/* Bleed zone: everything here is trimmed off. */}
      <Rect x={-b} y={-b} width={W + 2 * b} height={b} fill="rgba(214,69,69,0.14)" />
      <Rect x={-b} y={H} width={W + 2 * b} height={b} fill="rgba(214,69,69,0.14)" />
      <Rect x={-b} y={0} width={b} height={H} fill="rgba(214,69,69,0.14)" />
      <Rect x={W} y={0} width={b} height={H} fill="rgba(214,69,69,0.14)" />
      <Rect x={0} y={0} width={W} height={H} stroke={red} strokeWidth={1.25 * px} dash={[6 * px, 4 * px]} />
      <Rect x={s} y={s} width={W - 2 * s} height={H - 2 * s} stroke={green} strokeWidth={1.25 * px} dash={[6 * px, 4 * px]} />
      {(side.folds ?? []).map((f) => (
        <Group key={f}>
          <Line points={[f * PT, -b, f * PT, H + b]} stroke="#3d6fb5" strokeWidth={1.25 * px} dash={[2 * px, 4 * px]} />
          {label('FOLD', f * PT + 4 * px, H / 2 - 5 * px, '#3d6fb5')}
        </Group>
      ))}
      {label('TRIM', 4 * px, 4 * px, red)}
      {label('SAFE AREA', s + 4 * px, H - s - 13 * px, green)}
    </>
  )
}
