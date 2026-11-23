import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import './App.css'
import { CONFIRM_IMPORT, LIST_COPIES, LOOKUP_BOOK, START_IMPORT } from './graphql/operations'
import { graphqlRequest } from './lib/graphql'
import { normalizeIsbn } from './lib/isbn'
import { recognizeBookText, type OcrSuggestion } from './lib/ocr'
import { detectIsbn } from './lib/barcode'
import {
  applyLookupToDraft,
  applyOcrToDraft,
  emptyDraft,
  emptyFieldSources,
  type Draft,
  type DraftFieldSources,
  type LookupBook
} from './lib/draftAutofill'

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

type Capture = { kind: 'front' | 'back' | 'spine' | 'additional'; dataUrl: string }

function App() {
  const [copies, setCopies] = useState<PhysicalCopy[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const draftRef = useRef<Draft>(emptyDraft)
  const [fieldSources, setFieldSources] = useState<DraftFieldSources>(emptyFieldSources)
  const fieldSourcesRef = useRef<DraftFieldSources>(emptyFieldSources)
  const [isbn, setIsbn] = useState('')
  const [message, setMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [captureKind, setCaptureKind] = useState<Capture['kind']>('front')
  const [isProcessingCaptures, setIsProcessingCaptures] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lookupSequenceRef = useRef(0)
  const pendingLookupCountRef = useRef(0)

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
    const lookupSequence = lookupSequenceRef.current + 1
    lookupSequenceRef.current = lookupSequence
    pendingLookupCountRef.current += 1
    setMessage('Looking up book metadata...')
    try {
      const currentDraft = draftRef.current
      const sessionData = await graphqlRequest<{ startImportSession: { id: string } }>(START_IMPORT, {
        input: { scannedIsbn: normalized, detectedTitle: null, detectedAuthors: [], ocrText: currentDraft.ocrText || null }
      })
      const data = await graphqlRequest<{ lookupBookByIsbn: LookupBook | null }>(LOOKUP_BOOK, { isbn: normalized })
      if (lookupSequence !== lookupSequenceRef.current) return
      const next = applyLookupToDraft(draftRef.current, fieldSourcesRef.current, data.lookupBookByIsbn, normalized, sessionData.startImportSession.id)
      updateDraftState(next.draft)
      updateFieldSources(next.sources)
      const book = data.lookupBookByIsbn
      setMessage(book ? 'Metadata found. Review and correct before importing.' : 'No metadata found. Fill the form manually.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Lookup failed.')
    } finally {
      if (--pendingLookupCountRef.current === 0) setIsBusy(false)
    }
  }

  function updateDraftState(next: Draft) {
    draftRef.current = next
    setDraft(next)
  }

  function fieldLabel(label: string, field: keyof Draft) {
    const source = fieldSources[field]
    return source === 'empty' ? label : `${label} (${source})`
  }

  function updateFieldSources(next: DraftFieldSources) {
    fieldSourcesRef.current = next
    setFieldSources(next)
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
    const kindAtCapture = captureKind
    await addCapture(dataUrl, kindAtCapture)
  }

  async function addCapture(dataUrl: string, kind: Capture['kind']) {
    const capture = { dataUrl, kind }
    setCaptures((current) => [...current, capture])
    const nextKind = nextCaptureKind(kind, captures)
    setCaptureKind(nextKind)
    setMessage('Photo captured. Checking for an ISBN barcode...')
    let detectedIsbn: string | null = null
    try {
      detectedIsbn = await detectIsbn(dataUrl)
      if (detectedIsbn) {
        setIsbn(detectedIsbn)
        setMessage(`ISBN ${detectedIsbn} found. Looking up book metadata...`)
        await lookupByIsbn(detectedIsbn)
      }
    } catch {
      // A photo without a barcode is expected; OCR runs when the session is done.
    }
    if (!detectedIsbn) setMessage(`${labelForCapture(kind)} saved. Capture the next side or choose Done.`)
  }

  function nextCaptureKind(kind: Capture['kind'], currentCaptures: Capture[]) {
    return requiredCaptureKind([...currentCaptures, { kind, dataUrl: '' }])
  }

  function requiredCaptureKind(currentCaptures: Capture[]) {
    const kinds = new Set(currentCaptures.map((capture) => capture.kind))
    if (!kinds.has('front')) return 'front'
    if (!kinds.has('back')) return 'back'
    return 'additional'
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
      let failedCount = 0
      for (const { dataUrl } of captures) {
        try {
          const response = await fetch(dataUrl)
          suggestions.push(await recognizeBookText(await response.blob()))
        } catch {
          failedCount += 1
        }
      }
      suggestions.forEach((suggestion) => applyOcrSuggestion(suggestion))
      if (!suggestions.length) {
        setMessage('Capture complete. OCR was unavailable, so review or enter the metadata manually.')
      } else {
        setMessage(failedCount ? `Capture complete. ${failedCount} photo${failedCount === 1 ? '' : 's'} could not be read; review the suggestions.` : 'Capture complete. Review and correct the suggested metadata before importing.')
      }
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
    const next = applyOcrToDraft(draftRef.current, fieldSourcesRef.current, suggestion)
    updateDraftState(next.draft)
    updateFieldSources(next.sources)
    if (suggestion.isbn) {
      setIsbn(suggestion.isbn)
    }
  }

  async function saveImport() {
    if (!captures.some((capture) => capture.kind === 'front') || !captures.some((capture) => capture.kind === 'back')) {
      setMessage('Capture at least a front cover and back cover before importing.')
      return
    }
    lookupSequenceRef.current += 1
    const capturesToUpload = [...captures]
    setIsBusy(true)
    try {
      const result = await graphqlRequest<{ confirmBookImport: { id: string } }>(CONFIRM_IMPORT, {
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
      updateDraftState(emptyDraft)
      updateFieldSources(emptyFieldSources)
      setCaptures([])
      setCaptureKind('front')
      setIsbn('')
      setMessage('Book imported.')
      let uploadFailed = false
      for (const capture of capturesToUpload) {
        const formData = new FormData()
        formData.append('physicalCopyId', result.confirmBookImport.id)
        formData.append('kind', capture.kind === 'front' ? 'front_cover' : capture.kind === 'back' ? 'back_cover' : capture.kind)
        formData.append('file', dataUrlToBlob(capture.dataUrl), `${capture.kind}.jpg`)
        try {
          const response = await fetch('/images', { method: 'POST', body: formData })
          if (!response.ok) uploadFailed = true
        } catch {
          uploadFailed = true
        }
      }
      if (uploadFailed) setMessage('Book imported, but one or more image uploads failed.')
      await loadCopies()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed.')
    } finally {
      setIsBusy(false)
    }
  }

  function updateDraft(field: keyof Draft, value: string) {
    updateDraftState({ ...draftRef.current, [field]: value })
    updateFieldSources({ ...fieldSourcesRef.current, [field]: 'manual' })
  }

  function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',')
    const mime = header.match(/data:(.*);base64/)?.[1] ?? 'image/jpeg'
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    return new Blob([bytes], { type: mime })
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
            <button type="button" disabled={!cameraActive || isProcessingCaptures || isBusy} onClick={() => void captureImage()}>Capture {labelForCapture(captureKind).toLowerCase()}</button>
            <label className="upload-button">Use a photo<input type="file" accept="image/*" disabled={isProcessingCaptures || isBusy} onChange={(event) => void addUploadedCapture(event)} /></label>
          </div>
          <div className="optional-captures" aria-label="Optional capture types">
            {(['spine', 'additional'] as const).map((kind) => <button key={kind} type="button" className="secondary" disabled={isProcessingCaptures || isBusy} onClick={() => setCaptureKind(kind)}>Add {labelForCapture(kind).toLowerCase()}</button>)}
          </div>
          {captures.length > 0 && <div className="capture-strip" aria-label="Captured photos">{captures.map((capture, index) => <figure key={`${capture.kind}-${index}`}><img src={capture.dataUrl} alt={`${labelForCapture(capture.kind)} captured`} /><figcaption>{labelForCapture(capture.kind)}</figcaption><select aria-label={`Relabel photo ${index + 1}`} value={capture.kind} disabled={isProcessingCaptures || isBusy} onChange={(event) => setCaptures((current) => { const next = current.map((item, itemIndex) => itemIndex === index ? { ...item, kind: event.target.value as Capture['kind'] } : item); setCaptureKind(requiredCaptureKind(next)); return next })}><option value="front">Front cover</option><option value="back">Back cover</option><option value="spine">Spine</option><option value="additional">Additional photo</option></select><button type="button" className="secondary" disabled={isProcessingCaptures || isBusy} onClick={() => setCaptures((current) => { const next = current.filter((_, itemIndex) => itemIndex !== index); setCaptureKind(requiredCaptureKind(next)); return next })}>Remove</button></figure>)}</div>}
          <button type="button" className="done-button" disabled={!captures.length || isProcessingCaptures || isBusy} onClick={() => void finishCapture()}>Done</button>
        </div>

        <form className="import-form" onSubmit={(event) => { event.preventDefault(); void saveImport() }}>
          <label>
            ISBN lookup
            <span className="inline-field">
              <input value={isbn} onChange={(event) => setIsbn(event.target.value)} placeholder="9780486214375" disabled={isProcessingCaptures || isBusy} />
              <button type="button" disabled={isBusy || isProcessingCaptures} onClick={() => void lookupByIsbn()}>Lookup</button>
            </span>
          </label>

          <label>{fieldLabel('Title', 'title')}<input required value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} /></label>
          <label>{fieldLabel('Authors', 'authors')}<input value={draft.authors} onChange={(event) => updateDraft('authors', event.target.value)} placeholder="Comma-separated" /></label>
          <label>{fieldLabel('Series', 'series')}<input value={draft.series} onChange={(event) => updateDraft('series', event.target.value)} /></label>
          <label>{fieldLabel('Series number', 'seriesNumber')}<input value={draft.seriesNumber} onChange={(event) => updateDraft('seriesNumber', event.target.value)} /></label>
          <div className="two-columns">
            <label>{fieldLabel('ISBN-13', 'isbn13')}<input value={draft.isbn13} onChange={(event) => updateDraft('isbn13', event.target.value)} /></label>
            <label>{fieldLabel('ISBN-10', 'isbn10')}<input value={draft.isbn10} onChange={(event) => updateDraft('isbn10', event.target.value)} /></label>
          </div>
          <div className="two-columns">
            <label>{fieldLabel('Publisher', 'publisher')}<input value={draft.publisher} onChange={(event) => updateDraft('publisher', event.target.value)} /></label>
            <label>{fieldLabel('Published', 'publishedDate')}<input value={draft.publishedDate} onChange={(event) => updateDraft('publishedDate', event.target.value)} /></label>
          </div>
          <div className="two-columns">
            <label>{fieldLabel('Pages', 'pageCount')}<input value={draft.pageCount} onChange={(event) => updateDraft('pageCount', event.target.value)} inputMode="numeric" /></label>
            <label>{fieldLabel('Format', 'format')}<input value={draft.format} onChange={(event) => updateDraft('format', event.target.value)} placeholder="paperback, hardback" /></label>
          </div>
          <label>{fieldLabel('Notes', 'notes')}<textarea value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} /></label>
          <button type="submit" disabled={isBusy || isProcessingCaptures || !draft.title}>Import book</button>
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
