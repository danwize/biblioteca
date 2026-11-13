import { extractIsbn } from './isbn'

export type OcrSuggestion = {
  rawText: string
  isbn: string | null
  title: string | null
  authors: string[]
}

export async function recognizeBookText(image: Blob): Promise<OcrSuggestion> {
  const tesseract = await import('tesseract.js')
  const result = await tesseract.recognize(image, 'eng')
  const rawText = result.data.text.trim()
  const lines = rawText.split('\n').map(cleanLine).filter(Boolean)
  const byLine = lines.find((line) => /^by\s+/i.test(line))

  return {
    rawText,
    isbn: extractIsbn(rawText),
    title: findTitleCandidate(lines),
    authors: byLine ? [byLine.replace(/^by\s+/i, '').trim()] : []
  }
}

export function parseOcrSuggestion(rawText: string): OcrSuggestion {
  const trimmedText = rawText.trim()
  const lines = trimmedText.split('\n').map(cleanLine).filter(Boolean)
  const byLine = lines.find((line) => /^by\s+/i.test(line))

  return {
    rawText: trimmedText,
    isbn: extractIsbn(trimmedText),
    title: findTitleCandidate(lines),
    authors: byLine ? [byLine.replace(/^by\s+/i, '').trim()] : []
  }
}

function cleanLine(line: string): string {
  return line.replace(/[|~_`^]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function findTitleCandidate(lines: string[]): string | null {
  return lines.find((line) => {
    if (/^(isbn|by|author|publisher)\b/i.test(line)) return false
    const letters = [...line].filter((character) => /[a-z]/i.test(character)).length
    const words = line.split(/\s+/).filter(Boolean).length
    return words >= 2 && letters >= 8 && letters / Math.max(line.length, 1) > 0.6
  }) ?? null
}
