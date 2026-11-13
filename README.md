# Biblioteca

Biblioteca is a self-hosted Progressive Web App for scanning, correcting, and cataloging physical books.

## Stack

- React + TypeScript + Vite PWA frontend
- ASP.NET Core GraphQL backend with Hot Chocolate
- Postgres with EF Core code-first fluent mappings
- `jsonb` columns for raw OCR/API metadata
- Local Docker volume image storage for v1

## Run Locally

Aspire developer launch:

```bash
dotnet run --project orchestration/apphost/Biblioteca.AppHost.csproj
```

Docker Compose:

```bash
docker compose up --build
```

- Web: http://localhost:8081
- GraphQL: http://localhost:5000/graphql
- Health: http://localhost:5000/health

## Local HTTPS For Camera Testing

The desktop in-browser camera preview requires HTTPS. On mobile and tablet (coarse-pointer) devices, the app uses the native OS image picker instead of the camera API, so HTTPS is not required for the mobile scan flow. Desktop testing over a LAN IP still needs HTTPS with a certificate the device trusts.

Generate a local certificate:

```bash
scripts/create-local-cert.sh localhost
```

If you want to test from another device, pass a DNS name or LAN hostname that the device will use:

```bash
scripts/create-local-cert.sh biblioteca.local
BIBLIOTECA_HTTPS_HOST=biblioteca.local docker compose --profile https up --build
```

Then open:

```text
https://biblioteca.local:8443
```

Notes:

- `mkcert` is recommended because it creates locally trusted certificates.
- For desktop testing from another device over LAN, the device must trust the same mkcert root CA or the browser will block the in-app camera preview.
- The HTTPS proxy is optional. Without it, use `docker compose up --build` and browse `http://localhost:8081` from the same computer.
- In production on TrueNAS behind pfSense HAProxy, do not run the `https` profile. Let pfSense terminate TLS and forward HTTP to the `web` service.

## Deployment Modes

- Local direct HTTP: `docker compose up --build`
- Local HTTPS proxy: `docker compose --profile https up --build`
- Production external proxy: publish only the internal services you need and terminate TLS in pfSense HAProxy.

## Development

API:

```bash
dotnet run --project services/api/Biblioteca.Api.csproj
```

Web:

```bash
npm install --prefix apps/web
npm run dev --prefix apps/web
```

## V1 Scope

- Works and physical copies are separate tables.
- Book metadata lookup uses Open Library by ISBN.
- On desktop, an in-browser camera preview captures images; on mobile and tablet (coarse-pointer), the native OS image picker is used instead.
- Barcode detection runs first on back cover and spine captures using the native `BarcodeDetector` API with a ZXing fallback; a matched ISBN triggers metadata lookup without OCR.
- Client-side OCR (Tesseract.js) runs as a fallback when barcode detection misses or is unavailable, and exclusively on front cover captures.
- Users review and correct fields before import.
- Physical duplicate copies are modeled with `copy_number`.

## V1.1 Memory

- Add OpenCV.js-assisted crop suggestions after capture.
- Draw adjustable crop handles in the UI.
- Store original and cropped image paths plus crop polygon data.
- Add live “book detected” overlay once post-capture crop is stable.
- Keep OCR/AI client-side-first; add local server AI only if browser OCR proves insufficient.
