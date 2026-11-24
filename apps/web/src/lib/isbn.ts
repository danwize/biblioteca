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

const ISBN_LABEL = /ISBN(?:[-\s]?1[03](?![0-9]))?\s*:?/gi
const DIGIT_RUN = /[0-9Xx]+(?:[\s\-‐-―]+[0-9Xx]+)*/g
const SEPARATOR = /[\s\-‐-―]+/

// Finds an ISBN in free text such as OCR output. Digit groups may be separated by
// spaces or hyphens ("978 0 486 21437 5", "0-486-21437-0") and may wrap onto the next
// line. Groups are only joined within a line or across one line break, so a neighbouring
// year or price cannot be merged in. A checksum-valid ISBN wins; failing that, an
// ISBN-shaped candidate is still returned so the user can correct a single misread digit.
export function extractIsbn(text: string): string | null {
  const lines = text.split(/\r?\n/).map((line) => line.replace(ISBN_LABEL, ' '))
  const singleLines = lines.map(digitGroupRuns).flat()
  const wrappedLines = lines.slice(1).map((line, index) => digitGroupRuns(`${lines[index]} ${line}`)).flat()

  for (const runs of [singleLines, wrappedLines]) {
    const isbn = findInGroups(runs, 13, isValidIsbn13) ?? findInGroups(runs, 10, isValidIsbn10)
    if (isbn) return isbn
  }

  for (const runs of [singleLines, wrappedLines]) {
    const candidate = findInGroups(runs, 13, (value) => /^97[89][0-9]{10}$/.test(value))
      ?? findInGroups(runs, 10, (value) => /^[0-9]{9}[0-9X]$/.test(value))
    if (candidate) return candidate
  }

  return null
}

function digitGroupRuns(line: string): string[][] {
  return (line.match(DIGIT_RUN) ?? []).map((run) => run.toUpperCase().split(SEPARATOR))
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
      // EAN-13 plus its price add-on). The 978/979 prefix keeps this reasonably safe;
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
