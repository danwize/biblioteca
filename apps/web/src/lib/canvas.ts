export type Region = { x: number; y: number; width: number; height: number }

// Draws `region` of `source` onto a new canvas painted white first (so transparent areas
// read as paper, not black), shrunk so its longest side is at most `maxSide`. Images are
// never upscaled. Returns null when the browser cannot provide a 2D context.
export function scaleToWhiteCanvas(
  source: CanvasImageSource,
  region: Region,
  maxSide: number,
  contextOptions?: CanvasRenderingContext2DSettings
): HTMLCanvasElement | null {
  const ratio = Math.min(1, maxSide / Math.max(region.width, region.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(region.width * ratio))
  canvas.height = Math.max(1, Math.round(region.height * ratio))
  const context = canvas.getContext('2d', contextOptions)
  if (!context) return null

  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(
    source,
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

// Frees a canvas's backing store now instead of waiting for garbage collection; mobile
// browsers cap total canvas memory and fail quietly once it is exhausted.
export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}
