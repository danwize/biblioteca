import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({
  detectIsbnBarcode: vi.fn<() => Promise<string | null>>(),
  recognizeBookText: vi.fn<() => Promise<{ rawText: string; isbn: string | null; title: string | null; authors: string[] }>>()
}))

vi.mock('./lib/barcode', () => ({ detectIsbnBarcode: mocks.detectIsbnBarcode }))
vi.mock('./lib/ocr', () => ({ recognizeBookText: mocks.recognizeBookText }))

const blankJpeg = new File(['book image'], 'book.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  mocks.detectIsbnBarcode.mockReset()
  mocks.recognizeBookText.mockReset()
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/images')) {
      return { ok: true, json: async () => ({}) }
    }

    const body = JSON.parse(String(init?.body ?? '{}'))
    const query = String(body.query ?? '')
    if (query.includes('ListCopies')) {
      return { ok: true, json: async () => ({ data: { physicalCopies: [] } }) }
    }
    if (query.includes('StartImport')) {
      return { ok: true, json: async () => ({ data: { startImportSession: { id: 'session-1' } } }) }
    }
    if (query.includes('LookupBook')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            lookupBookByIsbn: {
              title: 'Lookup Title',
              subtitle: null,
              authors: ['Lookup Author'],
              isbn13: body.variables.isbn,
              isbn10: null,
              publisher: 'Lookup Press',
              publishedDate: '2026',
              pageCount: 123
            }
          }
        })
      }
    }

    return { ok: true, json: async () => ({ data: {} }) }
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('renders the scanner heading', async () => {
    render(<App />)
    expect(await screen.findByText(/Scan, correct, and catalog your books/i)).toBeInTheDocument()
  })

  it('detects barcode before OCR and starts ISBN lookup', async () => {
    mocks.detectIsbnBarcode.mockResolvedValue('9780486214375')
    mocks.recognizeBookText.mockResolvedValue({ rawText: '', isbn: null, title: null, authors: [] })
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /add back cover/i }))
    await userEvent.upload(screen.getByLabelText(/choose back cover image/i), blankJpeg)

    await waitFor(() => expect(screen.getByDisplayValue('Lookup Title')).toBeInTheDocument())
    expect(mocks.detectIsbnBarcode).toHaveBeenCalledTimes(1)
    expect(mocks.recognizeBookText).not.toHaveBeenCalled()
    expect(screen.getAllByDisplayValue('9780486214375')).toHaveLength(2)
  })

  it('front cover skips barcode detection and runs OCR directly', async () => {
    mocks.detectIsbnBarcode.mockResolvedValue('9780486214375')
    mocks.recognizeBookText.mockResolvedValue({
      rawText: 'Front Cover Title\nby F. Author',
      isbn: null,
      title: 'Front Cover Title',
      authors: ['F. Author']
    })
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /add front cover/i }))
    await userEvent.upload(screen.getByLabelText(/choose front cover image/i), blankJpeg)

    await waitFor(() => expect(screen.getByDisplayValue('Front Cover Title')).toBeInTheDocument())
    expect(mocks.detectIsbnBarcode).not.toHaveBeenCalled()
    expect(mocks.recognizeBookText).toHaveBeenCalledTimes(1)
  })

  it('shows take-photo capture input as primary on coarse-pointer device', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    }))
    vi.stubGlobal('isSecureContext', true)
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /add back cover/i }))

    expect(screen.getByLabelText(/take back cover photo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/choose back cover image/i)).toBeInTheDocument()
  })

  it('falls back to OCR when barcode lookup misses', async () => {
    mocks.detectIsbnBarcode.mockResolvedValue(null)
    mocks.recognizeBookText.mockResolvedValue({
      rawText: 'The OCR Title\nby O. Reader\nISBN 978-0-486-21437-5',
      isbn: '9780486214375',
      title: 'The OCR Title',
      authors: ['O. Reader']
    })
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /add front cover/i }))
    await userEvent.upload(screen.getByLabelText(/choose front cover image/i), blankJpeg)

    await waitFor(() => expect(screen.getByDisplayValue('The OCR Title')).toBeInTheDocument())
    expect(mocks.recognizeBookText).toHaveBeenCalledTimes(1)
    expect(screen.getByDisplayValue('O. Reader')).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('9780486214375')).toHaveLength(2)
  })
})
