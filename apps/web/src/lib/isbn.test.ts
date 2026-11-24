import { describe, expect, it } from 'vitest'
import { extractIsbn, isValidIsbn10, isValidIsbn13, normalizeIsbn } from './isbn'

describe('isbn helpers', () => {
  it('normalizes ISBN input', () => {
    expect(normalizeIsbn('978-0-486-21437-5')).toBe('9780486214375')
  })

  it('extracts ISBN-13 from OCR text', () => {
    expect(extractIsbn('ISBN 978-0-486-21437-5')).toBe('9780486214375')
  })
})

describe('isbn checksums', () => {
  it('validates ISBN-13 and ISBN-10 check digits', () => {
    expect(isValidIsbn13('9780486214375')).toBe(true)
    expect(isValidIsbn13('9780486214376')).toBe(false)
    expect(isValidIsbn13('4006381333931')).toBe(false)
    expect(isValidIsbn10('0486214370')).toBe(true)
    expect(isValidIsbn10('080442957X')).toBe(true)
    expect(isValidIsbn10('0486214371')).toBe(false)
  })

  it('rejects OCR text whose ISBN-like digits fail the checksum', () => {
    expect(extractIsbn('ISBN 978-0-486-21437-6')).toBeNull()
    expect(extractIsbn('Call 0123456788 today')).toBeNull()
  })
})

describe('separated ISBN digit groups', () => {
  it('extracts ISBN-13 printed with spaces between groups', () => {
    expect(extractIsbn('ISBN 978 0 486 21437 5')).toBe('9780486214375')
    expect(extractIsbn('9 780486 214375')).toBe('9780486214375')
  })

  it('extracts ISBN-10 printed with spaces or hyphens between groups', () => {
    expect(extractIsbn('ISBN 0 486 21437 0\n1966')).toBe('0486214370')
    expect(extractIsbn('ISBN-10: 0-486-21437-0')).toBe('0486214370')
    expect(extractIsbn('ISBN 0-8044-2957-X')).toBe('080442957X')
  })

  it('does not mistake the leading digits of an unseparated ISBN-10 for a label suffix', () => {
    expect(extractIsbn('ISBN 1305957660')).toBe('1305957660')
    expect(extractIsbn('ISBN 101234567X')).toBe('101234567X')
  })

  it('skips neighbouring numbers on the same line', () => {
    expect(extractIsbn('Printed 1966 ISBN 0 486 21437 0 $12.95')).toBe('0486214370')
    expect(extractIsbn('ISBN-13: 978-0-486-21437-5 51295')).toBe('9780486214375')
    expect(extractIsbn('978048621437551295')).toBe('9780486214375')
  })

  it('prefers ISBN-13 over ISBN-10 when both are present', () => {
    expect(extractIsbn('ISBN 0-486-21437-0\nISBN 978-0-486-21437-5')).toBe('9780486214375')
  })
})
