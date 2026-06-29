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
