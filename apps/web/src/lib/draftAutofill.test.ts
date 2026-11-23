import { describe, expect, it } from 'vitest'
import { applyLookupToDraft, emptyDraft, emptyFieldSources } from './draftAutofill'

describe('lookup draft protection', () => {
  it('preserves manually edited fields and does not erase authors', () => {
    const draft = { ...emptyDraft, title: 'My corrected title', authors: 'Typed author' }
    const sources = { ...emptyFieldSources, title: 'manual' as const, authors: 'manual' as const }
    const result = applyLookupToDraft(draft, sources, {
      title: 'API title',
      subtitle: null,
      authors: [],
      isbn13: null,
      isbn10: null,
      publisher: null,
      publishedDate: null,
      pageCount: null
    }, '9780486214375', 'session-1')

    expect(result.draft.title).toBe('My corrected title')
    expect(result.draft.authors).toBe('Typed author')
    expect(result.draft.importSessionId).toBe('session-1')
  })
})
