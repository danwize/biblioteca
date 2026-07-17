# Architecture Notes

## Data Model

Biblioteca starts with a normalized model instead of putting copy details into titles.

- `works`: canonical book/work metadata such as title, authors, series, and subjects.
- `physical_copies`: owned copies with ISBN, publisher, status, condition, notes, and copy number.
- `book_images`: original/cropped image paths and future crop metadata.
- `metadata_sources`: raw payloads from Open Library, OCR, barcode, and manual correction.
- `import_sessions`: draft scanner sessions before the user confirms the import.

EF Core is code-first. Mapping is configured through fluent API classes under `services/api/Data/Configurations`.

## Scan Pipeline

V1 uses a barcode-first scan pipeline. When the user captures a back cover or spine image, `BarcodeDetector` (the native browser API) runs first using EAN-13 and UPC-A formats; ZXing serves as a WASM fallback for browsers without native support. A detected ISBN triggers an Open Library lookup and fills the draft form without running OCR. Front cover captures skip barcode detection and go straight to OCR.

When barcode detection misses or is unavailable, Tesseract.js runs in the browser for OCR. Keeping both barcode detection and OCR client-side avoids dedicated server CPU/GPU resources.

AI is intentionally not part of v1. If needed later, add it behind a metadata extraction provider interface so imports can combine barcode, OCR, API lookup, and manual correction.
