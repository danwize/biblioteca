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

  it('prefers a checksum-valid ISBN over an earlier misread one', () => {
    expect(extractIsbn('ISBN 978-0-486-21437-6\nISBN 0-486-21437-0')).toBe('0486214370')
    expect(extractIsbn('9780486214376 9780486214375')).toBe('9780486214375')
  })

  it('still suggests an ISBN-shaped OCR candidate with one misread digit so it can be corrected', () => {
    expect(extractIsbn('ISBN 978-0-486-21437-6')).toBe('9780486214376')
    expect(extractIsbn('Price 12.95 Printed 1966')).toBeNull()
  })

  it('offers the 13-digit candidate rather than a different book when one ISBN-13 digit is misread', () => {
    expect(extractIsbn('ISBN 978-0-466-21437-5')).toBe('9780466214375')
    expect(extractIsbn('978-0-486-20437-5')).toBe('9780486204375')
  })

  it('finds an unseparated ISBN-10 glued to the printing year', () => {
    expect(extractIsbn('ISBN 04862143701966')).toBe('0486214370')
  })

  it('does not return phone numbers as ISBNs', () => {
    expect(extractIsbn('Call 555 123 4567')).toBeNull()
    expect(extractIsbn('Tel 0 800 123 4560')).toBeNull()
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

  it('joins digit groups that wrap across a line break', () => {
    expect(extractIsbn('ISBN 978-0-486-\n21437-5')).toBe('9780486214375')
    expect(extractIsbn('ISBN 978 0\n486 21437 5\nDover')).toBe('9780486214375')
    expect(extractIsbn('ISBN 0-486-\n21437-0')).toBe('0486214370')
  })

  it('finds an ISBN-13 with stray digits glued to its first or last group', () => {
    expect(extractIsbn('1978-0-486-21437-5')).toBe('9780486214375')
    expect(extractIsbn('978-0-486-21437-551295')).toBe('9780486214375')
    expect(extractIsbn('ISBN 1978 0 486 21437 5 51295')).toBe('9780486214375')
  })

  it('prefers a wrapped checksum-valid ISBN-13 over an ISBN-10 on one line', () => {
    expect(extractIsbn('ISBN 978-0-486-\n21437-5\nISBN 0-486-21437-0')).toBe('9780486214375')
  })

  it('does not take ISMN (979-0) sheet-music numbers for ISBNs', () => {
    expect(isValidIsbn13('9790060115615')).toBe(false)
    expect(extractIsbn('ISMN 979-0-060-11561-5')).toBeNull()
  })

  it('prefers ISBN-13 over ISBN-10 when both are present', () => {
    expect(extractIsbn('ISBN 0-486-21437-0\nISBN 978-0-486-21437-5')).toBe('9780486214375')
  })
})
