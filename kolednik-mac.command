#!/usr/bin/env bash
# Kolędnik — uruchomienie na własnym komputerze (macOS i Linux, np. Ubuntu).
# W Finderze: dwuklik. W Terminalu: ./kolednik-mac.command   (inny port: PORT=4000 ./kolednik-mac.command)
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3000}"
PNPM_VERSION=10.28.0

say() { printf '\n\033[1;33m✦ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*"; read -r -p "Naciśnij Enter, żeby zamknąć…" _ || true; exit 1; }

# 1. Node.js ≥ 22.13 (wbudowany SQLite).
if [ "$(uname)" = Darwin ]; then
  NODE_HINT="brew install node   (albo pobierz z https://nodejs.org — wersja LTS)"
else
  NODE_HINT="curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
   (Ubuntu ma w apt za starego Node'a — najpierw: sudo apt remove nodejs libnode-dev; albo użyj nvm: nvm install 22)"
fi
if ! command -v node >/dev/null 2>&1; then
  fail "Brak Node.js. Zainstaluj:  ${NODE_HINT}"
fi
NODE_OK=$(node -e 'const [a,b]=process.versions.node.split(".").map(Number); console.log(a>22||(a===22&&b>=13)?1:0)')
[ "$NODE_OK" = 1 ] || fail "Za stary Node.js ($(node -v)). Potrzebny 22.13 lub nowszy:  ${NODE_HINT}"

# 2. pnpm — z systemu, a jak go nie ma, przez npx (bez instalowania czegokolwiek globalnie).
if command -v pnpm >/dev/null 2>&1; then PNPM=(pnpm); else PNPM=(npx --yes "pnpm@${PNPM_VERSION}"); fi

# 3. Zależności i build — tylko gdy coś się zmieniło.
STAMP=node_modules/.kolednik-build
if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules/.modules.yaml ]; then
  say "Instaluję zależności (pierwszy raz potrwa minutę)…"
  "${PNPM[@]}" install --frozen-lockfile
fi
if [ ! -f "$STAMP" ] || [ -n "$(find apps packages content -newer "$STAMP" -type f -not -path '*/node_modules/*' -not -path '*/dist/*' -print -quit)" ]; then
  say "Buduję aplikację…"
  "${PNPM[@]}" build
  touch "$STAMP"
fi

# 4. Start serwera.
LAN_IP=""
if command -v ipconfig >/dev/null 2>&1; then
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
fi
[ -n "$LAN_IP" ] || LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)

say "Kolędnik startuje na porcie ${PORT}"
echo "   Telewizor / ten komputer:  http://localhost:${PORT}"
[ -n "$LAN_IP" ] && echo "   Telefony (to samo Wi-Fi):  http://${LAN_IP}:${PORT}/j   — albo zeskanujcie kod QR z ekranu"
echo "   Kilku „gości” na jednym komputerze: http://localhost:${PORT}/j?gosc=1, ?gosc=2 … (każda karta osobno)"
echo "   Rekordy zapisują się w: $(pwd)/data"
echo "   Zatrzymanie: Ctrl+C"

# Otwórz przeglądarkę, gdy serwer wstanie (Chrome — ma polski głos narratora; inaczej domyślna).
(
  for _ in $(seq 1 50); do
    if curl -fs "http://localhost:${PORT}/healthz" >/dev/null 2>&1; then
      if [ "$(uname)" = Darwin ]; then
        open -a "Google Chrome" "http://localhost:${PORT}" 2>/dev/null || open "http://localhost:${PORT}"
      elif command -v google-chrome >/dev/null 2>&1; then
        google-chrome "http://localhost:${PORT}" >/dev/null 2>&1 &
      elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://localhost:${PORT}" >/dev/null 2>&1 || true
      fi
      exit 0
    fi
    sleep 0.2
  done
) &

PORT="$PORT" HOST=0.0.0.0 DATA_DIR="$(pwd)/data" \
  exec node --disable-warning=ExperimentalWarning apps/server/dist/index.cjs
