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

V1 uses a guided capture session: front cover, then back cover, with optional spine and additional photos, finished with **Done**. After every captured photo, `BarcodeDetector` (the native browser API) runs first using EAN-13 and UPC-A formats, with ZXing as a fallback for browsers without native support; a checksum-valid ISBN triggers an immediate Open Library lookup that fills the draft form.

On **Done**, Tesseract.js runs in the browser across all captured photos to suggest the title, authors, series, and ISBN values that barcode lookup did not provide. The user reviews and corrects the draft before importing. Keeping both barcode detection and OCR client-side avoids dedicated server CPU/GPU resources.

AI is intentionally not part of v1. If needed later, add it behind a metadata extraction provider interface so imports can combine barcode, OCR, API lookup, and manual correction.
