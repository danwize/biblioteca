import { BrowserMultiFormatReader } from '@zxing/browser'
import { extractIsbn } from './isbn'

type NativeBarcode = { rawValue?: string }
type NativeBarcodeDetector = new (options?: { formats?: string[] }) => {
  detect: (source: HTMLImageElement) => Promise<NativeBarcode[]>
}

declare global {
  interface Window {
    BarcodeDetector?: NativeBarcodeDetector
  }
}

export async function detectIsbn(dataUrl: string): Promise<string | null> {
  const image = new Image()
  image.src = dataUrl
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Captured image could not be decoded'))
  })

  if (window.BarcodeDetector) {
    try {
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a'] })
      const nativeResult = await detector.detect(image)
      const isbn = nativeResult.map((barcode) => extractIsbn(barcode.rawValue ?? '')).find(Boolean)
      if (isbn) return isbn
    } catch {
      // Fall through to ZXing for browsers without a working native detector.
    }
  }

  try {
    const result = await new BrowserMultiFormatReader().decodeFromImageElement(image)
    return extractIsbn(result.getText())
  } catch {
    return null
  }
}
