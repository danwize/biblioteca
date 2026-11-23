export function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9X]/gi, '').toUpperCase()
}

export function extractIsbn(text: string): string | null {
  const candidates = text.toUpperCase().match(/(?:97[89][0-9X]{11}|[0-9][0-9X-]{8,}[0-9X])/g) ?? []
  for (const candidate of candidates) {
    const normalized = normalizeIsbn(candidate)
    if (normalized.length === 13 && isValidIsbn13(normalized)) return normalized
    if (normalized.length === 10 && isValidIsbn10(normalized)) return normalized
  }
  return null
}

export function isValidIsbn13(value: string): boolean {
  if (!/^97[89][0-9]{10}$/.test(value)) return false
  const checksum = value.slice(0, 12).split('').reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0)
  return (10 - (checksum % 10)) % 10 === Number(value[12])
}

export function isValidIsbn10(value: string): boolean {
  if (!/^[0-9]{9}[0-9X]$/.test(value)) return false
  return value.split('').reduce((sum, digit, index) => sum + (digit === 'X' ? 10 : Number(digit)) * (10 - index), 0) % 11 === 0
}
