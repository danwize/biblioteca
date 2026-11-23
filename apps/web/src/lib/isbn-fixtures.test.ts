import { describe, expect, it } from 'vitest'
import { extractIsbn, isValidIsbn13 } from './isbn'

describe('captured barcode ISBN fixtures', () => {
  it('accepts a checksum-valid ISBN-13 from an EAN barcode payload', () => {
    expect(extractIsbn('9780486214375')).toBe('9780486214375')
    expect(isValidIsbn13('9780486214375')).toBe(true)
  })

  it('rejects non-book EAN and UPC payloads', () => {
    expect(extractIsbn('012345678905')).toBeNull()
    expect(extractIsbn('4006381333931')).toBeNull()
  })

  it('rejects a mistyped ISBN-13 checksum', () => {
    expect(extractIsbn('9780486214376')).toBeNull()
  })

  it('keeps a following line from becoming part of an ISBN-10 candidate', () => {
    expect(extractIsbn('ISBN 0-486-21437-0\n1966')).toBe('0486214370')
    expect(extractIsbn('ISBN-10 0-486-21437-0')).toBe('0486214370')
  })
})
