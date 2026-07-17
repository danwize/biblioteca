import type { OcrSuggestion } from './ocr'

export type LookupBook = {
  title: string | null
  subtitle: string | null
  authors: string[]
  isbn13: string | null
  isbn10: string | null
  publisher: string | null
  publishedDate: string | null
  pageCount: number | null
}

export type Draft = {
  importSessionId: string | null
  title: string
  subtitle: string
  authors: string
  isbn13: string
  isbn10: string
  publisher: string
  publishedDate: string
  pageCount: string
  series: string
  seriesNumber: string
  format: string
  condition: string
  notes: string
  ocrText: string
}

export type FieldSource = 'empty' | 'ocr' | 'lookup' | 'manual'
export type DraftFieldSources = Record<keyof Draft, FieldSource>

export const emptyDraft: Draft = {
  importSessionId: null,
  title: '',
  subtitle: '',
  authors: '',
  isbn13: '',
  isbn10: '',
  publisher: '',
  publishedDate: '',
  pageCount: '',
  series: '',
  seriesNumber: '',
  format: '',
  condition: '',
  notes: '',
  ocrText: ''
}

export const emptyFieldSources = Object.fromEntries(
  Object.keys(emptyDraft).map((key) => [key, 'empty'])
) as DraftFieldSources

export function applyLookupToDraft(
  draft: Draft,
  sources: DraftFieldSources,
  book: LookupBook | null,
  normalizedIsbn: string,
  importSessionId: string
): { draft: Draft; sources: DraftFieldSources } {
  const values: Partial<Record<keyof Draft, string | null | undefined>> = {
    title: book?.title,
    subtitle: book?.subtitle,
    authors: book?.authors.join(', '),
    isbn13: book?.isbn13 ?? (normalizedIsbn.length === 13 ? normalizedIsbn : null),
    isbn10: book?.isbn10 ?? (normalizedIsbn.length === 10 ? normalizedIsbn : null),
    publisher: book?.publisher,
    publishedDate: book?.publishedDate,
    pageCount: book?.pageCount?.toString()
  }

  return {
    draft: {
      ...draft,
      importSessionId,
      title: lookupValue('title', values.title, draft.title, sources),
      subtitle: lookupValue('subtitle', values.subtitle, draft.subtitle, sources),
      authors: lookupValue('authors', values.authors, draft.authors, sources),
      isbn13: lookupValue('isbn13', values.isbn13, draft.isbn13, sources),
      isbn10: lookupValue('isbn10', values.isbn10, draft.isbn10, sources),
      publisher: lookupValue('publisher', values.publisher, draft.publisher, sources),
      publishedDate: lookupValue('publishedDate', values.publishedDate, draft.publishedDate, sources),
      pageCount: lookupValue('pageCount', values.pageCount, draft.pageCount, sources)
    },
    sources: markAutofilledSources(sources, values, 'lookup')
  }
}

export function applyOcrToDraft(
  draft: Draft,
  sources: DraftFieldSources,
  suggestion: OcrSuggestion
): { draft: Draft; sources: DraftFieldSources } {
  const values: Partial<Record<keyof Draft, string | null | undefined>> = {
    title: suggestion.title,
    authors: suggestion.authors.join(', '),
    isbn13: suggestion.isbn?.length === 13 ? suggestion.isbn : '',
    isbn10: suggestion.isbn?.length === 10 ? suggestion.isbn : '',
    ocrText: suggestion.rawText
  }

  return {
    draft: {
      ...draft,
      title: ocrValue('title', values.title, draft.title, sources),
      authors: ocrValue('authors', values.authors, draft.authors, sources),
      isbn13: ocrValue('isbn13', values.isbn13, draft.isbn13, sources),
      isbn10: ocrValue('isbn10', values.isbn10, draft.isbn10, sources),
      ocrText: suggestion.rawText
    },
    sources: markAutofilledSources(sources, values, 'ocr')
  }
}

function lookupValue(field: keyof Draft, incoming: string | null | undefined, current: string, sources: DraftFieldSources) {
  if (!incoming || sources[field] === 'manual') return current
  return incoming
}

function ocrValue(field: keyof Draft, incoming: string | null | undefined, current: string, sources: DraftFieldSources) {
  if (!incoming || sources[field] === 'manual' || sources[field] === 'lookup') return current
  return current || incoming
}

function markAutofilledSources(
  current: DraftFieldSources,
  values: Partial<Record<keyof Draft, string | null | undefined>>,
  source: Exclude<FieldSource, 'empty' | 'manual'>
): DraftFieldSources {
  const next = { ...current }
  for (const [field, value] of Object.entries(values) as [keyof Draft, string | null | undefined][]) {
    if (value && current[field] !== 'manual' && (source === 'lookup' || current[field] !== 'lookup')) {
      next[field] = source
    }
  }
  return next
}
