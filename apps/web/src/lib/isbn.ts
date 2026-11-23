export function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9X]/gi, '').toUpperCase()
}

export function isValidIsbn13(candidate: string): boolean {
  const sum = candidate.split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
  return sum % 10 === 0
}

export function isValidIsbn10(candidate: string): boolean {
  const sum = candidate.split('').reduce((total, char, index) => {
    const value = char === 'X' ? 10 : Number(char)
    return total + value * (10 - index)
  }, 0)
  return sum % 11 === 0
}

function findIsbn(compact: string): string | null {
  const isbn13 = (compact.match(/97[89][0-9]{10}/g) ?? []).find(isValidIsbn13)
  if (isbn13) return isbn13
  const isbn10 = (compact.match(/(?<![0-9Xx])[0-9]{9}[0-9Xx](?![0-9Xx])/g) ?? [])
    .map((candidate) => candidate.toUpperCase())
    .find(isValidIsbn10)
  return isbn10 ?? null
}

export function extractIsbn(text: string): string | null {
  const groups = text.split(/\s+/).filter((token) => !/^ISBN(?:-?(?:10|13))?:?$/i.test(token))
  for (const group of groups) {
    const isbn = findIsbn(group.replace(/[^0-9Xx]/g, ''))
    if (isbn) return isbn
  }
  for (const line of text.split(/\r?\n/)) {
    const isbn = findIsbn(line.replace(/ISBN(?:-?(?:10|13))?:?/gi, ' ').replace(/[\s\-\u2010-\u2015]/g, ''))
    if (isbn) return isbn
  }
  return null
}
