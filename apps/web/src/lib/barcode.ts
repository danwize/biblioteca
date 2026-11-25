import { releaseCanvas, scaleToWhiteCanvas, type Region } from './canvas'
import { isValidIsbn13, normalizeIsbn } from './isbn'

export type RgbaPixels = { data: Uint8ClampedArray; width: number; height: number }

export type BarcodeCandidatePlan = {
  // Region of the source image, as fractions of its width and height.
  region: Region
  // Longest side of the candidate after downscaling; images are never upscaled.
  maxSide: number
}

const FULL = { x: 0, y: 0, width: 1, height: 1 }
const BOTTOM = { x: 0, y: 0.45, width: 1, height: 0.55 }

// The native BarcodeDetector is fast, so it sees the photo once at full resolution, where a
// small or distant barcode still has enough pixels per bar. The cap keeps 12 MP photos at
// full size but stops 50-200 MP photos from allocating a canvas big enough to crash the tab.
export const NATIVE_FULL_RESOLUTION_PLAN: readonly BarcodeCandidatePlan[] = [
  { region: FULL, maxSide: 4096 }
]

// A small, fixed set of downscaled crops for ZXing. Phone photos are 12+
// megapixels; downscaling keeps a ZXing pass fast, while the half crops keep about half
// of a 4032px photo's resolution or more (~3px per bar module for a normal-size
// back-cover barcode). The halves cover the barcode's usual spot on a back cover however
// the phone was held: bottom when upright, right or left when sideways, top when upside
// down. ZXing decodes each one as-is and rotated a quarter turn (see createZxingIsbnDecoder).
export const BARCODE_CANDIDATE_PLAN: readonly BarcodeCandidatePlan[] = [
  { region: FULL, maxSide: 1280 },
  { region: BOTTOM, maxSide: 2000 },
  { region: { x: 0.45, y: 0, width: 0.55, height: 1 }, maxSide: 2000 },
  { region: { x: 0, y: 0, width: 0.55, height: 1 }, maxSide: 2000 },
  { region: { x: 0, y: 0, width: 1, height: 0.55 }, maxSide: 2000 },
  { region: FULL, maxSide: 2000 }
]

export function isbnFromBarcodeValue(rawValue: string): string | null {
  const value = normalizeIsbn(rawValue)
  return isValidIsbn13(value) ? value : null
}

// Never rejects: any failure reading the photo or building candidates means "no barcode",
// so the scan moves on to OCR instead of being left in the scanning state.
export async function detectIsbnBarcode(dataUrl: string): Promise<string | null> {
  const created: HTMLCanvasElement[] = []
  try {
    const image = await imageFromDataUrl(dataUrl)
    const build = (plan: readonly BarcodeCandidatePlan[]) => releasedAfterUse(barcodeCandidates(image, plan, created))

    const nativeIsbn = await detectWithNativeBarcodeDetector(build(NATIVE_FULL_RESOLUTION_PLAN))
    if (nativeIsbn) return nativeIsbn

    // The native detector is missing on many phone browsers (and sometimes finds nothing),
    // so ZXing always gets a pass over the downscaled candidates.
    return await detectWithZxing(build(BARCODE_CANDIDATE_PLAN))
  } catch {
    return null
  } finally {
    created.forEach(releaseCanvas)
  }
}

async function detectWithNativeBarcodeDetector(candidates: Iterable<HTMLCanvasElement>): Promise<string | null> {
  if (!('BarcodeDetector' in window)) return null

  try {
    const detector = new BarcodeDetector({ formats: ['ean_13', 'upc_a'] })
    for (const candidate of candidates) {
      const results = await detector.detect(candidate)
      const isbn = results.map((result) => isbnFromBarcodeValue(result.rawValue)).find(Boolean)
      if (isbn) return isbn
    }
  } catch {
    return null
  }

  return null
}

async function detectWithZxing(candidates: Iterable<HTMLCanvasElement>): Promise<string | null> {
  try {
    const decode = await createZxingIsbnDecoder()
    for (const canvas of candidates) {
      const pixels = context2d(canvas)?.getImageData(0, 0, canvas.width, canvas.height)
      const isbn = pixels ? decode(pixels) : null
      if (isbn) return isbn
      // ZXing decodes synchronously; yield between candidates so the UI stays responsive.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  } catch {
    return null
  }

  return null
}

// ZXing reports one barcode per decode. When it is not an ISBN (a price sticker, a
// publisher's EAN), that barcode is blanked out and the image decoded again, so an ISBN
// barcode elsewhere in the same image is still found, like the native detector's
// multi-result check.
const MAX_BARCODES_PER_IMAGE = 4

// Decodes an EAN-13/UPC-A ISBN barcode in any orientation. Each image is tried as-is and
// rotated a quarter turn; with TRY_HARDER, ZXing also scans every row reversed, which
// covers the upside-down (180°) and 270° cases without extra passes.
export async function createZxingIsbnDecoder(): Promise<(pixels: RgbaPixels) => string | null> {
  const { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } =
    await import('@zxing/library')

  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A])
  hints.set(DecodeHintType.TRY_HARDER, true)
  const reader = new MultiFormatReader()
  reader.setHints(hints)

  const decodeOnce = (luminance: Uint8ClampedArray, width: number, height: number) => {
    try {
      const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, width, height)))
      return reader.decodeWithState(bitmap)
    } catch {
      return null
    } finally {
      reader.reset()
    }
  }

  const decodeLuminance = (source: Uint8ClampedArray, width: number, height: number) => {
    let luminance = source
    for (let attempt = 0; attempt < MAX_BARCODES_PER_IMAGE; attempt += 1) {
      const result = decodeOnce(luminance, width, height)
      if (!result) return null
      const isbn = isbnFromBarcodeValue(result.getText())
      if (isbn) return isbn
      if (attempt === 0) luminance = new Uint8ClampedArray(source)
      blankOut(luminance, width, height, result.getResultPoints())
    }
    return null
  }

  return ({ data, width, height }) => {
    const luminance = toLuminance(data, width * height)
    return decodeLuminance(luminance, width, height)
      ?? decodeLuminance(rotateQuarterTurn(luminance, width, height), height, width)
  }
}

// Grayscale, alpha-composited on white so transparent pixels read as paper, not ink.
function toLuminance(data: Uint8ClampedArray, pixelCount: number): Uint8ClampedArray {
  const luminance = new Uint8ClampedArray(pixelCount)
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4
    const gray = (data[offset] + data[offset + 1] * 2 + data[offset + 2]) / 4
    const alpha = data[offset + 3] / 255
    luminance[index] = gray * alpha + 255 * (1 - alpha)
  }
  return luminance
}

function rotateQuarterTurn(luminance: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const rotated = new Uint8ClampedArray(luminance.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rotated[x * height + (height - 1 - y)] = luminance[y * width + x]
    }
  }
  return rotated
}

// Paints white over a decoded 1D barcode, and only over that barcode, so an ISBN barcode
// right next to it survives. ZXing reports the ends of the scan row it read; the bars run
// up and down from that row for as long as rows keep a similar number of bar edges.
function blankOut(luminance: Uint8ClampedArray, width: number, height: number, points: { getX(): number; getY(): number }[]) {
  if (points.length === 0) return
  const xs = points.map((point) => point.getX())
  const ys = points.map((point) => point.getY())
  const padding = Math.ceil((Math.max(...xs) - Math.min(...xs)) * 0.05) + 1
  const left = Math.max(0, Math.floor(Math.min(...xs)) - padding)
  const right = Math.min(width - 1, Math.ceil(Math.max(...xs)) + padding)
  const scanRow = Math.min(height - 1, Math.max(0, Math.round(ys.reduce((sum, y) => sum + y, 0) / ys.length)))

  const rowSegment = (y: number) => luminance.subarray(y * width + left, y * width + right + 1)
  const scanSegment = rowSegment(scanRow)
  const threshold = (Math.min(...scanSegment) + Math.max(...scanSegment)) / 2
  const edges = (y: number) => {
    let count = 0
    const segment = rowSegment(y)
    for (let x = 1; x < segment.length; x += 1) {
      if ((segment[x - 1] < threshold) !== (segment[x] < threshold)) count += 1
    }
    return count
  }
  const minEdges = edges(scanRow) / 2
  let top = scanRow
  while (top > 0 && edges(top - 1) >= minEdges) top -= 1
  let bottom = scanRow
  while (bottom < height - 1 && edges(bottom + 1) >= minEdges) bottom += 1

  const verticalPadding = Math.ceil(padding / 2)
  for (let y = Math.max(0, top - verticalPadding); y <= Math.min(height - 1, bottom + verticalPadding); y += 1) {
    luminance.fill(255, y * width + left, y * width + right + 1)
  }
}

function* barcodeCandidates(
  image: HTMLImageElement,
  plan: readonly BarcodeCandidatePlan[],
  created: HTMLCanvasElement[]
): Generator<HTMLCanvasElement> {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height

  for (const { region, maxSide } of plan) {
    const canvas = scaleToWhiteCanvas(image, {
      x: region.x * width,
      y: region.y * height,
      width: region.width * width,
      height: region.height * height
    }, maxSide, { willReadFrequently: true })
    if (!canvas) continue
    created.push(canvas)
    yield canvas
  }
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  return canvas.getContext('2d', { willReadFrequently: true })
}

// Canvases are large; free each as soon as the detector moves past it.
function* releasedAfterUse(candidates: Iterable<HTMLCanvasElement>): Generator<HTMLCanvasElement> {
  for (const canvas of candidates) {
    yield canvas
    releaseCanvas(canvas)
  }
}

function imageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to read captured image.'))
    image.src = dataUrl
  })
}
