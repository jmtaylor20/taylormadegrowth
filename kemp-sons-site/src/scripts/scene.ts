import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import {
  programTextures, christmasTexture, yardSignTexture, stickerSheetTexture,
  sportsProgramTexture, letterheadTexture, plainPaper, businessCardFront, businessCardBack,
} from './textures'

/**
 * The scroll story. `stage` is a continuous value from 0 to 4 driven by
 * scroll position:
 *   0 sheet      an open printed sheet floats in
 *   1 fold       it folds into a finished funeral program
 *   2 fan        the rest of the online lineup joins it
 *   3 stack      fresh sheets stack up off the press
 *   4 cards      the owners' business cards, full-color logo
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

  // --- Funeral program: right half fixed, left half folds behind it ---
  const prog = programTextures(renderer)
  const pw = 5.5 * S, ph = 8.5 * S
  const program = new THREE.Group()
  const right = sheet(pw, ph, prog.front, prog.insideLeft, edge)
  right.position.x = pw / 2
  const leftPivot = new THREE.Group()
  const left = sheet(pw, ph, prog.back, prog.insideRight, edge)
  left.position.set(-pw / 2, 0, PAPER_THICK * 1.2)
  leftPivot.add(left)
  const programInner = new THREE.Group()
  programInner.add(right, leftPivot)
  program.add(programInner)

  // --- The rest of the lineup ---
  const card = sheet(5 * S, 7 * S, christmasTexture(renderer), paperBack, edge)
  const signGroup = new THREE.Group()
  const sign = sheet(24 * S * 0.28, 18 * S * 0.28, yardSignTexture(renderer), yardSignTexture(renderer), edge)
  const stakeMat = new THREE.MeshStandardMaterial({ color: 0x8c8f93, metalness: 0.6, roughness: 0.4, transparent: true })
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 10), stakeMat)
  stake.position.y = -1.6
  signGroup.add(sign, stake)
  const stickers = sheet(8.5 * S * 0.62, 11 * S * 0.62, stickerSheetTexture(renderer), paperBack, edge)
  const sports = sheet(5.5 * S, 8.5 * S * 0.97, sportsProgramTexture(renderer), paperBack, edge)

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

  // --- The owners' business cards, fanned out ---
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

  const world = new THREE.Group()
  world.add(program, card, signGroup, stickers, sports, stack, cards)
  scene.add(world)

  // Poses per stage, in local units around the stage anchor.
  const objects: { obj: THREE.Object3D; poses: Pose[] }[] = [
    {
      obj: program,
      poses: [
        { p: [0, 0.1, 0], r: [-0.32, -0.42, 0.1], s: 1.05, o: 1, fold: 0 },
        { p: [0.35, 0, 0.6], r: [0.06, 0.4, -0.05], s: 1.2, o: 1, fold: 1 },
        { p: [-0.6, 0.25, 0.4], r: [0.02, 0.28, 0.06], s: 0.95, o: 1, fold: 1 },
        { ...HIDE_UP, fold: 1 },
        { ...HIDE_UP, fold: 1 },
      ],
    },
    {
      obj: card,
      poses: [HIDE_DOWN, HIDE_DOWN, { p: [1.15, 1.1, -0.5], r: [0.05, -0.3, -0.12], s: 0.95, o: 1 }, HIDE_UP, HIDE_UP],
    },
    {
      obj: signGroup,
      poses: [HIDE_DOWN, HIDE_DOWN, { p: [1.45, -1.05, 0.6], r: [-0.06, -0.38, 0.05], s: 1, o: 1 }, HIDE_UP, HIDE_UP],
    },
    {
      obj: stickers,
      poses: [HIDE_DOWN, HIDE_DOWN, { p: [-1.75, -1.35, -0.4], r: [0.1, 0.42, 0.12], s: 0.95, o: 1 }, HIDE_UP, HIDE_UP],
    },
    {
      obj: sports,
      poses: [HIDE_DOWN, HIDE_DOWN, { p: [0.3, 0.2, -1.6], r: [0.02, -0.1, -0.04], s: 0.95, o: 1 }, HIDE_UP, HIDE_UP],
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
      if (obj === program) {
        leftPivot.rotation.y = -Math.PI * smooth(P.fold ?? 0)
        programInner.position.x = -pw / 2 * smooth(P.fold ?? 0)
      }
    }
  }
  const footprints = [0, 1, 2, 3, 4].map((i) => {
    poseAt(i)
    world.updateMatrixWorld(true)
    const box = new THREE.Box3()
    for (const { obj } of objects) if (obj.visible) box.expandByObject(obj)
    return { cx: (box.min.x + box.max.x) / 2, w: box.max.x - box.min.x }
  })
  for (const { obj } of objects) obj.visible = true

  // Horizontal extent (px) of the text on each stage, set from the page.
  let copyEls: (HTMLElement | null)[] = []
  let copyBounds: ({ left: number; right: number } | null)[] = []
  function measureCopy() {
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
  }
  resize()
  window.addEventListener('resize', resize)
  const onPointer = (e: PointerEvent) => {
    pointerX = (e.clientX / window.innerWidth) * 2 - 1
    pointerY = (e.clientY / window.innerHeight) * 2 - 1
  }
  window.addEventListener('pointermove', onPointer, { passive: true })

  function anchorFor(stage: number) {
    const i = Math.max(0, Math.min(4, Math.round(stage)))
    if (mobile) return { x: 0, y: viewH * 0.25, scale: Math.min(0.85, viewW / 7) }
    const scale = Math.min(1.15, viewW / 13)
    const x = sides[i] * viewW * 0.25
    // Only steps in when the object would run into the text; wide windows keep the default.
    const copy = copyBounds[i]
    const fp = footprints[i]
    if (!copy || fp.w <= 0) return { x, y: 0, scale }
    const w = window.innerWidth
    const pxPerUnit = w / viewW
    const toWorld = (px: number) => (px - w / 2) / pxPerUnit
    const gap = 24
    const freeL = sides[i] > 0 ? copy.right + gap : gap
    const freeR = sides[i] > 0 ? w - gap : copy.left - gap
    // 10% allowance for the idle sway and pointer tilt
    const halfPx = (fp.w * scale * 1.1 * pxPerUnit) / 2
    const centerPx = w / 2 + (x + fp.cx * scale) * pxPerUnit
    if (centerPx - halfPx >= freeL && centerPx + halfPx <= freeR) return { x, y: 0, scale }
    const freeW = Math.max(0, freeR - freeL) / pxPerUnit
    const fit = Math.max(scale * 0.45, Math.min(scale, freeW / (fp.w * 1.1)))
    return { x: (toWorld(freeL) + toWorld(freeR)) / 2 - fp.cx * fit, y: 0, scale: fit }
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
      obj.rotation.set(lerp(A.r[0], B.r[0], k), lerp(A.r[1], B.r[1], k) + Math.sin(t * 0.5 + obj.id) * 0.03 * idle, lerp(A.r[2], B.r[2], k))
      obj.scale.setScalar(Math.max(0.0001, lerp(A.s, B.s, k)))
      setOpacity(obj, lerp(A.o, B.o, k))
      if (obj === program) {
        const fold = lerp(A.fold ?? 0, B.fold ?? 0, k)
        leftPivot.rotation.y = -Math.PI * smooth(fold)
        // keep the folded program centered on its spine
        programInner.position.x = lerp(0, -pw / 2, smooth(fold))
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
      renderer.dispose()
    },
  }
}
