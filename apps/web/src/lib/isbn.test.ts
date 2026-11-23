import { describe, expect, it } from 'vitest'
import { extractIsbn, normalizeIsbn } from './isbn'

describe('isbn helpers', () => {
  it('normalizes ISBN input', () => {
    expect(normalizeIsbn('978-0-486-21437-5')).toBe('9780486214375')
  })

  it('extracts ISBN-13 from OCR text', () => {
    expect(extractIsbn('ISBN 978-0-486-21437-5')).toBe('9780486214375')
  })
})

describe('space-separated ISBN groups', () => {
  it('extracts an ISBN-13 printed with spaces between digit groups', () => {
    expect(extractIsbn('ISBN 978 0 486 21437 5')).toBe('9780486214375')
  })

  it('extracts an ISBN-10 printed with spaces between digit groups', () => {
    expect(extractIsbn('ISBN 0 486 21437 0\n1966')).toBe('0486214370')
  })

  it('still rejects space-separated digits with an invalid checksum', () => {
    expect(extractIsbn('ISBN 978 0 486 21437 6')).toBeNull()
  })
})
