import { extractIsbn } from './isbn'

export type OcrSuggestion = {
  rawText: string
  isbn: string | null
  title: string | null
  authors: string[]
  series: string | null
}

export async function recognizeBookText(image: Blob): Promise<OcrSuggestion> {
  const tesseract = await import('tesseract.js')
  const prepared = await prepareOcrImage(image)
  const result = await tesseract.recognize(prepared, 'eng')
  const rawText = result.data.text.trim()
  const lines = rawText.split('\n').map(cleanLine).filter(Boolean)
  const byLine = lines.find((line) => /^by\s+/i.test(line))
  const seriesLine = lines.find((line) => /^series\s*:/i.test(line))

  return {
    rawText,
    isbn: extractIsbn(rawText),
    title: findTitleCandidate(lines),
    authors: byLine ? [byLine.replace(/^by\s+/i, '').trim()] : [],
    series: seriesLine ? seriesLine.replace(/^series\s*:/i, '').trim() : null
  }
}

export function parseOcrSuggestion(rawText: string): OcrSuggestion {
  const trimmedText = rawText.trim()
  const lines = trimmedText.split('\n').map(cleanLine).filter(Boolean)
  const byLine = lines.find((line) => /^by\s+/i.test(line))
  const seriesLine = lines.find((line) => /^series\s*:/i.test(line))

  return {
    rawText: trimmedText,
    isbn: extractIsbn(trimmedText),
    title: findTitleCandidate(lines),
    authors: byLine ? [byLine.replace(/^by\s+/i, '').trim()] : [],
    series: seriesLine ? seriesLine.replace(/^series\s*:/i, '').trim() : null
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

async function prepareOcrImage(image: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return image
  const bitmap = await createImageBitmap(image)
  const maxDimension = 1600
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return image
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? image), 'image/jpeg', 0.88))
}
