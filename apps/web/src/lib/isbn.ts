export function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9X]/gi, '').toUpperCase()
}

function isValidIsbn13(candidate: string): boolean {
  const sum = candidate.split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
  return sum % 10 === 0
}

function isValidIsbn10(candidate: string): boolean {
  const sum = candidate.split('').reduce((total, char, index) => {
    const value = char === 'X' ? 10 : Number(char)
    return total + value * (10 - index)
  }, 0)
  return sum % 11 === 0
}

export function extractIsbn(text: string): string | null {
  const compact = text.replace(/[-\s]/g, '')

  const isbn13 = (compact.match(/97[89][0-9]{10}/g) ?? []).find(isValidIsbn13)
  if (isbn13) return isbn13

  const isbn10 = (compact.match(/[0-9]{9}[0-9Xx]/g) ?? [])
    .map((candidate) => candidate.toUpperCase())
    .find(isValidIsbn10)
  return isbn10 ?? null
}
