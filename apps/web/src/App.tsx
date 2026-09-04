import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import './App.css'
import { CONFIRM_IMPORT, LIST_COPIES, LOOKUP_BOOK, START_IMPORT } from './graphql/operations'
import { graphqlRequest } from './lib/graphql'
import { extractIsbn, normalizeIsbn } from './lib/isbn'
import { recognizeBookText, type OcrSuggestion } from './lib/ocr'
import { BrowserMultiFormatReader } from '@zxing/browser'

type PhysicalCopy = {
  id: string
  title: string
  primaryAuthor: string | null
  isbn13: string | null
  publisher: string | null
  publishedDate: string | null
  pageCount: number | null
  copyNumber: number
}

type LookupBook = {
  title: string | null
  subtitle: string | null
  authors: string[]
  isbn13: string | null
  isbn10: string | null
  publisher: string | null
  publishedDate: string | null
  pageCount: number | null
}

type Draft = {
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

type Capture = { kind: 'front' | 'back' | 'spine' | 'additional'; dataUrl: string }

const emptyDraft: Draft = {
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

function App() {
  const [copies, setCopies] = useState<PhysicalCopy[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [isbn, setIsbn] = useState('')
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [captureKind, setCaptureKind] = useState<Capture['kind']>('front')
  const [isProcessingCaptures, setIsProcessingCaptures] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    void loadCopies()
    return () => stopCamera()
  }, [])

  async function loadCopies() {
    const data = await graphqlRequest<{ physicalCopies: PhysicalCopy[] }>(LIST_COPIES)
    setCopies(data.physicalCopies)
  }

  async function lookupByIsbn(value = isbn) {
    const normalized = normalizeIsbn(value)
    if (!normalized) return

    setIsBusy(true)
    setMessage('Looking up book metadata...')
    try {
      const sessionData = await graphqlRequest<{ startImportSession: { id: string } }>(START_IMPORT, {
        input: { scannedIsbn: normalized, detectedTitle: null, detectedAuthors: [], ocrText: draft.ocrText || null }
      })
      const data = await graphqlRequest<{ lookupBookByIsbn: LookupBook | null }>(LOOKUP_BOOK, { isbn: normalized })
      const book = data.lookupBookByIsbn
      setDraft((current) => ({
        ...current,
        importSessionId: sessionData.startImportSession.id,
        title: book?.title ?? current.title,
        subtitle: book?.subtitle ?? current.subtitle,
        authors: book?.authors.join(', ') ?? current.authors,
        isbn13: book?.isbn13 ?? (normalized.length === 13 ? normalized : current.isbn13),
        isbn10: book?.isbn10 ?? (normalized.length === 10 ? normalized : current.isbn10),
        publisher: book?.publisher ?? current.publisher,
        publishedDate: book?.publishedDate ?? current.publishedDate,
        pageCount: book?.pageCount?.toString() ?? current.pageCount
      }))
      setMessage(book ? 'Metadata found. Review and correct before importing.' : 'No metadata found. Fill the form manually.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Lookup failed.')
    } finally {
      setIsBusy(false)
    }
  }

  async function startCamera() {
    setMessage('Starting camera...')

    if (!window.isSecureContext) {
      setMessage('Camera access requires HTTPS, or localhost on the same computer. If you opened this from your phone or by LAN IP over http, the browser will block scanning.')
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('This browser does not expose camera access to the app. Try Chrome, Edge, or Safari over HTTPS/localhost.')
      return
    }

    try {
      stopCamera()
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraActive(true)
      setMessage('Camera started. Capture the cover or back cover when it is in frame.')
    } catch (error) {
      setCameraActive(false)
      setMessage(cameraErrorMessage(error))
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraActive(false)
  }

  async function captureImage() {
    const video = videoRef.current
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA || !video.videoWidth || !video.videoHeight) {
      setMessage('Camera is still preparing. Hold on a moment, then try again.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    await addCapture(dataUrl, captureKind)
  }

  async function addCapture(dataUrl: string, kind: Capture['kind']) {
    const capture = { dataUrl, kind }
    setCaptures((current) => [...current, capture])
    setMessage('Photo captured. Checking for an ISBN barcode...')
    try {
      const reader = new BrowserMultiFormatReader()
      const result = await reader.decodeFromImageUrl(dataUrl)
      const detected = extractIsbn(result.getText())
      if (detected) {
        setMessage(`ISBN ${detected} found. Looking up book metadata...`)
        await lookupByIsbn(detected)
        return
      }
    } catch {
      // A photo without a barcode is expected; OCR runs when the session is done.
    }
    setMessage(`${labelForCapture(kind)} saved. Capture the next side or choose Done.`)
    if (kind === 'front') setCaptureKind('back')
  }

  async function addUploadedCapture(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    await addCapture(dataUrl, captureKind)
  }

  async function finishCapture() {
    if (!captures.length) {
      setMessage('Capture at least one photo before selecting Done.')
      return
    }
    setIsProcessingCaptures(true)
    setMessage('Reading all captured photos for title, authors, series, and ISBN...')
    try {
      const suggestions: OcrSuggestion[] = []
      for (const { dataUrl } of captures) {
        const response = await fetch(dataUrl)
        suggestions.push(await recognizeBookText(await response.blob()))
      }
      suggestions.forEach((suggestion) => applyOcrSuggestion(suggestion))
      setDraft((current) => ({ ...current, ocrText: suggestions.map((suggestion) => suggestion.rawText).filter(Boolean).join('\n\n') }))
      setMessage('Capture complete. Review and correct the suggested metadata before importing.')
    } catch {
      setMessage('Capture complete. OCR was unavailable, so review or enter the metadata manually.')
    } finally {
      setIsProcessingCaptures(false)
    }
  }

  function labelForCapture(kind: Capture['kind']) {
    return { front: 'Front cover', back: 'Back cover', spine: 'Spine', additional: 'Additional photo' }[kind]
  }

  function applyOcrSuggestion(suggestion: OcrSuggestion) {
    setDraft((current) => ({
      ...current,
      title: current.title || suggestion.title || '',
      authors: current.authors || suggestion.authors.join(', '),
      series: current.series || suggestion.series || '',
      isbn13: current.isbn13 || (suggestion.isbn?.length === 13 ? suggestion.isbn : ''),
      isbn10: current.isbn10 || (suggestion.isbn?.length === 10 ? suggestion.isbn : ''),
      ocrText: suggestion.rawText
    }))
    if (suggestion.isbn) {
      setIsbn(suggestion.isbn)
    }
  }

  async function saveImport() {
    setIsBusy(true)
    try {
      await graphqlRequest(CONFIRM_IMPORT, {
        importSessionId: draft.importSessionId,
        input: {
          title: draft.title,
          subtitle: draft.subtitle || null,
          authors: draft.authors.split(',').map((author) => author.trim()).filter(Boolean),
          series: draft.series || null,
          seriesNumber: draft.seriesNumber || null,
          isbn13: draft.isbn13 || null,
          isbn10: draft.isbn10 || null,
          publisher: draft.publisher || null,
          publishedDate: draft.publishedDate || null,
          pageCount: draft.pageCount ? Number(draft.pageCount) : null,
          format: draft.format || null,
          status: 'unread',
          owned: true,
          condition: draft.condition || null,
          notes: draft.notes || null,
          ocrText: draft.ocrText || null
        }
      })
      setMessage('Book imported.')
      setDraft(emptyDraft)
      setCaptures([])
      setCaptureKind('front')
      await loadCopies()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed.')
    } finally {
      setIsBusy(false)
    }
  }

  function updateDraft(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function cameraErrorMessage(error: unknown) {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        return 'Camera permission was denied. Allow camera access in the browser permissions menu, then try again.'
      }
      if (error.name === 'NotFoundError') {
        return 'No camera was found on this device.'
      }
      if (error.name === 'NotReadableError') {
        return 'The camera is already in use by another app or browser tab.'
      }
      return `Camera failed: ${error.message || error.name}`
    }

    return 'Camera failed to start. The browser may be blocking camera access.'
  }

  return (
    <main className="app-shell">
      <header className="hero-panel">
        <div>
          <p className="eyebrow">Biblioteca v1</p>
          <h1>Scan, correct, and catalog your books.</h1>
          <p>Barcode lookup comes first. Client-side OCR helps when there is no barcode. Autocrop is tracked for v1.1.</p>
          <p className="secure-note">Camera scanning works only on HTTPS, or on <code>localhost</code> from the same computer.</p>
        </div>
        <button type="button" onClick={cameraActive ? stopCamera : startCamera}>{cameraActive ? 'Stop camera' : 'Start scanner'}</button>
      </header>

      {message && <p className="status" role="status">{message}</p>}

      <section className="scan-grid">
        <div className="camera-card">
          <div className="camera-viewport">
            <video ref={videoRef} aria-label="Book scanner camera preview" playsInline muted />
            {!cameraActive && <div className="camera-placeholder">Camera preview</div>}
          </div>
          <div className="capture-guide" aria-live="polite">
            <strong>Next: {labelForCapture(captureKind)}</strong>
            <span>{captureKind === 'front' ? 'Start with the front cover.' : captureKind === 'back' ? 'Now capture the back cover for ISBNs.' : 'Optional for books with useful extra detail.'}</span>
          </div>
          <div className="camera-actions">
            <button type="button" disabled={!cameraActive || isProcessingCaptures} onClick={() => void captureImage()}>Capture {labelForCapture(captureKind).toLowerCase()}</button>
            <label className="upload-button">Use a photo<input type="file" accept="image/*" capture="environment" onChange={(event) => void addUploadedCapture(event)} /></label>
          </div>
          <div className="optional-captures" aria-label="Optional capture types">
            {(['spine', 'additional'] as const).map((kind) => <button key={kind} type="button" className="secondary" onClick={() => setCaptureKind(kind)}>Add {labelForCapture(kind).toLowerCase()}</button>)}
          </div>
          {captures.length > 0 && <div className="capture-strip" aria-label="Captured photos">{captures.map((capture, index) => <figure key={`${capture.kind}-${index}`}><img src={capture.dataUrl} alt={`${labelForCapture(capture.kind)} captured`} /><figcaption>{labelForCapture(capture.kind)}</figcaption></figure>)}</div>}
          <button type="button" className="done-button" disabled={!captures.length || isProcessingCaptures} onClick={() => void finishCapture()}>Done</button>
        </div>

        <form className="import-form" onSubmit={(event) => { event.preventDefault(); void saveImport() }}>
          <label>
            ISBN lookup
            <span className="inline-field">
              <input value={isbn} onChange={(event) => setIsbn(event.target.value)} placeholder="9780486214375" />
              <button type="button" disabled={isBusy} onClick={() => void lookupByIsbn()}>Lookup</button>
            </span>
          </label>

          <label>Title<input required value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} /></label>
          <label>Authors<input value={draft.authors} onChange={(event) => updateDraft('authors', event.target.value)} placeholder="Comma-separated" /></label>
          <label>Series<input value={draft.series} onChange={(event) => updateDraft('series', event.target.value)} /></label>
          <label>Series number<input value={draft.seriesNumber} onChange={(event) => updateDraft('seriesNumber', event.target.value)} /></label>
          <div className="two-columns">
            <label>ISBN-13<input value={draft.isbn13} onChange={(event) => updateDraft('isbn13', event.target.value)} /></label>
            <label>ISBN-10<input value={draft.isbn10} onChange={(event) => updateDraft('isbn10', event.target.value)} /></label>
          </div>
          <div className="two-columns">
            <label>Publisher<input value={draft.publisher} onChange={(event) => updateDraft('publisher', event.target.value)} /></label>
            <label>Published<input value={draft.publishedDate} onChange={(event) => updateDraft('publishedDate', event.target.value)} /></label>
          </div>
          <div className="two-columns">
            <label>Pages<input value={draft.pageCount} onChange={(event) => updateDraft('pageCount', event.target.value)} inputMode="numeric" /></label>
            <label>Format<input value={draft.format} onChange={(event) => updateDraft('format', event.target.value)} placeholder="paperback, hardback" /></label>
          </div>
          <label>Notes<textarea value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} /></label>
          <button type="submit" disabled={isBusy || !draft.title}>Import book</button>
        </form>
      </section>

      <section className="library-panel">
        <h2>Library</h2>
        <div className="book-list">
          {copies.map((copy) => (
            <article key={copy.id} className="book-card">
              <h3>{copy.title}{copy.copyNumber > 1 ? ` Copy ${copy.copyNumber}` : ''}</h3>
              <p>{copy.primaryAuthor ?? 'Unknown author'}</p>
              <dl>
                <dt>ISBN</dt><dd>{copy.isbn13 ?? 'none'}</dd>
                <dt>Publisher</dt><dd>{copy.publisher ?? 'unknown'}</dd>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
