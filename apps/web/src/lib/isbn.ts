export function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9X]/gi, '').toUpperCase()
}

export function isValidIsbn13(value: string): boolean {
  if (!/^97[89][0-9]{10}$/.test(value)) return false
  const sum = [...value].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
  return sum % 10 === 0
}

export function isValidIsbn10(value: string): boolean {
  if (!/^[0-9]{9}[0-9X]$/.test(value)) return false
  const sum = [...value].reduce((total, character, index) => total + (character === 'X' ? 10 : Number(character)) * (10 - index), 0)
  return sum % 11 === 0
}

const ISBN_LABEL = /ISBN(?:[-\s]?1[03])?\s*:?/gi
const DIGIT_RUN = /[0-9Xx]+(?:[\s\-‐-―]+[0-9Xx]+)*/g
const SEPARATOR = /[\s\-‐-―]+/

// Finds a checksum-valid ISBN in free text such as OCR output. Digit groups may be
// separated by spaces or hyphens ("978 0 486 21437 5", "0-486-21437-0"); groups are
// joined only within a line, so a neighbouring year or price cannot be merged in.
export function extractIsbn(text: string): string | null {
  const groupRuns = text.split(/\r?\n/).flatMap((line) =>
    (line.replace(ISBN_LABEL, ' ').match(DIGIT_RUN) ?? []).map((run) => run.toUpperCase().split(SEPARATOR))
  )

  return findInGroups(groupRuns, 13, isValidIsbn13) ?? findInGroups(groupRuns, 10, isValidIsbn10)
}

function findInGroups(groupRuns: string[][], length: number, isValid: (value: string) => boolean): string | null {
  for (const groups of groupRuns) {
    for (let start = 0; start < groups.length; start += 1) {
      let candidate = ''
      for (let end = start; end < groups.length && candidate.length < length; end += 1) {
        candidate += groups[end]
        if (candidate.length === length && isValid(candidate)) return candidate
      }
      // An unseparated group may hold an ISBN-13 with extra digits around it (e.g. an
      // EAN-13 plus its price add-on). The 978/979 prefix plus checksum keeps this safe;
      // ISBN-10 has no prefix, so it is only accepted on group boundaries.
      if (length !== 13) continue
      const group = groups[start]
      for (let offset = 0; offset + length <= group.length; offset += 1) {
        const slice = group.slice(offset, offset + length)
        if (isValid(slice)) return slice
      }
    }
  }
  return null
}
