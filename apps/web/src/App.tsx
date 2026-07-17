import { useEffect, useRef, useState } from 'react'
import './App.css'
import { CONFIRM_IMPORT, LIST_COPIES, LOOKUP_BOOK, START_IMPORT } from './graphql/operations'
import { detectIsbnBarcode } from './lib/barcode'
import {
  applyLookupToDraft,
  applyOcrToDraft,
  emptyDraft,
  emptyFieldSources,
  type Draft,
  type DraftFieldSources,
  type LookupBook
} from './lib/draftAutofill'
import { graphqlRequest } from './lib/graphql'
import { normalizeIsbn } from './lib/isbn'
import { recognizeBookText, type OcrSuggestion } from './lib/ocr'

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

type CapturedBookImages = {
  front_cover: string | null
  back_cover: string | null
  spine: string | null
}

type ImageKind = keyof CapturedBookImages
type ToastTone = 'info' | 'success' | 'warning' | 'error'
type Toast = { id: number; message: string; tone: ToastTone }
type ImageStatus = 'empty' | 'saved' | 'scanning' | 'barcode' | 'ocr' | 'no_barcode' | 'error'
type ImageStatuses = Record<ImageKind, ImageStatus>

const emptyImages: CapturedBookImages = { front_cover: null, back_cover: null, spine: null }
const emptyImageStatuses: ImageStatuses = { front_cover: 'empty', back_cover: 'empty', spine: 'empty' }

function App() {
  const [copies, setCopies] = useState<PhysicalCopy[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const draftRef = useRef<Draft>(emptyDraft)
  const [fieldSources, setFieldSources] = useState<DraftFieldSources>(emptyFieldSources)
  const fieldSourcesRef = useRef<DraftFieldSources>(emptyFieldSources)
  const [isbn, setIsbn] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [capturedImages, setCapturedImages] = useState<CapturedBookImages>(emptyImages)
  const capturedImagesRef = useRef<CapturedBookImages>(emptyImages)
  const [imageStatuses, setImageStatuses] = useState<ImageStatuses>(emptyImageStatuses)
  const [activeImageKind, setActiveImageKind] = useState<ImageKind | null>(null)
  const [mobileFallbackKind, setMobileFallbackKind] = useState<ImageKind | null>(null)
  const [coarsePointer, setCoarsePointer] = useState(false)
  const [cameraAvailable, setCameraAvailable] = useState(false)
  const [pickerCameraReady, setPickerCameraReady] = useState(false)
  const nativeCaptureInputsRef = useRef<Partial<Record<ImageKind, HTMLInputElement | null>>>({})
  const pickerVideoRef = useRef<HTMLVideoElement>(null)
  const pickerStreamRef = useRef<MediaStream | null>(null)
  const lookupSequenceRef = useRef(0)

  useEffect(() => {
    void loadCopies()
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
    setCoarsePointer(coarse)
    setCameraAvailable(window.isSecureContext && (coarse || Boolean(navigator.mediaDevices?.getUserMedia)))
    return () => stopPickerCamera()
  }, [])

  useEffect(() => {
    if (activeImageKind && cameraAvailable && !coarsePointer) {
      void startPickerCamera()
      return () => stopPickerCamera()
    }

    stopPickerCamera()
  }, [activeImageKind, cameraAvailable, coarsePointer])

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
    showToast('Looking up book metadata...')
    try {
      const currentDraft = draftRef.current
      const sessionData = await graphqlRequest<{ startImportSession: { id: string } }>(START_IMPORT, {
        input: { scannedIsbn: normalized, detectedTitle: null, detectedAuthors: [], ocrText: currentDraft.ocrText || null }
      })
      const data = await graphqlRequest<{ lookupBookByIsbn: LookupBook | null }>(LOOKUP_BOOK, { isbn: normalized })
      if (lookupSequence !== lookupSequenceRef.current) return
      const next = applyLookupToDraft(
        draftRef.current,
        fieldSourcesRef.current,
        data.lookupBookByIsbn,
        normalized,
        sessionData.startImportSession.id
      )
      updateDraftState(next.draft)
      updateFieldSources(next.sources)
      showToast(data.lookupBookByIsbn ? 'Metadata found from barcode lookup.' : 'No metadata found. Fill the form manually.', data.lookupBookByIsbn ? 'success' : 'warning')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Lookup failed.', 'error')
    } finally {
      setIsBusy(false)
    }
  }

  async function chooseImage(kind: ImageKind, file: File | undefined) {
    if (!file) return

    const dataUrl = await fileToDataUrl(file)
    setActiveImageKind(null)
    setMobileFallbackKind(null)
    await processSelectedImage(kind, dataUrl, () => Promise.resolve(file))
  }

  function handleImageInput(kind: ImageKind, input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ''
    void chooseImage(kind, file)
  }

  function openImagePicker(kind: ImageKind) {
    if (coarsePointer) {
      setMobileFallbackKind(kind)
      nativeCaptureInputsRef.current[kind]?.click()
      return
    }

    setActiveImageKind(kind)
  }

  function openFallbackImagePicker(kind: ImageKind) {
    setMobileFallbackKind(null)
    setActiveImageKind(kind)
  }

  function closeImagePicker() {
    stopPickerCamera()
    setActiveImageKind(null)
  }

  async function startPickerCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('Camera preview is not available in this browser.', 'warning')
      return
    }

    try {
      stopPickerCamera()
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      pickerStreamRef.current = stream
      if (pickerVideoRef.current) {
        pickerVideoRef.current.srcObject = stream
        await pickerVideoRef.current.play()
      }
      setPickerCameraReady(true)
    } catch (error) {
      showToast(cameraErrorMessage(error), 'error')
    }
  }

  function stopPickerCamera() {
    pickerStreamRef.current?.getTracks().forEach((track) => track.stop())
    pickerStreamRef.current = null
    setPickerCameraReady(false)
  }

  async function takePickerPhoto() {
    if (!activeImageKind || !pickerVideoRef.current) return

    const video = pickerVideoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    const kind = activeImageKind
    closeImagePicker()
    await processSelectedImage(kind, dataUrl, () => canvasToBlob(canvas))
  }

  async function processSelectedImage(kind: ImageKind, dataUrl: string, getBlob: () => Promise<Blob | null>) {
    updateCapturedImages({ ...capturedImagesRef.current, [kind]: dataUrl })
    setImageStatuses((current) => ({ ...current, [kind]: 'scanning' }))

    if (kind !== 'front_cover') {
      showToast(`${imageLabel(kind)} saved. Scanning barcode...`)
      const detectedBarcode = await detectIsbnBarcode(dataUrl)
      if (detectedBarcode) {
        setIsbn(detectedBarcode)
        setImageStatuses((current) => ({ ...current, [kind]: 'barcode' }))
        showToast(`Barcode found: ${detectedBarcode}. Looking up metadata...`, 'success')
        await lookupByIsbn(detectedBarcode)
        return
      }
      setImageStatuses((current) => ({ ...current, [kind]: 'no_barcode' }))
      showToast(`No barcode found in ${imageLabel(kind).toLowerCase()}. Trying OCR...`, 'warning')
    } else {
      showToast(`${imageLabel(kind)} saved. Running OCR...`)
    }

    const blob = await getBlob()
    if (!blob) {
      setImageStatuses((current) => ({ ...current, [kind]: 'saved' }))
      return
    }

    try {
      const ocrFn = import.meta.env.MODE !== 'production'
        ? ((window as { __recognizeBookText?: typeof recognizeBookText }).__recognizeBookText ?? recognizeBookText)
        : recognizeBookText
      const suggestion = await ocrFn(blob)
      applyOcrSuggestion(suggestion)
      const hasSuggestion = Boolean(suggestion.title || suggestion.isbn || suggestion.authors.length)
      setImageStatuses((current) => ({ ...current, [kind]: hasSuggestion ? 'ocr' : 'saved' }))
      showToast(hasSuggestion ? 'OCR found possible values.' : 'OCR did not find reliable metadata. Image saved.', hasSuggestion ? 'warning' : 'info')
    } catch (error) {
      setImageStatuses((current) => ({ ...current, [kind]: 'error' }))
      showToast(`Image saved. OCR failed: ${error instanceof Error ? error.message : 'unknown error'}.`, 'error')
    }
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
    if (!capturedImages.front_cover || !capturedImages.back_cover) {
      showToast('Capture at least a front cover and back cover before importing.', 'error')
      return
    }

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

      const physicalCopyId = result.confirmBookImport.id
      updateDraftState(emptyDraft)
      updateFieldSources(emptyFieldSources)
      setIsbn('')

      try {
        await uploadCapturedImages(physicalCopyId)
        showToast('Book imported with front and back images.', 'success')
      } catch (uploadError) {
        showToast(uploadError instanceof Error ? uploadError.message : 'Book saved, but image upload failed.', 'warning')
      }

      updateCapturedImages(emptyImages)
      setImageStatuses(emptyImageStatuses)
      await loadCopies()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Import failed.', 'error')
    } finally {
      setIsBusy(false)
    }
  }

  function updateDraft(field: keyof Draft, value: string) {
    updateDraftState({ ...draftRef.current, [field]: value })
    updateFieldSources({ ...fieldSourcesRef.current, [field]: 'manual' })
  }

  function updateDraftState(next: Draft) {
    draftRef.current = next
    setDraft(next)
  }

  function updateFieldSources(next: DraftFieldSources) {
    fieldSourcesRef.current = next
    setFieldSources(next)
  }

  function updateCapturedImages(next: CapturedBookImages) {
    capturedImagesRef.current = next
    setCapturedImages(next)
  }

  function showToast(message: string, tone: ToastTone = 'info') {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, tone === 'error' ? 6500 : 4200)
  }

  function removeToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  async function uploadCapturedImages(physicalCopyId: string) {
    for (const [kind, dataUrl] of Object.entries(capturedImagesRef.current) as [ImageKind, string | null][]) {
      if (!dataUrl) continue

      const formData = new FormData()
      formData.append('physicalCopyId', physicalCopyId)
      formData.append('kind', kind)
      formData.append('file', dataUrlToBlob(dataUrl), `${kind}.jpg`)

      const response = await fetch('/images', { method: 'POST', body: formData })
      if (!response.ok) {
        throw new Error(`Book saved, but ${imageLabel(kind).toLowerCase()} upload failed.`)
      }
    }
  }

  function dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',')
    const mime = header.match(/data:(.*);base64/)?.[1] ?? 'image/jpeg'
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    return new Blob([bytes], { type: mime })
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Unable to read selected image.'))
      reader.readAsDataURL(file)
    })
  }

  function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  }

  function imageLabel(kind: ImageKind) {
    return kind === 'front_cover' ? 'Front cover' : kind === 'back_cover' ? 'Back cover' : 'Spine'
  }

  function imageStatusLabel(status: ImageStatus) {
    switch (status) {
      case 'scanning': return 'Scanning'
      case 'barcode': return 'Barcode found'
      case 'ocr': return 'OCR suggested'
      case 'no_barcode': return 'No barcode'
      case 'error': return 'Needs review'
      case 'saved': return 'Saved'
      default: return 'Empty'
    }
  }

  function fieldLabel(label: string, field: keyof Draft) {
    const source = fieldSources[field]
    return source === 'empty' ? label : `${label} (${source})`
  }

  function cameraErrorMessage(error: unknown) {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') return 'Camera permission was denied.'
      if (error.name === 'NotFoundError') return 'No camera was found on this device.'
      if (error.name === 'NotReadableError') return 'The camera is already in use by another app or browser tab.'
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
          <p>Barcode lookup comes first. Client-side OCR helps when there is no barcode. Capture front and back images before importing.</p>
          <p className="secure-note">Camera capture works only on HTTPS, or on <code>localhost</code> from the same computer.</p>
        </div>
      </header>

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <button key={toast.id} type="button" className={`toast toast-${toast.tone}`} onClick={() => removeToast(toast.id)}>
            {toast.message}
          </button>
        ))}
      </div>

      <section className="scan-grid" aria-label="Book image capture and import form">
        <div className="camera-card">
          <div className="image-card-heading">
            <h2>Book images</h2>
            <p>Add the back cover for barcode lookup. If no barcode is found, Biblioteca tries OCR.</p>
          </div>
          <div className="compact-image-grid">
            {(Object.keys(capturedImages) as ImageKind[]).map((kind) => {
              const dataUrl = capturedImages[kind]
              const status = imageStatuses[kind]
              return (
                <article key={kind} className={`compact-image-tile ${dataUrl ? 'has-image' : ''}`}>
                  <button type="button" className="thumbnail-button" onClick={() => openImagePicker(kind)} aria-label={`${dataUrl ? 'Edit' : 'Add'} ${imageLabel(kind)}`}>
                    {dataUrl ? <img src={dataUrl} alt={imageLabel(kind)} /> : <span className="plus-mark" aria-hidden="true">+</span>}
                    <span className={`image-status status-${status}`}>{imageStatusLabel(status)}</span>
                    {dataUrl && <span className="edit-badge">Edit</span>}
                  </button>
                  <input
                    ref={(input) => { nativeCaptureInputsRef.current[kind] = input }}
                    className="native-capture-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => handleImageInput(kind, event.currentTarget)}
                    aria-label={`Take ${imageLabel(kind)} photo`}
                  />
                  <h3>{imageLabel(kind)}</h3>
                  <p>{kind === 'spine' ? 'Optional' : 'Required'}</p>
                  {mobileFallbackKind === kind && (
                    <button type="button" className="tile-fallback-button" onClick={() => openFallbackImagePicker(kind)}>
                      Choose file instead
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        </div>

        {activeImageKind && (
          <div className="picker-backdrop" role="presentation" onClick={closeImagePicker}>
            <section className="image-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="image-picker-title" onClick={(event) => event.stopPropagation()}>
              <h2 id="image-picker-title">{imageLabel(activeImageKind)}</h2>
              <p>Use a clear, well-lit image. Barcodes are scanned before OCR.</p>
              {cameraAvailable && (
                coarsePointer ? (
                  <label className="picker-primary-action capture-action">
                    Take photo
                    <input type="file" accept="image/*" capture="environment" onChange={(event) => handleImageInput(activeImageKind, event.currentTarget)} aria-label={`Take ${imageLabel(activeImageKind)} photo`} />
                  </label>
                ) : (
                  <div className="picker-camera-panel">
                    <video ref={pickerVideoRef} aria-label="Camera preview" playsInline muted />
                    {!pickerCameraReady && <div className="picker-camera-placeholder">Starting camera...</div>}
                    <button type="button" className="picker-primary-button" disabled={!pickerCameraReady} onClick={() => void takePickerPhoto()}>Take photo</button>
                  </div>
                )
              )}
              <label className="picker-primary-action file-action">
                Choose file
                <input type="file" accept="image/*" onChange={(event) => handleImageInput(activeImageKind, event.currentTarget)} aria-label={`Choose ${imageLabel(activeImageKind)} image`} />
              </label>
              <button type="button" className="picker-cancel" onClick={closeImagePicker}>Cancel</button>
            </section>
          </div>
        )}

        <form className="import-form" onSubmit={(event) => { event.preventDefault(); void saveImport() }}>
          <label>
            ISBN lookup
            <span className="inline-field">
              <input value={isbn} onChange={(event) => setIsbn(event.target.value)} placeholder="9780486214375" inputMode="numeric" />
              <button type="button" disabled={isBusy} onClick={() => void lookupByIsbn()}>Lookup</button>
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
          <button type="submit" disabled={isBusy || !draft.title || !capturedImages.front_cover || !capturedImages.back_cover}>Import book</button>
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
