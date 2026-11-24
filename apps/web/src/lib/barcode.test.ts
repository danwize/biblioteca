import { describe, expect, it } from 'vitest'
import backCoverPng from './fixtures/back-cover-isbn-9780486214375.png?inline'
import { decodeGrayscalePng } from '../test/png'
import { BARCODE_CANDIDATE_PLAN, createZxingIsbnDecoder, isbnFromBarcodeValue } from './barcode'

describe('ZXing fallback decoder', () => {
  it('reads the ISBN from a real back-cover barcode image', async () => {
    const decode = await createZxingIsbnDecoder()
    expect(decode(await decodeGrayscalePng(backCoverPng))).toBe('9780486214375')
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
  })
})

describe('barcode candidate plan', () => {
  it('tries a small, capped set of downscaled crops and rotations', () => {
    expect(BARCODE_CANDIDATE_PLAN.length).toBeLessThanOrEqual(8)
    expect(Math.max(...BARCODE_CANDIDATE_PLAN.map((candidate) => candidate.maxSide))).toBeLessThanOrEqual(2000)
    expect(BARCODE_CANDIDATE_PLAN[0]).toMatchObject({ region: { x: 0, y: 0, width: 1, height: 1 }, rotation: 0 })
    expect(BARCODE_CANDIDATE_PLAN.some((candidate) => candidate.rotation === 90)).toBe(true)
    expect(BARCODE_CANDIDATE_PLAN.some((candidate) => candidate.region.y > 0)).toBe(true)
  })
})
