import { describe, expect, it } from 'vitest'
import { applyLookupToDraft, applyOcrToDraft, emptyDraft, emptyFieldSources } from './draftAutofill'

describe('draft autofill', () => {
  it('preserves manual fields when OCR suggestions arrive', () => {
    const draft = { ...emptyDraft, title: 'Manual Title' }
    const sources = { ...emptyFieldSources, title: 'manual' as const }

    const next = applyOcrToDraft(draft, sources, {
      rawText: 'OCR Title',
      isbn: '9780486214375',
      title: 'OCR Title',
      authors: ['OCR Author']
    })

    expect(next.draft.title).toBe('Manual Title')
    expect(next.draft.authors).toBe('OCR Author')
    expect(next.draft.isbn13).toBe('9780486214375')
    expect(next.sources.title).toBe('manual')
    expect(next.sources.authors).toBe('ocr')
  })

  it('preserves manual fields when lookup metadata arrives', () => {
    const draft = { ...emptyDraft, authors: 'Manual Author' }
    const sources = { ...emptyFieldSources, authors: 'manual' as const }

    const next = applyLookupToDraft(draft, sources, {
      title: 'Lookup Title',
      subtitle: null,
      authors: ['Lookup Author'],
      isbn13: '9780486214375',
      isbn10: null,
      publisher: null,
      publishedDate: null,
      pageCount: null
    }, '9780486214375', 'session-1')

    expect(next.draft.authors).toBe('Manual Author')
    expect(next.draft.title).toBe('Lookup Title')
    expect(next.draft.importSessionId).toBe('session-1')
    expect(next.sources.authors).toBe('manual')
    expect(next.sources.title).toBe('lookup')
  })

  it('does not let OCR overwrite lookup metadata', () => {
    const draft = { ...emptyDraft, title: 'Lookup Title' }
    const sources = { ...emptyFieldSources, title: 'lookup' as const }

    const next = applyOcrToDraft(draft, sources, {
      rawText: 'OCR Title',
      isbn: null,
      title: 'OCR Title',
      authors: []
    })

    expect(next.draft.title).toBe('Lookup Title')
    expect(next.sources.title).toBe('lookup')
  })
})
