# ✦ Kolędnik

Karaoke do kolęd na święta. Telewizor (przeglądarka na PC) pokazuje kafelki kolęd i tekst, goście głosują
telefonami, narrator podpowiada następny wers, a kolędometr ocenia, jak głośno śpiewacie — i pilnuje rekordów.

- Wymagania: [WYMAGANIA.md](WYMAGANIA.md) · Plan i architektura: [PLAN.md](PLAN.md)
- Docelowy adres: **https://kolednik.505844.xyz**

## Jak się tym bawić

1. Na PC przy telewizorze otwórz stronę, wpisz nazwę grupy (np. „Rodzina Kowalskich”) — to wasze „konto”
   z rekordami — i wybierz motyw.
2. Kliknij **Włącz mikrofon** i chwilę bądźcie cicho (pomiar szumu w pokoju).
3. Goście skanują kod QR z telewizora (albo wchodzą na `/j` i wpisują 4-literowy kod).
4. **Głosujemy** — telefony pokazują wszystkie jeszcze niezaśpiewane kolędy, wyniki lecą na żywo na TV.
   Remis albo brak głosów rozstrzyga ruletka. Jest też **Losuj** i klik w kafelek.
5. Śpiewacie: tekst przewija się sam (tempo w Ustawieniach) albo prowadzi go **dyrygent** — każdy może
   kliknąć na telefonie „Zostań dyrygentem” i przełączać wersy. Narrator czyta następny wers z wyprzedzeniem.
6. Na końcu: wynik 0–100, gwiazdki, świeczki, „dB” i porównanie z rekordem grupy. **Złota księga** trzyma
   rekordy na zawsze.

Sterowanie na TV: `←/→` wers, `↑/↓` zwrotka, `spacja` pauza, `Esc` koniec i ocena, `F` pełny ekran
(działa też pilot/prezenter z `PageUp/PageDown`).

> Narrator potrzebuje polskiego głosu w przeglądarce — najlepiej Chrome lub Edge na Windows.

## Rozwój

Wymagany Node.js ≥ 22.13 i pnpm (`corepack enable`).

```sh
pnpm install
pnpm dev            # serwer :3000 + Vite :5173 (otwórz http://localhost:5173)
pnpm test           # testy jednostkowe i integracyjne serwera
pnpm build && pnpm exec playwright test   # e2e: TV + dwa telefony w Chromium
pnpm lint && pnpm typecheck && pnpm format:check
```

Telefon w tej samej sieci Wi-Fi może wejść na `http://<IP-komputera>:5173/j`. Uwaga: przeglądarki dają
dostęp do mikrofonu tylko na `localhost` albo po HTTPS.

Struktura:

| Katalog | Co jest w środku |
|---|---|
| `packages/shared` | schemat kolęd, liczenie sylab i czasów wersów, głosowanie, kolędometr, typy protokołu |
| `apps/server` | Fastify + Socket.IO: sesje wieczoru, głosowanie, dyrygent, rekordy w SQLite (`node:sqlite`) |
| `apps/web` | React: ekrany TV (`/`, `/tv/:id`) i telefonu (`/j/:kod`) |
| `content/songs` | teksty kolęd (JSON) |
| `content/images` | opcjonalne ilustracje kafelków (domyślnie rysowane w SVG) |
| `deploy` | Dockerfile, docker-compose, przykład Cloudflare Tunnel |

## Wdrożenie (Oracle Cloud + Cloudflare)

Aplikacja to jeden proces Node na jednym porcie (domyślnie `3000`), mówi zwykłym HTTP — HTTPS zapewnia
Cloudflare. Baza SQLite leży w wolumenie `/data`.

```sh
git clone https://github.com/imbirwmiodzie/kolednik.git && cd kolednik/deploy
KOLEDNIK_PORT=3000 docker compose up -d --build     # albo `docker compose pull`, gdy obraz jest w GHCR
curl http://127.0.0.1:3000/healthz
```

CI (`.github/workflows/ci.yml`) na gałęzi `main` buduje obraz `ghcr.io/imbirwmiodzie/kolednik` dla
`linux/arm64` (Ampere) i `linux/amd64`. Bez Dockera: `pnpm install && pnpm build && PORT=3000 DATA_DIR=./data pnpm start`.

Cloudflare — jedna z dwóch dróg:

- **Cloudflare Tunnel (zalecane):** `cloudflared` na serwerze, w Oracle Cloud nie trzeba otwierać żadnych
  portów. Przykład: [`deploy/cloudflared.example.yml`](deploy/cloudflared.example.yml) — usługa
  `http://127.0.0.1:3000`.
- **Rekord DNS z pomarańczową chmurką:** ustaw `KOLEDNIK_BIND=0.0.0.0`, otwórz port w *Security List*/NSG
  oraz w firewallu systemu (`iptables`/`firewalld`) — najlepiej tylko dla [adresów Cloudflare](https://www.cloudflare.com/ips/).
  Cloudflare łączy się z serwerem na standardowe porty, więc dla własnego portu dodaj **Origin Rule**
  z „Destination Port” dla `kolednik.505844.xyz`. Tryb SSL: *Flexible* (aplikacja mówi HTTP).

W obu przypadkach WebSockety muszą być włączone (Network → WebSockets, domyślnie są). Serwer wysyła ping co
25 s, więc Cloudflare nie zrywa bezczynnych połączeń z telefonami.

Kopia zapasowa rekordów: `docker compose exec kolednik sh -c 'cp /data/kolednik.sqlite /data/backup.sqlite'`
(albo `sqlite3 kolednik.sqlite ".backup backup.sqlite"` na hoście).

## Dodawanie kolęd

Plik `content/songs/<slug>.json` (slug = nazwa pliku):

```json
{
  "slug": "moja-koleda",
  "title": "Moja kolęda",
  "art": { "motif": "star", "hue": 220 },
  "bpm": 120,
  "stanzas": [
    { "type": "verse", "lines": [{ "text": "Pierwszy wers," }, { "text": "drugi wers.", "beats": 10 }] },
    { "type": "chorus", "ref": "refren" }
  ],
  "choruses": { "refren": { "lines": [{ "text": "Refren śpiewany po zwrotce" }] } }
}
```

- `bpm` ≈ liczba sylab na minutę. Czas wersu liczy się sam z liczby sylab; `beats` nadpisuje go dla jednego wersu.
- `motif`: `star`, `stable`, `angel`, `candle`, `tree`, `moon`, `crown`, `bells`; `hue` 0–360 to kolor nieba.
- Własny obrazek: wrzuć `content/images/moja-koleda.webp` i dodaj `"image": "moja-koleda.webp"`.
- `pnpm test` sprawdza wszystkie pliki — zły plik = czerwony test.

## Teksty do przejrzenia przed Wigilią ⚠️

Teksty zostały spisane z pamięci (bez dostępu do źródeł), z pominięciem zwrotek, których nie byłem pewny.
Przed świętami warto je porównać ze śpiewnikiem:

- **Wszystkie** — interpunkcja i drobne warianty (różne śpiewniki różnią się słowami).
- `w-zlobie-lezy` — 3. zwrotka, zwłaszcza wers „Naprzód tedy niech tak wszędy”.
- `przybiezeli-do-betlejem` — kolejność zwrotek; brakuje m.in. zwrotki o wole i ośle.
- `gdy-sie-chrystus-rodzi` — brakuje 5. zwrotki („A gdy pastuszkowie wszystko zrozumieli…”).
- `jezus-malusienki` — tylko 3 zwrotki, w śpiewnikach bywa ich więcej.
- `lulajze-jezuniu`, `pojdzmy-wszyscy-do-stajenki` — tradycyjnie mają więcej zwrotek niż tu.
- *Mizerna, cicha* — zastąpiona przez *W żłobie leży* (nie pamiętam pewnie dalszych zwrotek); do dodania.
