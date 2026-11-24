import { isValidIsbn13, normalizeIsbn } from './isbn'

export type RgbaPixels = { data: Uint8ClampedArray; width: number; height: number }

type Region = { x: number; y: number; width: number; height: number }

export type BarcodeCandidatePlan = {
  // Region of the source image, as fractions of its width and height.
  region: Region
  // Longest side of the candidate after downscaling; images are never upscaled.
  maxSide: number
  rotation: 0 | 90
}

const BOTTOM = { x: 0, y: 0.45, width: 1, height: 0.55 }

// A small, fixed set of crops/rotations. Phone photos are 12+ megapixels; every candidate
// is downscaled so a full pass stays fast, ordered so the common cases (barcode anywhere
// in a straight shot, barcode on the lower half of a back cover) are tried first.
export const BARCODE_CANDIDATE_PLAN: readonly BarcodeCandidatePlan[] = [
  { region: { x: 0, y: 0, width: 1, height: 1 }, maxSide: 1280, rotation: 0 },
  { region: BOTTOM, maxSide: 1280, rotation: 0 },
  { region: { x: 0.35, y: 0.45, width: 0.65, height: 0.55 }, maxSide: 1280, rotation: 0 },
  { region: { x: 0, y: 0.25, width: 1, height: 0.5 }, maxSide: 1280, rotation: 0 },
  { region: { x: 0, y: 0, width: 1, height: 1 }, maxSide: 1280, rotation: 90 },
  { region: BOTTOM, maxSide: 1280, rotation: 90 },
  { region: { x: 0, y: 0, width: 1, height: 1 }, maxSide: 2000, rotation: 0 }
]

export function isbnFromBarcodeValue(rawValue: string): string | null {
  const value = normalizeIsbn(rawValue)
  return isValidIsbn13(value) ? value : null
}

export async function detectIsbnBarcode(dataUrl: string): Promise<string | null> {
  const image = await imageFromDataUrl(dataUrl)

  const nativeIsbn = await detectWithNativeBarcodeDetector(barcodeCandidates(image))
  if (nativeIsbn) return nativeIsbn

  // The native detector is missing on many phone browsers (and sometimes finds nothing),
  // so ZXing always gets a pass over the same candidates.
  return detectWithZxing(barcodeCandidates(image))
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
  let decode: (pixels: RgbaPixels) => string | null
  try {
    decode = await createZxingIsbnDecoder()
  } catch {
    return null
  }

  for (const canvas of candidates) {
    const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height)
    const isbn = pixels ? decode(pixels) : null
    if (isbn) return isbn
    // ZXing decodes synchronously; yield between candidates so the UI stays responsive.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return null
}

export async function createZxingIsbnDecoder(): Promise<(pixels: RgbaPixels) => string | null> {
  const { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } =
    await import('@zxing/library')

  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A])
  hints.set(DecodeHintType.TRY_HARDER, true)
  const reader = new MultiFormatReader()
  reader.setHints(hints)

  return ({ data, width, height }) => {
    const luminance = new Uint8ClampedArray(width * height)
    for (let index = 0; index < luminance.length; index += 1) {
      const offset = index * 4
      luminance[index] = (data[offset] + data[offset + 1] * 2 + data[offset + 2]) / 4
    }

    try {
      const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, width, height)))
      return isbnFromBarcodeValue(reader.decodeWithState(bitmap).getText())
    } catch {
      return null
    } finally {
      reader.reset()
    }
  }
}

function* barcodeCandidates(image: HTMLImageElement): Generator<HTMLCanvasElement> {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height

  for (const { region, maxSide, rotation } of BARCODE_CANDIDATE_PLAN) {
    const crop = cropScaledCanvas(image, {
      x: region.x * width,
      y: region.y * height,
      width: region.width * width,
      height: region.height * height
    }, maxSide)
    yield rotation ? rotateCanvas(crop) : crop
  }
}

// Crops and downscales in one draw so a full-resolution copy of the photo is never made.
function cropScaledCanvas(image: HTMLImageElement, region: Region, maxSide: number): HTMLCanvasElement {
  const ratio = Math.min(1, maxSide / Math.max(region.width, region.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(region.width * ratio))
  canvas.height = Math.max(1, Math.round(region.height * ratio))
  canvas.getContext('2d')?.drawImage(
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

function rotateCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.height
  canvas.height = source.width

  const context = canvas.getContext('2d')
  if (!context) return canvas

  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate(Math.PI / 2)
  context.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

function imageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to read captured image.'))
    image.src = dataUrl
  })
}
