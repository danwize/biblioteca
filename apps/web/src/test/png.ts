import type { RgbaPixels } from '../lib/barcode'

// Minimal decoder for the 8-bit grayscale PNG fixtures used in tests (no canvas in jsdom).
export async function decodeGrayscalePng(dataUrl: string): Promise<RgbaPixels> {
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (character) => character.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  let width = 0
  let height = 0
  const idat: Uint8Array[] = []

  for (let offset = 8; offset < bytes.length;) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      if (data[8] !== 8 || data[9] !== 0 || data[12] !== 0) throw new Error('Only 8-bit non-interlaced grayscale PNGs are supported.')
    }
    if (type === 'IDAT') idat.push(data)
    offset += 12 + length
  }

  const compressed = new Uint8Array(idat.reduce((total, chunk) => total + chunk.length, 0))
  idat.reduce((offset, chunk) => (compressed.set(chunk, offset), offset + chunk.length), 0)
  const stream = new Response(compressed).body!.pipeThrough(new DecompressionStream('deflate'))
  const inflated = new Uint8Array(await new Response(stream).arrayBuffer())
  const gray = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[y * (width + 1)]
    for (let x = 0; x < width; x += 1) {
      const raw = inflated[y * (width + 1) + 1 + x]
      const left = x > 0 ? gray[y * width + x - 1] : 0
      const up = y > 0 ? gray[(y - 1) * width + x] : 0
      const upLeft = x > 0 && y > 0 ? gray[(y - 1) * width + x - 1] : 0
      gray[y * width + x] = (raw + predict(filter, left, up, upLeft)) & 0xff
    }
  }

  const data = new Uint8ClampedArray(width * height * 4)
  gray.forEach((value, index) => data.set([value, value, value, 255], index * 4))
  return { data, width, height }
}

function predict(filter: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0: return 0
    case 1: return left
    case 2: return up
    case 3: return Math.floor((left + up) / 2)
    case 4: {
      const estimate = left + up - upLeft
      const [a, b, c] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)]
      return a <= b && a <= c ? left : b <= c ? up : upLeft
    }
    default: throw new Error(`Unknown PNG filter ${filter}`)
  }
}
