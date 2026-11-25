import type { RgbaPixels } from '../lib/barcode'

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const R = L.map((code) => [...code].map((bit) => (bit === '1' ? '0' : '1')).join(''))
const G = R.map((code) => [...code].reverse().join(''))
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

export function ean13Bits(value: string): string {
  const digits = [...value].map(Number)
  const left = digits.slice(1, 7).map((digit, index) => (PARITY[digits[0]][index] === 'L' ? L : G)[digit]).join('')
  const right = digits.slice(7).map((digit) => R[digit]).join('')
  return `101${left}01010${right}101`
}

// Draws EAN-13 barcodes (black bars, `module` px per bar module) onto a light page.
export function drawBarcodes(
  width: number,
  height: number,
  barcodes: { value: string; x: number; y: number; module: number; barHeight: number }[]
): RgbaPixels {
  const data = new Uint8ClampedArray(width * height * 4).fill(235)
  for (const { value, x, y, module, barHeight } of barcodes) {
    const bits = ean13Bits(value)
    for (let row = y; row < y + barHeight; row += 1) {
      for (let column = 0; column < bits.length * module; column += 1) {
        const offset = (row * width + x + column) * 4
        data.fill(bits[Math.floor(column / module)] === '1' ? 20 : 255, offset, offset + 3)
      }
    }
  }
  return { data, width, height }
}
