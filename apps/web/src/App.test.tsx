import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: true,
  json: async () => ({ data: { physicalCopies: [] } })
})))

describe('App', () => {
  it('renders the scanner heading', async () => {
    render(<App />)
    expect(await screen.findByText(/Scan, correct, and catalog your books/i)).toBeInTheDocument()
  })

  it('guides the first capture and keeps capture disabled until the camera is ready', async () => {
    render(<App />)
    expect((await screen.findAllByText(/Next: Front cover/i)).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /Capture front cover/i })[0]).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Done' })[0]).toBeDisabled()
  })

  it('blocks importing until both front and back covers are captured', async () => {
    const fetchMock = vi.mocked(fetch)
    const { container } = render(<App />)
    await screen.findAllByText(/Next: Front cover/i)
    const callsBeforeImport = fetchMock.mock.calls.length
    const form = container.querySelector('form.import-form') as HTMLFormElement
    fireEvent.change(form.querySelector('input[required]') as HTMLInputElement, { target: { value: 'The Pragmatic Programmer' } })
    fireEvent.submit(form)
    expect(await screen.findByText('Capture at least a front cover and back cover before importing.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.length).toBe(callsBeforeImport)
  })
})
