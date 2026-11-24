import { isValidIsbn13, normalizeIsbn } from './isbn'

export type RgbaPixels = { data: Uint8ClampedArray; width: number; height: number }

type Region = { x: number; y: number; width: number; height: number }

export type BarcodeCandidatePlan = {
  // Region of the source image, as fractions of its width and height.
  region: Region
  // Longest side of the candidate after downscaling; images are never upscaled.
  maxSide: number
}

const FULL = { x: 0, y: 0, width: 1, height: 1 }

// A small, fixed set of crops. Phone photos are 12+ megapixels; every candidate is
// downscaled so a full pass stays fast, but the half crops keep enough resolution
// (about two thirds of a 4032px photo) for a normal-size back-cover barcode. The halves
// cover the barcode's usual spot on a back cover however the phone was held: bottom
// when upright, right or left when sideways, top when upside down. Each candidate is
// decoded both as-is and rotated a quarter turn (see createZxingIsbnDecoder).
export const BARCODE_CANDIDATE_PLAN: readonly BarcodeCandidatePlan[] = [
  { region: FULL, maxSide: 1280 },
  { region: { x: 0, y: 0.45, width: 1, height: 0.55 }, maxSide: 2000 },
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
  try {
    const image = await imageFromDataUrl(dataUrl)
    // Candidates are built lazily and once, then shared by both detectors.
    const candidates = replayable(barcodeCandidates(image))

    const nativeIsbn = await detectWithNativeBarcodeDetector(candidates())
    if (nativeIsbn) return nativeIsbn

    // The native detector is missing on many phone browsers (and sometimes finds nothing),
    // so ZXing always gets a pass over the same candidates.
    return await detectWithZxing(candidates())
  } catch {
    return null
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

  const decodeLuminance = (luminance: Uint8ClampedArray, width: number, height: number) => {
    try {
      const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, width, height)))
      return isbnFromBarcodeValue(reader.decodeWithState(bitmap).getText())
    } catch {
      return null
    } finally {
      reader.reset()
    }
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

function* barcodeCandidates(image: HTMLImageElement): Generator<HTMLCanvasElement> {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height

  for (const { region, maxSide } of BARCODE_CANDIDATE_PLAN) {
    yield cropScaledCanvas(image, {
      x: region.x * width,
      y: region.y * height,
      width: region.width * width,
      height: region.height * height
    }, maxSide)
  }
}

// Crops and downscales in one draw so a full-resolution copy of the photo is never made.
function cropScaledCanvas(image: HTMLImageElement, region: Region, maxSide: number): HTMLCanvasElement {
  const ratio = Math.min(1, maxSide / Math.max(region.width, region.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(region.width * ratio))
  canvas.height = Math.max(1, Math.round(region.height * ratio))
  const context = context2d(canvas)
  if (!context) return canvas

  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(
    image,
    Math.round(region.x),
    Math.round(region.y),
    Math.round(region.width),
    Math.round(region.height),
    0,
    0,
    canvas.width,
    canvas.height
  )
  return canvas
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  return canvas.getContext('2d', { willReadFrequently: true })
}

function replayable<T>(source: Iterator<T>): () => Generator<T> {
  const seen: T[] = []
  let done = false
  return function* () {
    for (let index = 0; ; index += 1) {
      if (index === seen.length) {
        if (done) return
        const next = source.next()
        if (next.done) {
          done = true
          return
        }
        seen.push(next.value)
      }
      yield seen[index]
    }
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
