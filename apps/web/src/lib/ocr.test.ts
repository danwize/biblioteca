import { describe, expect, it } from 'vitest'
import { parseOcrSuggestion } from './ocr'

describe('parseOcrSuggestion', () => {
  it('cleans noisy OCR lines and avoids ISBN as the title', () => {
    expect(parseOcrSuggestion('|||\nISBN 978-0-486-21437-5\nThe Real Book Title\nby Jane Reader')).toEqual({
      rawText: '|||\nISBN 978-0-486-21437-5\nThe Real Book Title\nby Jane Reader',
      isbn: '9780486214375',
      title: 'The Real Book Title',
      authors: ['Jane Reader']
    })
  })
})
