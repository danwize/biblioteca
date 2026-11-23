type DetectedBarcode = {
  rawValue: string
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] })
  detect(image: HTMLImageElement | ImageBitmap | HTMLVideoElement | HTMLCanvasElement | Blob): Promise<DetectedBarcode[]>
}
