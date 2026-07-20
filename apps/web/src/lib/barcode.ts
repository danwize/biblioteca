import { normalizeIsbn } from './isbn'

export async function detectIsbnBarcode(dataUrl: string): Promise<string | null> {
  const image = await imageFromDataUrl(dataUrl)
  const makeCandidates = () => barcodeCandidates(image)

  const nativeIsbn = await detectWithNativeBarcodeDetector(makeCandidates())
  if (nativeIsbn) return nativeIsbn

  return detectWithZxing(makeCandidates())
}

async function detectWithNativeBarcodeDetector(candidates: Iterable<HTMLCanvasElement>): Promise<string | null> {
  if (!('BarcodeDetector' in window)) return null

  try {
    const detector = new BarcodeDetector({ formats: ['ean_13', 'upc_a'] })
    for (const candidate of candidates) {
      const results = await detector.detect(candidate)
      const isbn = results.map((result) => normalizeIsbn(result.rawValue)).find(isLikelyIsbn)
      if (isbn) return isbn
    }
  } catch {
    return null
  }

  return null
}

async function detectWithZxing(candidates: Iterable<HTMLCanvasElement>): Promise<string | null> {
  try {
    const [{ BarcodeFormat, DecodeHintType }, { BrowserMultiFormatReader }] = await Promise.all([
      import('@zxing/library'),
      import('@zxing/browser')
    ])

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A])
    hints.set(DecodeHintType.TRY_HARDER, true)

    const reader = new BrowserMultiFormatReader(hints)
    for (const canvas of candidates) {
      try {
        const result = reader.decodeFromCanvas(canvas)
        const isbn = normalizeIsbn(result.getText())
        if (isLikelyIsbn(isbn)) return isbn
      } catch {
        // Try the next crop/rotation before giving up and falling back to OCR.
      }
    }
  } catch {
    return null
  }

  return null
}

function isLikelyIsbn(value: string): boolean {
  return value.length === 13 && (value.startsWith('978') || value.startsWith('979'))
}

function* barcodeCandidates(image: HTMLImageElement): Generator<HTMLCanvasElement> {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height

  const fullSize = cropCanvas(image, { x: 0, y: 0, width, height })
  yield fullSize
  yield scaleCanvas(fullSize, 2200)
  yield scaleCanvas(fullSize, 1400)

  const regions = [
    { x: 0, y: height * 0.45, width, height: height * 0.55 },
    { x: width * 0.35, y: height * 0.45, width: width * 0.65, height: height * 0.55 },
    { x: 0, y: height * 0.45, width: width * 0.65, height: height * 0.55 },
    { x: width * 0.2, y: height * 0.5, width: width * 0.6, height: height * 0.35 },
    { x: 0, y: height * 0.25, width, height: height * 0.5 }
  ]

  for (const region of regions) {
    const crop = cropCanvas(image, region)
    const scaled = scaleCanvas(crop, 1600)
    yield crop
    yield scaled
    yield rotateCanvas(scaled, 90)
    yield rotateCanvas(scaled, -90)
    yield rotateCanvas(scaled, 180)
  }
}

function cropCanvas(
  image: HTMLImageElement,
  region: { x: number; y: number; width: number; height: number }
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(region.width))
  canvas.height = Math.max(1, Math.round(region.height))
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

function rotateCanvas(source: HTMLCanvasElement, degrees: 90 | -90 | 180): HTMLCanvasElement {
  const quarterTurn = Math.abs(degrees) === 90
  const canvas = document.createElement('canvas')
  canvas.width = quarterTurn ? source.height : source.width
  canvas.height = quarterTurn ? source.width : source.height

  const context = canvas.getContext('2d')
  if (!context) return canvas

  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate(degrees * Math.PI / 180)
  context.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

function scaleCanvas(source: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const ratio = Math.min(1, maxSide / Math.max(source.width, source.height))
  if (ratio === 1) return source

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * ratio))
  canvas.height = Math.max(1, Math.round(source.height * ratio))
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height)
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
