import { describe, expect, it } from 'vitest'
import backCoverPng from './fixtures/back-cover-isbn-9780486214375.png?inline'
import { decodeGrayscalePng } from '../test/png'
import { drawBarcodes } from '../test/ean13'
import { BARCODE_CANDIDATE_PLAN, NATIVE_FULL_RESOLUTION_PLAN, createZxingIsbnDecoder, isbnFromBarcodeValue, type RgbaPixels } from './barcode'

describe('ZXing fallback decoder', () => {
  it('reads the ISBN from a real back-cover barcode image', async () => {
    const decode = await createZxingIsbnDecoder()
    expect(decode(await decodeGrayscalePng(backCoverPng))).toBe('9780486214375')
  })

  it.each([90, 180, 270])('reads the barcode when the photo is rotated %i degrees', async (degrees) => {
    const decode = await createZxingIsbnDecoder()
    expect(decode(rotate(await decodeGrayscalePng(backCoverPng), degrees))).toBe('9780486214375')
  })

  it('treats transparent pixels as white paper', async () => {
    const decode = await createZxingIsbnDecoder()
    const { data, width, height } = await decodeGrayscalePng(backCoverPng)
    // Canvas reads fully transparent pixels back as black with alpha 0.
    const transparent = new Uint8ClampedArray(data)
    for (let offset = 0; offset < transparent.length; offset += 4) {
      if (transparent[offset] > 128) transparent.set([0, 0, 0, 0], offset)
    }
    expect(decode({ data: transparent, width, height })).toBe('9780486214375')
  })

  it('looks past a non-ISBN barcode (price sticker) to the ISBN in the same image', async () => {
    const decode = await createZxingIsbnDecoder()
    const image = drawBarcodes(640, 500, [
      // The sticker sits on the middle rows, where ZXing starts scanning.
      { value: '4006381333931', x: 40, y: 170, module: 3, barHeight: 120 },
      { value: '9780486214375', x: 300, y: 340, module: 3, barHeight: 120 }
    ])
    expect(decode(image)).toBe('9780486214375')
  })

  it('still finds an ISBN barcode just below a price sticker after blanking the sticker out', async () => {
    const decode = await createZxingIsbnDecoder()
    const image = drawBarcodes(500, 600, [
      { value: '4006381333931', x: 100, y: 240, module: 3, barHeight: 120 },
      { value: '9780486214375', x: 100, y: 380, module: 3, barHeight: 110 }
    ])
    expect(decode(image)).toBe('9780486214375')
  })

  it('finds nothing in an image without a barcode', async () => {
    const decode = await createZxingIsbnDecoder()
    const blank = { data: new Uint8ClampedArray(200 * 100 * 4).fill(235), width: 200, height: 100 }
    expect(decode(blank)).toBeNull()
  })
})

describe('isbnFromBarcodeValue', () => {
  it('accepts checksum-valid Bookland EAN-13 payloads', () => {
    expect(isbnFromBarcodeValue('9780486214375')).toBe('9780486214375')
    expect(isbnFromBarcodeValue('9791032305690')).toBe('9791032305690')
  })

  it('rejects non-book barcodes and bad checksums', () => {
    expect(isbnFromBarcodeValue('4006381333931')).toBeNull()
    expect(isbnFromBarcodeValue('012345678905')).toBeNull()
    expect(isbnFromBarcodeValue('9780486214376')).toBeNull()
    // 979-0 is the ISMN (sheet music) range, not ISBN.
    expect(isbnFromBarcodeValue('9790060115615')).toBeNull()
  })
})

describe('barcode candidate plan', () => {
  it('tries a small, capped set of downscaled crops', () => {
    expect(BARCODE_CANDIDATE_PLAN.length).toBeLessThanOrEqual(8)
    expect(Math.max(...BARCODE_CANDIDATE_PLAN.map((candidate) => candidate.maxSide))).toBeLessThanOrEqual(2000)
    expect(BARCODE_CANDIDATE_PLAN[0]).toMatchObject({ region: { x: 0, y: 0, width: 1, height: 1 } })
  })

  it('gives the native detector one full-resolution pass, capped for very large photos', () => {
    expect(NATIVE_FULL_RESOLUTION_PLAN).toEqual([{ region: { x: 0, y: 0, width: 1, height: 1 }, maxSide: 4096 }])
  })

  it('covers the half where a back-cover barcode lands in every phone orientation', () => {
    const halves = BARCODE_CANDIDATE_PLAN.map(({ region }) => region).filter((region) => region.width * region.height < 1)
    expect(halves.some((region) => region.y > 0 && region.width === 1)).toBe(true) // bottom: upright
    expect(halves.some((region) => region.y === 0 && region.width === 1)).toBe(true) // top: upside down
    expect(halves.some((region) => region.x > 0 && region.height === 1)).toBe(true) // right: sideways
    expect(halves.some((region) => region.x === 0 && region.height === 1)).toBe(true) // left: sideways
    // Half crops keep about half of a 4032px photo's resolution or more: a normal 37mm
    // barcode on a frame-filling back cover still gets ~3px per bar module.
    for (const { region, maxSide } of BARCODE_CANDIDATE_PLAN.filter(({ region }) => region.width * region.height < 1)) {
      expect(maxSide / (4032 * Math.max(region.width, region.height))).toBeGreaterThanOrEqual(0.49)
    }
  })
})

function rotate({ data, width, height }: RgbaPixels, degrees: number): RgbaPixels {
  const turns = degrees / 90
  let pixels = { data, width, height }
  for (let turn = 0; turn < turns; turn += 1) {
    const rotated = new Uint8ClampedArray(pixels.data.length)
    for (let y = 0; y < pixels.height; y += 1) {
      for (let x = 0; x < pixels.width; x += 1) {
        const from = (y * pixels.width + x) * 4
        const to = (x * pixels.height + (pixels.height - 1 - y)) * 4
        rotated.set(pixels.data.subarray(from, from + 4), to)
      }
    }
    pixels = { data: rotated, width: pixels.height, height: pixels.width }
  }
  return pixels
}
