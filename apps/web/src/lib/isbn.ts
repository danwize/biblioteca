export function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9X]/gi, '').toUpperCase()
}

export function extractIsbn(text: string): string | null {
  const compact = text.replace(/[-\s]/g, '')
  const isbn13 = compact.match(/97[89][0-9]{10}/)?.[0]
  if (isbn13) return isbn13

  return compact.match(/[0-9]{9}[0-9X]/i)?.[0]?.toUpperCase() ?? null
}
