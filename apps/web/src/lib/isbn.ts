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
const DIGIT_RUN = /[0-9Xx]+(?:[\s\-\u2010-\u2015]+[0-9Xx]+)*/g
const SEPARATORS = /[\s\-\u2010-\u2015]+/g

// Finds an ISBN in free text such as OCR output. Digit groups may be separated by
// spaces or hyphens ("978 0 486 21437 5", "0-486-21437-0") and may wrap onto the next
// line. Text is only joined within a line or across one line break, so far-away numbers
// cannot be merged in. In order of preference:
//   1. a checksum-valid ISBN-13 anywhere in the separator-free text, even with stray
//      digits glued on ("1978-0-486-21437-5", "978-0-486-21437-551295");
//   2. a checksum-valid ISBN-10 made of whole digit groups;
//   3. an ISBN-shaped candidate, so the user can correct a single misread digit.
export function extractIsbn(text: string): string | null {
  const lines = text.split(/\r?\n/).map((line) => line.replace(ISBN_LABEL, ' '))
  // Single lines first, then each pair of adjacent lines for ISBNs that wrap.
  const texts = [...lines, ...lines.slice(1).map((line, index) => `${lines[index]} ${line}`)]
  const compacted = texts.map((value) => value.replace(SEPARATORS, '').toUpperCase())
  const groupRuns = texts.flatMap((value) =>
    (value.match(DIGIT_RUN) ?? [])
      .map((run) => run.toUpperCase().split(SEPARATORS))
      // An ISMN (979-0...) is not an ISBN, so its groups must not yield an ISBN-10 either.
      .filter((groups) => !/^9790[0-9]{9}/.test(groups.join('')))
  )

  return findIsbn13Window(compacted, isValidIsbn13)
    ?? findIsbn10InGroups(groupRuns, isValidIsbn10)
    ?? findIsbn13Window(compacted, isIsbn13Shaped)
    ?? findIsbn10InGroups(groupRuns, isIsbn10Shaped)
}

function findIsbn13Window(compacted: string[], accept: (value: string) => boolean): string | null {
  for (const value of compacted) {
    for (let offset = 0; offset + 13 <= value.length; offset += 1) {
      const window = value.slice(offset, offset + 13)
      if (accept(window)) return window
    }
  }
  return null
}

// ISBN-10 has no fixed prefix, so it is only accepted when it is made of whole digit
// groups; otherwise any 10 digits out of a phone number or price list could match.
function findIsbn10InGroups(groupRuns: string[][], accept: (value: string) => boolean): string | null {
  for (const groups of groupRuns) {
    for (let start = 0; start < groups.length; start += 1) {
      let candidate = ''
      for (let end = start; end < groups.length && candidate.length < 10; end += 1) {
        candidate += groups[end]
        if (candidate.length === 10 && accept(candidate)) return candidate
      }
    }
  }
  return null
}
