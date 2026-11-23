import { extractIsbn } from './isbn'

type NativeBarcode = { rawValue?: string }
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: HTMLCanvasElement) => Promise<NativeBarcode[]>
    }
  }
}

export async function detectIsbn(dataUrl: string): Promise<string | null> {
  const image = await imageFromDataUrl(dataUrl)
  const candidates = barcodeCandidates(image)
  if (window.BarcodeDetector) {
    try {
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'upc_a'] })
      for (const candidate of candidates) {
        const results = await detector.detect(candidate) as NativeBarcode[]
        const isbn = results.map((result) => extractIsbn(result.rawValue ?? '')).find(Boolean)
        if (isbn) return isbn
      }
    } catch {
      // Fall through to ZXing.
    }
  }

  try {
    const [{ BarcodeFormat, DecodeHintType }, { BrowserMultiFormatReader }] = await Promise.all([
      import('@zxing/library'),
      import('@zxing/browser')
    ])
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A])
    hints.set(DecodeHintType.TRY_HARDER, true)
    const reader = new BrowserMultiFormatReader(hints)
    for (const candidate of candidates) {
      try {
        const isbn = extractIsbn(reader.decodeFromCanvas(candidate).getText())
        if (isbn) return isbn
      } catch {
        // Try the next crop or rotation.
      }
    }
  } catch {
    return null
  }
  return null
}

function* barcodeCandidates(image: HTMLImageElement): Generator<HTMLCanvasElement> {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const full = cropCanvas(image, { x: 0, y: 0, width, height })
  yield full
  yield scaleCanvas(full, 2200)
  yield scaleCanvas(full, 1400)
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

function cropCanvas(image: HTMLImageElement, region: { x: number; y: number; width: number; height: number }) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(region.width))
  canvas.height = Math.max(1, Math.round(region.height))
  canvas.getContext('2d')?.drawImage(image, Math.round(region.x), Math.round(region.y), Math.round(region.width), Math.round(region.height), 0, 0, canvas.width, canvas.height)
  return canvas
}

function rotateCanvas(source: HTMLCanvasElement, degrees: 90 | -90 | 180) {
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

function scaleCanvas(source: HTMLCanvasElement, maxSide: number) {
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
