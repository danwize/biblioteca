# Architecture Notes

## Data Model

Biblioteca starts with a normalized model instead of putting copy details into titles.

- `works`: canonical book/work metadata such as title, authors, series, and subjects.
- `physical_copies`: owned copies with ISBN, publisher, status, condition, notes, and copy number.
- `book_images`: original/cropped image paths and future crop metadata.
- `metadata_sources`: raw payloads from Open Library, OCR, barcode, and manual correction.
- `import_sessions`: draft scanner sessions before the user confirms the import.

EF Core is code-first. Mapping is configured through fluent API classes under `services/api/Data/Configurations`.

## OCR And AI

V1 uses Tesseract.js in the browser for OCR. This avoids dedicated server CPU/GPU resources and keeps no-barcode workflows private by default.

AI is intentionally not part of v1. If needed later, add it behind a metadata extraction provider interface so imports can combine barcode, OCR, API lookup, and manual correction.
