#!/usr/bin/env bash
set -euo pipefail

host="${1:-localhost}"
cert_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docker/certs"

mkdir -p "$cert_dir"

if command -v mkcert >/dev/null 2>&1; then
  mkcert -install
  mkcert -cert-file "$cert_dir/biblioteca.pem" -key-file "$cert_dir/biblioteca-key.pem" "$host" localhost 127.0.0.1 ::1
  echo "Created trusted local certificate for $host in $cert_dir"
  exit 0
fi

openssl req -x509 -newkey rsa:4096 -sha256 -days 365 -nodes \
  -keyout "$cert_dir/biblioteca-key.pem" \
  -out "$cert_dir/biblioteca.pem" \
  -subj "/CN=$host" \
  -addext "subjectAltName=DNS:$host,DNS:localhost,IP:127.0.0.1,IP:::1"

echo "Created self-signed certificate in $cert_dir"
echo "Install mkcert and rerun this script if you need a browser-trusted certificate."
