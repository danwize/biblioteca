import { render, screen } from '@testing-library/react'
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
})
