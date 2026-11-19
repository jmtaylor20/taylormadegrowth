import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { letterheadTexture, plainPaper, businessCardFront, businessCardBack } from './textures'

/**
 * Kemp's real templates, rendered with sample photos (public/scene, made from
 * the designer's own renderer). Regenerate them when the lineup changes.
 */
const loader = new THREE.TextureLoader()
function photoTexture(r: THREE.WebGLRenderer, url: string) {
  const t = loader.load(url)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = Math.min(8, r.capabilities.getMaxAnisotropy())
  return t
}

/**
 * The scroll story. `stage` is a continuous value from 0 to 4 driven by
 * scroll position:
 *   0 sheet      a folded trifold funeral program (Flag & Clouds), cover out
 *   1 fold       it unfolds to show the inside spread
 *   2 fan        it folds back up and Kemp's Christmas cards and the Gold booklet join it
 *   3 stack      fresh sheets stack up off the press
 *   4 cards      Kemp & Sons business cards, full-color logo
 */

type V3 = [number, number, number]
interface Pose { p: V3; r: V3; s: number; o: number; fold?: number }

const HIDE_DOWN: Pose = { p: [0, -7, -1], r: [0.4, 0, 0], s: 0.8, o: 0 }
const HIDE_UP: Pose = { p: [0, 7, -2], r: [-0.4, 0.3, 0], s: 0.8, o: 0 }

const PAPER_THICK = 0.025
const S = 0.42 // inches to scene units

function sheet(w: number, h: number, front: THREE.Texture, back: THREE.Texture, edge: THREE.Texture) {
  const mats = [edge, edge, edge, edge, front, back].map(
    (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.72, metalness: 0, transparent: true }),
  )
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, PAPER_THICK), mats)
  return m
}

function setOpacity(obj: THREE.Object3D, o: number) {
  obj.visible = o > 0.01
  obj.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) (m as THREE.Material).opacity = o
  })
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => t * t * (3 - 2 * t)

export interface Experience {
  setStage(v: number): void
  setSide(side: number[]): void
  setCopy(els: (HTMLElement | null)[]): void
  dispose(): void
}

export function createScene(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean }): Experience | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // No tone mapping, so printed colors stay true to the brand palette.
  renderer.toneMapping = THREE.NoToneMapping

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.35

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
  camera.position.set(0, 0, 14)

  scene.add(new THREE.AmbientLight(0xffffff, 0.75))
  const key = new THREE.DirectionalLight(0xfff6ec, 1.25)
  key.position.set(-4, 6, 8)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x9db8d0, 0.6)
  rim.position.set(6, -2, -4)
  scene.add(rim)

  const edge = plainPaper(renderer, '#f3f0e8')
  const paperBack = plainPaper(renderer, '#f6f3ec')

  // --- Trifold funeral program (Flag & Clouds), a roll fold ---
  // Built inside-up: each panel's front face is the inside spread, its back
  // face the outside. The right panel (inside flap) folds in first, then the
  // left panel folds over it, so the front cover ends up facing out.
  const tex = (name: string) => photoTexture(renderer, `/scene/${name}.jpg`)
  const pw = 5.5 * S, ph = 8.5 * S
  const program = new THREE.Group()
  const center = sheet(pw, ph, tex('trifold-inside-2'), tex('trifold-back'), edge)
  const rightPivot = new THREE.Group()
  rightPivot.position.x = pw / 2
  const rightPanel = sheet(pw, ph, tex('trifold-inside-3'), tex('trifold-flap'), edge)
  rightPanel.position.set(pw / 2, 0, -PAPER_THICK * 1.2)
  rightPivot.add(rightPanel)
  const leftPivot = new THREE.Group()
  leftPivot.position.x = -pw / 2
  const leftPanel = sheet(pw, ph, tex('trifold-inside-1'), tex('trifold-cover'), edge)
  leftPanel.position.set(-pw / 2, 0, -PAPER_THICK * 2.4)
  leftPivot.add(leftPanel)
  program.add(center, rightPivot, leftPivot)
  /** 0 = open flat, 1 = folded with the cover out. */
  function setFold(f: number) {
    const clamp = (v: number) => Math.min(1, Math.max(0, v))
    rightPivot.rotation.y = -Math.PI * smooth(clamp(f * 1.6))
    leftPivot.rotation.y = Math.PI * smooth(clamp((f - 0.375) * 1.6))
  }

  // --- The rest of the lineup: real Christmas cards and the 8-page booklet ---
  const card = sheet(5 * S, 7 * S, tex('pine-garland'), paperBack, edge)
  const veryMerry = sheet(7 * S, 5 * S, tex('very-merry'), paperBack, edge)
  const booklet = sheet(8.5 * S * 0.62, 11 * S * 0.62, tex('gold-booklet'), paperBack, edge)
  const navyCard = sheet(5 * S, 7 * S, tex('navy-ornaments'), paperBack, edge)

  // --- Press stack: a pile of sheets, letterhead on top ---
  const stack = new THREE.Group()
  const sheetGeo = new THREE.BoxGeometry(8.5 * S * 0.62, 11 * S * 0.62, PAPER_THICK)
  const stackMat = new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.8, transparent: true })
  const COUNT = 46
  const pile = new THREE.InstancedMesh(sheetGeo, stackMat, COUNT)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < COUNT; i++) {
    dummy.position.set(Math.sin(i * 12.9) * 0.03, Math.cos(i * 7.3) * 0.03, -i * 0.032)
    dummy.rotation.z = Math.sin(i * 3.1) * 0.012
    dummy.updateMatrix()
    pile.setMatrixAt(i, dummy.matrix)
  }
  const topSheet = sheet(8.5 * S * 0.62, 11 * S * 0.62, plainPaper(renderer), paperBack, edge)
  topSheet.position.z = 0.03
  stack.add(pile, topSheet)
  const logoImg = new Image()
  logoImg.onload = () => {
    const tex = letterheadTexture(renderer, logoImg)
    const mats = topSheet.material as THREE.MeshStandardMaterial[]
    mats[4].map = tex
    mats[4].needsUpdate = true
    const front = businessCardFront(renderer, logoImg)
    for (const m of bizCards) {
      const cm = m.material as THREE.MeshStandardMaterial[]
      cm[4].map = front
      cm[4].needsUpdate = true
    }
  }
  logoImg.src = '/brand/kemp-sons-full-color.svg'

  // --- Kemp & Sons business cards, fanned out ---
  const cards = new THREE.Group()
  const cardFan = new THREE.Group()
  const cw = 3.5 * S * 2.3, ch = 2 * S * 2.3
  const cardBack = businessCardBack(renderer)
  const bizCards = [0, 1, 2].map((i) => {
    const m = sheet(cw, ch, plainPaper(renderer, '#ffffff'), cardBack, edge)
    m.position.set(i * 0.18 - 0.18, i * -0.16 + 0.16, i * -0.06)
    m.rotation.z = (1 - i) * 0.09
    cardFan.add(m)
    return m
  })
  // The back card shows its navy side, so the fan reads front and back.
  bizCards[2].rotation.y = Math.PI
  bizCards[2].position.set(0.5, -0.55, -0.25)
  cards.add(cardFan)

  // Invisible hover area for the program: follows its pose but not the hover effect, so opening never makes it "un-hover".
  const hitbox = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ visible: false }))
  const world = new THREE.Group()
  world.add(program, card, veryMerry, booklet, navyCard, stack, cards, hitbox)
  scene.add(world)

  // The fan (stage 2) is laid out like proofs on a table: every piece shares
  // the same tilt, so their planes are parallel and none can pass through
  // another; each is only turned within its own plane and stacked with a gap.
  const FAN_X = 0.04, FAN_Y = -0.2
  // Poses per stage, in local units around the stage anchor.
  const objects: { obj: THREE.Object3D; poses: Pose[] }[] = [
    {
      obj: program,
      poses: [
        { p: [0, 0, 0.3], r: [-0.12, -0.5, 0.06], s: 1.25, o: 1, fold: 1 },
        { p: [0, 0, 0], r: [0.08, 0.32, -0.03], s: 0.95, o: 1, fold: 0 },
        { p: [-0.1, 0.05, 0.3], r: [FAN_X, FAN_Y, 0.03], s: 0.95, o: 1, fold: 1 },
        { ...HIDE_UP, fold: 1 },
        { ...HIDE_UP, fold: 1 },
      ],
    },
    {
      obj: card,
      poses: [HIDE_DOWN, HIDE_DOWN, { p: [1.3, 1.1, -0.6], r: [FAN_X, FAN_Y, -0.1], s: 0.95, o: 1 }, HIDE_UP, HIDE_UP],
    },
    {
      obj: veryMerry,
      poses: [HIDE_DOWN, HIDE_DOWN, { p: [1.5, -1.1, -0.1], r: [FAN_X, FAN_Y, -0.06], s: 1, o: 1 }, HIDE_UP, HIDE_UP],
    },
    {
      obj: booklet,
      poses: [HIDE_DOWN, HIDE_DOWN, { p: [-1.7, -1.2, -0.25], r: [FAN_X, FAN_Y, 0.12], s: 0.95, o: 1 }, HIDE_UP, HIDE_UP],
    },
    {
      obj: navyCard,
      poses: [HIDE_DOWN, HIDE_DOWN, { p: [-1.85, 1.0, -0.75], r: [FAN_X, FAN_Y, 0.1], s: 0.9, o: 1 }, HIDE_UP, HIDE_UP],
    },
    {
      obj: stack,
      poses: [HIDE_DOWN, HIDE_DOWN, HIDE_DOWN, { p: [0, -0.2, 0], r: [-0.9, 0.2, 0.5], s: 1.25, o: 1 }, { p: [0, -6, -1], r: [-1.2, 0.2, 0.6], s: 1, o: 0 }],
    },
    {
      obj: cards,
      poses: [HIDE_DOWN, HIDE_DOWN, HIDE_DOWN, HIDE_DOWN, { p: [0, 0.1, 0.4], r: [-0.18, -0.38, 0.06], s: 1, o: 1 }],
    },
  ]

  // Footprint of each stage's visible objects (world units, at world scale 1),
  // so the stage can be kept clear of the text column on narrower windows.
  function poseAt(i: number) {
    for (const { obj, poses } of objects) {
      const P = poses[i]
      obj.position.set(...P.p)
      obj.rotation.set(...P.r)
      obj.scale.setScalar(Math.max(0.0001, P.s))
      obj.visible = P.o > 0.01
      if (obj === program) setFold(P.fold ?? 0)
    }
  }
  // Each stage's footprint as it really appears on screen (perspective and
  // tilt included), in world units at the z = 0 plane, at world scale 1.
  const corner = new THREE.Vector3()
  function measure(i: number) {
    poseAt(i)
    world.position.set(0, 0, 0)
    world.rotation.set(0, 0, 0)
    world.scale.setScalar(1)
    world.updateMatrixWorld(true)
    camera.updateMatrixWorld()
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const { obj } of objects) {
      if (!obj.visible) continue
      obj.traverse((c) => {
        const mesh = c as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.geometry.computeBoundingBox()
        const bb = mesh.geometry.boundingBox!.clone()
        // The pile is one sheet drawn many times, stacked back along z.
        if (mesh === (pile as unknown)) bb.min.z -= COUNT * 0.032
        for (let k = 0; k < 8; k++) {
          corner.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z)
          corner.applyMatrix4(mesh.matrixWorld).project(camera)
          minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x)
          minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y)
        }
      })
    }
    // NDC to world units at z = 0
    const hw = viewW / 2, hh = viewH / 2
    return { cx: ((minX + maxX) / 2) * hw, w: (maxX - minX) * hw, cy: ((minY + maxY) / 2) * hh, h: (maxY - minY) * hh }
  }
  let footprints: { cx: number; w: number; cy: number; h: number }[] = []
  function measureAll() {
    footprints = [0, 1, 2, 3, 4].map(measure)
    for (const { obj } of objects) obj.visible = true
  }

  // Horizontal extent (px) of the text on each stage, set from the page.
  let copyEls: (HTMLElement | null)[] = []
  let copyBounds: ({ left: number; right: number } | null)[] = []
  /** The page's content column (the .wrap around each stage's text), so the 3D lines up with it on wide screens. */
  let colBounds: ({ left: number; right: number } | null)[] = []
  function measureCopy() {
    colBounds = copyEls.map((el) => {
      const wrap = el?.closest('.wrap') as HTMLElement | null
      if (!wrap) return null
      const r = wrap.getBoundingClientRect()
      const cs = getComputedStyle(wrap)
      return { left: r.left + parseFloat(cs.paddingLeft || '0'), right: r.right - parseFloat(cs.paddingRight || '0') }
    })
    copyBounds = copyEls.map((el) => {
      if (!el) return null
      let left = Infinity, right = -Infinity
      for (const c of [el, ...Array.from(el.children)]) {
        const r = c.getBoundingClientRect()
        if (r.width === 0) continue
        left = Math.min(left, r.left)
        right = Math.max(right, r.right)
      }
      return left < right ? { left, right } : null
    })
  }

  // Which side of the screen the 3D sits on for each stage (+1 right, -1 left).
  let sides = [1, -1, 1, -1, 1]
  let target = 0
  let current = 0
  let pointerX = 0, pointerY = 0
  let viewW = 1, viewH = 1, mobile = false

  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    viewH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z
    viewW = viewH * camera.aspect
    mobile = w < 861
    measureCopy()
    measureAll()
  }
  resize()
  window.addEventListener('resize', resize)
  // Hovering the folded program at the top of the page opens it (a tap does the same on touch screens).
  let pointerSeen = false
  let tapOpen = false
  const onPointer = (e: PointerEvent) => {
    pointerX = (e.clientX / window.innerWidth) * 2 - 1
    pointerY = (e.clientY / window.innerHeight) * 2 - 1
    if (e.pointerType === 'mouse') pointerSeen = true
  }
  const onTap = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return
    onPointer(e)
    tapOpen = overProgram() ? !tapOpen : false
  }
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('pointerdown', onTap, { passive: true })
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  function overProgram() {
    ndc.set(pointerX, -pointerY)
    ray.setFromCamera(ndc, camera)
    hitbox.updateMatrixWorld()
    return ray.intersectObject(hitbox, false).length > 0
  }
  let hover = 0

  function anchorFor(stage: number) {
    const i = Math.max(0, Math.min(4, Math.round(stage)))
    const fp = footprints[i]
    // Never taller than 86% of the screen (10% allowance for sway and tilt).
    const fitH = fp && fp.h > 0 ? (viewH * 0.86) / (fp.h * 1.1) : Infinity
    if (mobile) {
      const s = Math.min(0.85, viewW / 7, fp && fp.w > 0 ? (viewW * 0.92) / (fp.w * 1.1) : Infinity, fitH * 0.5)
      return { x: -(fp?.cx ?? 0) * s, y: viewH * 0.25 - (fp?.cy ?? 0) * s, scale: s }
    }
    const scale = Math.min(1.15, viewW / 13, fitH)
    const copy = copyBounds[i]
    const w = window.innerWidth
    const pxPerUnit = w / viewW
    const toWorld = (px: number) => (px - w / 2) / pxPerUnit
    const gap = 28
    // The free strip beside the text, or the screen half when there's no text.
    // Inside the content column, like the text (falls back to the window edges).
    const colL = Math.max(gap, colBounds[i]?.left ?? gap)
    const colR = Math.min(w - gap, colBounds[i]?.right ?? w - gap)
    const freeL = copy ? (sides[i] > 0 ? copy.right + gap : colL) : sides[i] > 0 ? w / 2 : colL
    const freeR = copy ? (sides[i] > 0 ? colR : copy.left - gap) : sides[i] > 0 ? colR : w / 2
    if (!fp || fp.w <= 0) return { x: sides[i] * viewW * 0.25, y: 0, scale }
    const freeW = Math.max(0, freeR - freeL) / pxPerUnit
    const fit = Math.max(scale * 0.4, Math.min(scale, freeW / (fp.w * 1.1)))
    // Centered in the free strip and vertically on screen.
    return { x: (toWorld(freeL) + toWorld(freeR)) / 2 - fp.cx * fit, y: -fp.cy * fit, scale: fit }
  }

  const start = performance.now()
  let last = start
  let raf = 0
  let running = true

  function frame() {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const now = performance.now()
    const t = (now - start) / 1000
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    current = opts.reducedMotion ? target : lerp(current, target, 1 - Math.exp(-dt * 5))

    // Anchor eases between the stage sides.
    const i0 = Math.floor(current), i1 = Math.min(4, i0 + 1)
    const k = smooth(Math.min(1, Math.max(0, current - i0)))
    const a0 = anchorFor(i0), a1 = anchorFor(i1)
    world.position.set(lerp(a0.x, a1.x, k), lerp(a0.y, a1.y, k), 0)
    world.scale.setScalar(lerp(a0.scale, a1.scale, k))
    const idle = opts.reducedMotion ? 0 : 1
    world.rotation.set(pointerY * 0.06 * idle, pointerX * 0.1 * idle, 0)

    for (const { obj, poses } of objects) {
      const A = poses[i0], B = poses[i1]
      obj.position.set(lerp(A.p[0], B.p[0], k), lerp(A.p[1], B.p[1], k) + Math.sin(t * 0.9 + obj.id) * 0.06 * idle, lerp(A.p[2], B.p[2], k))
      // One shared sway, so pieces that sit parallel stay parallel.
      obj.rotation.set(lerp(A.r[0], B.r[0], k), lerp(A.r[1], B.r[1], k) + Math.sin(t * 0.5) * 0.03 * idle, lerp(A.r[2], B.r[2], k))
      obj.scale.setScalar(Math.max(0.0001, lerp(A.s, B.s, k)))
      setOpacity(obj, lerp(A.o, B.o, k))
      if (obj === program) {
        // Open on hover, only on the first stage (where it sits folded), easing back when the mouse leaves.
        // Closed: the cover. Open: the whole spread (shrunk to 62%, three panels wide).
        hitbox.position.copy(obj.position)
        hitbox.rotation.copy(obj.rotation)
        hitbox.scale.copy(obj.scale)
        if (hover > 0.5) hitbox.scale.x *= 1.9
        const want = current < 0.5 && ((pointerSeen && overProgram()) || tapOpen) ? 1 : 0
        if (current >= 0.5) tapOpen = false
        // Slow enough to watch it unfold (about 1.5 s open), a little quicker to fold back.
        hover = opts.reducedMotion ? want : lerp(hover, want, 1 - Math.exp(-dt * (want ? 2 : 2.6)))
        const h = smooth(Math.min(1, Math.max(0, hover)))
        setFold(lerp(A.fold ?? 0, B.fold ?? 0, k) * (1 - h))
        // Open, it's three panels wide: shrink it and turn it toward the viewer so it stays clear of the text.
        obj.scale.multiplyScalar(lerp(1, 0.62, h))
        obj.rotation.y = lerp(obj.rotation.y, 0.12, h)
        obj.rotation.x = lerp(obj.rotation.x, 0, h)
        document.documentElement.style.cursor = want && current < 0.5 ? 'pointer' : ''
      }
    }
    // Cards drift gently once they're on stage.
    cardFan.rotation.y = Math.sin(t * 0.5) * 0.12 * idle
    renderer.render(scene, camera)
  }
  frame()

  return {
    setStage(v: number) {
      target = Math.max(0, Math.min(4, v))
    },
    setSide(s: number[]) {
      sides = s
    },
    setCopy(els: (HTMLElement | null)[]) {
      copyEls = els
      measureCopy()
      // Text can reflow once web fonts finish loading.
      document.fonts?.ready.then(measureCopy)
    },
    dispose() {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerdown', onTap)
      renderer.dispose()
    },
  }
}
