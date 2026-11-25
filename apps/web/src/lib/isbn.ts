export function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9X]/gi, '').toUpperCase()
}

// 978 and 979 are the Bookland EAN prefixes; 979-0 is the ISMN range for printed music.
export function isIsbn13Shaped(value: string): boolean {
  return /^97(?:8[0-9]|9[1-9])[0-9]{9}$/.test(value)
}

export function isIsbn10Shaped(value: string): boolean {
  return /^[0-9]{9}[0-9X]$/.test(value)
}

export function isValidIsbn13(value: string): boolean {
  if (!isIsbn13Shaped(value)) return false
  const sum = [...value].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
  return sum % 10 === 0
}

export function isValidIsbn10(value: string): boolean {
  if (!isIsbn10Shaped(value)) return false
  const sum = [...value].reduce((total, character, index) => total + (character === 'X' ? 10 : Number(character)) * (10 - index), 0)
  return sum % 11 === 0
}

const ISBN_LABEL = /ISBN(?:[-\s]?1[03](?![0-9]))?\s*:?/gi
const LABEL_MARK = '#'
const SEPARATORS = /[\s\-‐-―]+/g

// Finds an ISBN in free text such as OCR output. Like a printed ISBN, the text is compacted
// by dropping spaces, hyphens and line breaks, so spaced, hyphenated and wrapped digit groups
// join up, and then scanned for digit windows. In order of preference:
//   1. a checksum-valid ISBN-13 (978/979, not the 979-0 ISMN range), even with stray digits
//      glued on ("1978-0-486-21437-5", "978-0-486-21437-551295");
//   2. a checksum-valid ISBN-10 right after an "ISBN" label, so phone numbers and prices are
//      not returned, and not taken from inside a 978/979 13-digit run, so a misread ISBN-13
//      does not turn into a different book's ISBN-10;
//   3. an unvalidated 978/979 13-digit candidate, so the user can correct a misread digit.
export function extractIsbn(text: string): string | null {
  const compacted = text.replace(ISBN_LABEL, LABEL_MARK).replace(SEPARATORS, '').toUpperCase()
  const runs = [...compacted.matchAll(/(#?)([0-9X]+)/g)].map(([, label, digits]) => ({ labeled: label === LABEL_MARK, digits }))

  return findWindow(runs, 13, isValidIsbn13)
    ?? findWindow(runs.filter((run) => run.labeled), 10, (window, digits, offset) =>
      isValidIsbn10(window) && !insideIsbn13Run(digits, offset))
    ?? findWindow(runs, 13, isIsbn13Shaped)
}

function findWindow(
  runs: Array<{ digits: string }>,
  length: number,
  accept: (window: string, digits: string, offset: number) => boolean
): string | null {
  for (const { digits } of runs) {
    for (let offset = 0; offset + length <= digits.length; offset += 1) {
      const window = digits.slice(offset, offset + length)
      if (accept(window, digits, offset)) return window
    }
  }
  return null
}

// True when the ISBN-10 window at offset lies within a 978/979-prefixed 13-digit run.
function insideIsbn13Run(digits: string, offset: number): boolean {
  for (let start = Math.max(0, offset - 3); start <= offset; start += 1) {
    if (/^97[89][0-9]{10}$/.test(digits.slice(start, start + 13))) return true
  }
  return false
}
