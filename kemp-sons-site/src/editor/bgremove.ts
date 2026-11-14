/**
 * Background removal for portraits, run entirely in the customer's browser
 * (no upload, no per-photo fee). Uses MODNet portrait matting (Apache-2.0,
 * Xenova/modnet) on ONNX Runtime Web (MIT). The model and runtime are served
 * from this site (/models, /ort) and only download the first time someone
 * turns the option on.
 */

// 8-bit build (6.6 MB): in testing it kept white shirts solid where the full-size build didn't.
const MODEL_URL = '/models/modnet.onnx'
/** Longest side of the cut-out photo. Keeps the PNG small enough to save and upload. */
const MAX_EDGE = 1800

type Ort = typeof import('onnxruntime-web')
type Session = import('onnxruntime-web').InferenceSession

let sessionPromise: Promise<{ ort: Ort; session: Session }> | null = null

function getSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import('onnxruntime-web/wasm')
      ort.env.wasm.wasmPaths = '/ort/'
      // Threads need cross-origin isolation, which this site doesn't use.
      ort.env.wasm.numThreads = 1
      const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
      return { ort, session }
    })().catch((e) => {
      sessionPromise = null
      throw e
    })
  }
  return sessionPromise
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = src
  })
}

/** Model input size: shortest side 512, both sides multiples of 32 (per the model's preprocessor config). */
function inputSize(w: number, h: number) {
  const s = 512 / Math.min(w, h)
  const r32 = (v: number) => Math.max(32, Math.round((v * s) / 32) * 32)
  return { w: r32(w), h: r32(h) }
}

/**
 * Returns a PNG data URL of the photo with its background made transparent,
 * plus its pixel size. Works best on photos of people.
 */
export async function removeBackground(src: string, onStatus?: (msg: string) => void): Promise<{ src: string; w: number; h: number }> {
  onStatus?.('Getting the background remover ready (first time only)')
  const [{ ort, session }, img] = await Promise.all([getSession(), loadImg(src)])
  onStatus?.('Removing the background')

  // 1. Model input: RGB normalized to [-1, 1], channels first.
  const size = inputSize(img.naturalWidth, img.naturalHeight)
  const c = document.createElement('canvas')
  c.width = size.w
  c.height = size.h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0, size.w, size.h)
  const px = g.getImageData(0, 0, size.w, size.h).data
  const n = size.w * size.h
  const data = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) {
    data[i] = px[i * 4] / 127.5 - 1
    data[n + i] = px[i * 4 + 1] / 127.5 - 1
    data[2 * n + i] = px[i * 4 + 2] / 127.5 - 1
  }
  const input = new ort.Tensor('float32', data, [1, 3, size.h, size.w])
  const out = await session.run({ [session.inputNames[0]]: input })
  const matte = out[session.outputNames[0]].data as Float32Array

  // 2. Matte as an alpha mask at model size.
  const m = document.createElement('canvas')
  m.width = size.w
  m.height = size.h
  const mg = m.getContext('2d')!
  const mask = mg.createImageData(size.w, size.h)
  for (let i = 0; i < n; i++) {
    // Firm up the edges a little: near-transparent goes clear, near-solid goes solid.
    const a = Math.min(1, Math.max(0, (matte[i] - 0.06) / 0.88))
    mask.data[i * 4 + 3] = Math.round(a * 255)
  }
  mg.putImageData(mask, 0, 0)

  // 3. Apply the mask (scaled up smoothly) to the photo at output size.
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
  const ow = Math.round(img.naturalWidth * scale)
  const oh = Math.round(img.naturalHeight * scale)
  const o = document.createElement('canvas')
  o.width = ow
  o.height = oh
  const og = o.getContext('2d')!
  og.imageSmoothingQuality = 'high'
  og.drawImage(img, 0, 0, ow, oh)
  og.globalCompositeOperation = 'destination-in'
  og.drawImage(m, 0, 0, ow, oh)
  return { src: o.toDataURL('image/png'), w: ow, h: oh }
}
