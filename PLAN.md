# Kolędnik — plan implementacji

Plan do [WYMAGANIA.md](WYMAGANIA.md) (wersja 0.4). Numery `F…`/`N…` odnoszą się do wymagań.

> **Stan:** etapy **M0–M6 (MVP) zrobione**, do tego wersja 0.5: samouczek, akordy z chwytami, podkład
> syntezowany z akordów (6 instrumentów, zmiana tonacji), konta z hasłem, klucz w linku QR, panel statystyk.
> M7 jest zrobiony inaczej niż w planie — podkład z akordów zamiast plików MIDI (bez melodii).
> Testy jednostkowe, integracyjne i e2e przechodzą.
> Do zrobienia przed świętami: wdrożenie na serwer i przegląd tekstów (patrz README). Dalej etap 2 (M7–M9).
>
> Odstępstwa od planu w implementacji:
> - SQLite przez wbudowany `node:sqlite` zamiast `better-sqlite3` — brak natywnych zależności, prostszy obraz ARM.
> - Pomiar dB przez `AnalyserNode` (co 50 ms) zamiast własnego AudioWorkletu — wystarcza do RMS.
> - Animacje w czystym CSS/canvas, bez Framer Motion; style w jednym `styles.css` ze zmiennymi motywów.
> - Serwer bundlowany esbuildem do jednego pliku — obraz bez `node_modules`.
> - *Mizerna, cicha* zastąpiona przez *W żłobie leży* (patrz README → teksty do przejrzenia).

---

## 1. Stos technologiczny

| Warstwa | Wybór | Dlaczego |
|---|---|---|
| Język | **TypeScript** wszędzie | wspólne typy protokołu TV ↔ serwer ↔ telefon |
| Monorepo | **pnpm workspaces** | jeden repo, trzy pakiety, wspólny lint/test |
| Frontend | **React + Vite** | szybki dev, jedna aplikacja z trasami TV i telefonu |
| Style / motywy | CSS Modules + **zmienne CSS** per motyw | motyw = zestaw zmiennych na `<html data-theme>` (F30–F31) |
| Animacje | CSS + **Framer Motion**, śnieg/fajerwerki na `<canvas>` | losowanie, ogłoszenie zwycięzcy, „NOWY REKORD” |
| Serwer | **Node.js 22 + Fastify** | serwuje zbudowany frontend, API REST, WebSockety |
| Czas rzeczywisty | **Socket.IO** | wbudowany heartbeat (Cloudflare zrywa po ~100 s bezczynności), auto-reconnect, pokoje = sesje (N7) |
| Baza | **SQLite** (`better-sqlite3`) | jeden plik na wolumenie, w zupełności wystarczy dla rekordów grup |
| Walidacja | **zod** | schemat plików kolęd i wiadomości protokołu |
| Audio — analiza | **Web Audio API + AudioWorklet** | RMS/dB i wykrywanie śpiewu lokalnie w przeglądarce (N4) |
| Narrator | **Web Speech API** `speechSynthesis` (głos `pl-PL`) | F26, bez kosztów i kluczy API |
| Podkład (etap 2) | **Tone.js + @tonejs/midi** + sample instrumentu (soundfont) | transpozycja = przesunięcie nut, tempo = zmiana BPM, bez utraty jakości (F22–F23) |
| QR | `qrcode` | kod dołączenia na TV (F9) |
| Testy | **Vitest** (unit/integracja), **Playwright** (e2e: TV + 2 telefony) | |
| Wdrożenie | **Docker** (obraz multi-arch, Oracle ARM) + Cloudflare | N5 |

## 2. Struktura repozytorium

```
kolednik/
├─ apps/
│  ├─ web/                    # React (TV + telefon)
│  │  └─ src/
│  │     ├─ tv/               # ekrany TV: start, biblioteka, głosowanie, śpiew, podsumowanie, rekordy
│  │     ├─ phone/            # ekrany telefonu: dołącz, głosuj, tekst, dyrygent
│  │     ├─ audio/            # mikrofon, worklet RMS/VAD, kalibracja, kolędometr
│  │     ├─ narrator/         # TTS i harmonogram podpowiedzi
│  │     ├─ lyrics/           # silnik przewijania (scheduler wersów)
│  │     ├─ accompaniment/    # etap 2: MIDI, transpozycja
│  │     ├─ themes/           # definicje motywów (zmienne CSS)
│  │     └─ net/              # klient Socket.IO, synchronizacja zegara
│  └─ server/
│     └─ src/
│        ├─ sessions/         # maszyna stanów sesji, pokoje, głosowanie, dyrygent
│        ├─ db/               # SQLite: migracje, repozytoria grup i wyników
│        ├─ songs/            # ładowanie i walidacja treści kolęd
│        └─ http/             # REST: kolędy, rekordy, healthcheck
├─ packages/
│  └─ shared/                 # typy, schematy zod, protokół, scoring, normalizacja nazw
├─ content/
│  ├─ songs/<slug>.json       # teksty kolęd
│  ├─ images/<slug>.webp      # ilustracje kafelków
│  └─ midi/<slug>.mid         # podkłady (etap 2)
├─ deploy/
│  ├─ Dockerfile
│  ├─ docker-compose.yml
│  └─ cloudflared.example.yml
└─ .github/workflows/ci.yml
```

Trasy frontendu:
- `/` — ekran startowy TV (wpisanie nazwy grupy → nowa sesja),
- `/tv/:sessionId` — ekran TV w trakcie sesji,
- `/j/:code` — dołączenie z telefonu (link z kodu QR), np. `https://kolednik.505844.xyz/j/KOLE`.

## 3. Model danych

### 3.1 Plik kolędy (`content/songs/<slug>.json`)

```json
{
  "slug": "wsrod-nocnej-ciszy",
  "title": "Wśród nocnej ciszy",
  "image": "wsrod-nocnej-ciszy.webp",
  "bpm": 84,
  "key": "F",
  "midi": "wsrod-nocnej-ciszy.mid",
  "stanzas": [
    {
      "type": "verse",
      "lines": [
        { "text": "Wśród nocnej ciszy głos się rozchodzi:", "beats": 8 },
        { "text": "Wstańcie, pasterze, Bóg się wam rodzi!", "beats": 8 }
      ]
    },
    { "type": "chorus", "ref": "refren-1" }
  ],
  "choruses": { "refren-1": { "lines": [ … ] } }
}
```

- `beats` opcjonalne — gdy brak, czas wersu szacuje się z **liczby sylab** (liczenie samogłosek w języku polskim) × średni czas sylaby wynikający z `bpm`. Dzięki temu nowe kolędy działają od razu, bez ręcznego taktowania; ręczne `beats` tylko tam, gdzie szacunek źle wychodzi.
- Refreny przez `ref`, żeby nie powtarzać tekstu, a jednak zawsze śpiewać wszystkie zwrotki (F16).
- Walidacja schematem zod przy starcie serwera i w teście CI (zły plik = czerwony build).

### 3.2 Baza SQLite

```sql
groups(id, name_norm UNIQUE, display_name, created_at)
sessions(id, group_id, code, started_at, ended_at)
performances(id, session_id, group_id, song_slug, score, avg_db, peak_db,
             coverage, key_shift, tempo, created_at)
song_settings(group_id, song_slug, key_shift, tempo, PRIMARY KEY(group_id, song_slug))
```

- `name_norm` = nazwa po `trim`, `toLocaleLowerCase('pl')`, zwinięciu spacji (F40).
- Rekord kolędy = `MAX(score)` z `performances` dla grupy i kolędy — niezależnie od tonacji/tempa (F37). Bez osobnej tabeli rekordów.
- „Zaśpiewane w tym wieczorze” = `performances` z bieżącej `session_id` (F6a).
- `song_settings` — zapamiętana tonacja/tempo per kolęda (F24, etap 2).

### 3.3 Stan sesji (w pamięci serwera)

```
LOBBY → VOTING → REVEAL → SINGING → SUMMARY → LOBBY …
           └──── RANDOM ────┘
```

```ts
type SessionState = {
  id: string; code: string; groupId: number; theme: ThemeId;
  phase: 'LOBBY' | 'VOTING' | 'RANDOM' | 'REVEAL' | 'SINGING' | 'SUMMARY';
  participants: Map<ClientId, { nick?: string; connected: boolean }>;
  sungSlugs: Set<string>;
  vote?: { endsAt: number; ballots: Map<ClientId, string> };
  song?: { slug: string; position: { stanza: number; line: number }; advanceMode: 'auto' | 'conductor' };
  conductorId?: ClientId;
};
```

Stan żyje w pamięci; po restarcie serwera TV odtwarza sesję z bazy (grupa, zaśpiewane kolędy), a telefony wracają same dzięki `clientId` w `localStorage`.

## 4. Protokół czasu rzeczywistego (Socket.IO)

Zasada: **serwer jest źródłem prawdy o fazie sesji, głosach i dyrygencie; TV jest źródłem prawdy o pozycji w tekście** (bo to TV ma mikrofon, zegar podkładu i scheduler). Pozycja idzie TV → serwer → telefony.

| Kierunek | Zdarzenie | Treść |
|---|---|---|
| TV → S | `session:create` | `{ groupName }` → `{ sessionId, code }` |
| TV → S | `session:resume` | `{ sessionId }` (odświeżenie strony TV) |
| tel → S | `participant:join` | `{ code, clientId, nick? }` |
| S → wszyscy | `session:state` | pełny stan (po dołączeniu / reconnect) |
| TV → S | `vote:start` | `{ durationSec }` |
| tel → S | `vote:cast` | `{ slug }` (zmiana głosu = ponowne wysłanie) |
| S → wszyscy | `vote:tally` | `{ counts, voters, total, endsAt }` (throttle 100 ms) |
| S → wszyscy | `vote:result` | `{ slug, viaTiebreak, candidates }` |
| TV → S | `random:start` | → `random:result { slug }` |
| TV → S | `song:start` | `{ slug, advanceMode }` |
| TV → S | `song:position` | `{ stanza, line, lineStartedAt }` |
| S → tel | `song:position` | j.w. (telefon wyróżnia wers i przewija) |
| tel → S | `conductor:claim` | → `conductor:changed { clientId, nick }` |
| tel → S | `conductor:next` / `conductor:prev` | → S → TV (tylko od aktualnego dyrygenta) |
| TV → S | `song:finish` | `{ slug, score, avgDb, peakDb, coverage, keyShift, tempo }` |
| S → wszyscy | `song:summary` | `{ …wynik, record: { previous, isNew } }` |
| TV → S | `theme:set` | `{ theme }` (telefony też zmieniają motyw) |

- Synchronizacja zegara: przy połączeniu klient wykonuje kilka `time:ping` i liczy przesunięcie względem serwera; `lineStartedAt` jest w czasie serwera, więc telefony animują postęp wersu zgodnie z TV (N3).
- Głosowanie: serwer sam zamyka rundę po `endsAt` lub gdy zagłosowali wszyscy połączeni (F13); remis albo brak głosów → losowanie spośród remisujących / wszystkich niezaśpiewanych (F8, F14).
- Każde zdarzenie walidowane zod po stronie serwera; nieuprawnione (np. `conductor:next` od nie-dyrygenta) ignorowane.

## 5. Kluczowe moduły klienta

### 5.1 Silnik tekstu (`lyrics/`)
- Rozwija kolędę do płaskiej listy wersów (zwrotki + refreny we właściwej kolejności).
- Liczy czas każdego wersu z `beats`/sylab i tempa.
- Trzy źródła „następnego wersu”, wybierane trybem (F18): **timer** (auto), **dyrygent** (zdarzenie z serwera), **klawiatura/pilot** (zawsze). W etapie 2 dochodzą **podkład** (zegar Tone.js) i **śledzenie śpiewu**.
- Emituje `position` → render TV, narrator, kolędometr, wysyłka na serwer.

### 5.2 Audio i kolędometr (`audio/`)
- `getUserMedia({ audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: true } })` — **AGC musi być wyłączone**, inaczej przeglądarka spłaszczy głośność i pomiar dB nie ma sensu.
- AudioWorklet liczy RMS w ramkach ~50 ms → dBFS.
- **Kalibracja** (F35): 3 s ciszy przed pierwszą kolędą → poziom tła `noiseDb`.
- Śpiew aktywny w ramce, gdy `dB > noiseDb + 8 dB` (z histerezą).
- Ramki, w których mówi narrator, są pomijane (F29).
- Wynik kolędy (0–100):
  - **50%** głośność: średni poziom ponad tło, przeskalowany 0–30 dB → 0–1,
  - **35%** pokrycie: odsetek wersów, w których śpiew był aktywny przez ≥ 40% czasu wersu,
  - **15%** energia: szczyt i stabilność (mało „dziur” w środku wersów).
- Prezentacja: dB (względne), gwiazdki 1–5, świeczki na choince, tytuł z progów („Cicha noc… aż za cicha” < 30, „Pasterze po kolacji” 30–60, … „Chór anielski” > 90).
- Logika scoringu w `packages/shared` → testy jednostkowe na nagranych/syntetycznych przebiegach.

### 5.3 Narrator (`narrator/`)
- Wybór głosu `pl-PL` (fallback: pierwszy dostępny + komunikat w ustawieniach).
- Harmonogram: na `lead` sekund przed końcem bieżącego wersu czyta następny wers albo jego pierwsze słowa (F28).
- Odblokowanie TTS i AudioContext przy pierwszym kliknięciu gospodarza (wymóg przeglądarek).
- W etapie 2 wyzwalaczem zamiast timera jest wykryty koniec frazy (spadek energii po aktywnym śpiewie).

### 5.4 Motywy (`themes/`)
- Każdy motyw = obiekt zmiennych CSS (`--bg`, `--text`, `--accent`, `--highlight`, `--card`…) + nazwa efektu tła (śnieg, światełka, świeca).
- Na start: **Klasyczny**, **Zimowa noc**, **Choinka**; potem **Szopka** i **Wysoki kontrast**.
- Wybór zapisany w `localStorage` TV i rozsyłany do telefonów (`theme:set`).

### 5.5 Ekrany
- **TV:** start (nazwa grupy) → lobby (QR, lista uczestników, kafelki) → głosowanie (wyniki na żywo, licznik czasu) / losowanie (animacja) → ogłoszenie → śpiew (bieżący + następny wers, wskaźnik dyrygenta, miernik dB) → podsumowanie (wynik, rekord) → lobby. Osobny widok „Złota księga”.
- **Telefon:** dołącz (ksywka opcjonalna) → głosowanie (lista niezaśpiewanych z wyszukiwarką) → tekst w trakcie śpiewu (powiększanie czcionki) + przycisk „Zostań dyrygentem” / duże „Następny wers” → podsumowanie.

## 6. Etapy realizacji

Każdy etap kończy się działającą wersją wdrożoną na `kolednik.505844.xyz`.

### M0 — Szkielet i wdrożenie (najpierw!)
- Monorepo pnpm, TypeScript, ESLint, Prettier, Vitest, CI (lint + typecheck + testy + build).
- Fastify serwuje stronę „Kolędnik wkrótce” + `/healthz` + echo Socket.IO.
- Dockerfile (multi-stage, `linux/arm64`), docker-compose z wolumenem na SQLite, `PORT` z env.
- Wdrożenie na Oracle Cloud za Cloudflare; **sprawdzenie, że WebSocket działa z telefonu przez Cloudflare** i przeżywa > 100 s bezczynności.
- *Gotowe, gdy:* telefon i PC widzą wzajemnie wysyłane wiadomości przez publiczny adres.

### M1 — Biblioteka i ekran śpiewania (TV, bez telefonów)
- Schemat kolędy + pierwsze 10 kolęd ze wszystkimi zwrotkami (teksty z domeny publicznej, sprawdzone z dwoma źródłami).
- Kafelki z ilustracjami (na start ilustracje SVG/gradienty w stylu motywu; docelowe obrazki do podmiany w `content/images`).
- Silnik tekstu: auto wg tempa + klawiatura; pauza, cofnij, następna zwrotka, zakończ (F19).
- Motywy: 3 pierwsze + efekt śniegu.
- *Gotowe, gdy:* da się zaśpiewać dowolną kolędę od początku do końca na TV.

### M2 — Sesja, telefony, dyrygent
- Nazwa grupy → sesja, kod QR, dołączanie z telefonu, lista uczestników na TV.
- Tekst na telefonie zsynchronizowany z TV (F20), synchronizacja zegara.
- Tryb dyrygenta: „Zostań dyrygentem”, „Następny/poprzedni wers”, wskaźnik na TV.
- Reconnect telefonu i odświeżenie TV bez utraty sesji (N7).
- *Gotowe, gdy:* test e2e Playwright: TV + 2 telefony, jeden przejmuje dyrygenta i prowadzi kolędę.

### M3 — Głosowanie i losowanie
- Głosowanie na wszystkie niezaśpiewane kolędy, wyniki na żywo, zamknięcie po czasie / gdy wszyscy zagłosowali.
- Losowanie z animacją, rozstrzyganie remisu i braku głosów.
- Oznaczanie zaśpiewanych kafelków, „wszystko zaśpiewane → nowa runda” (F8a).
- *Gotowe, gdy:* pełna pętla wieczoru: głosowanie → śpiew → głosowanie… działa z kilkoma telefonami.

### M4 — Kolędometr
- Dostęp do mikrofonu, kalibracja, worklet RMS, miernik na ekranie śpiewu.
- Scoring w `shared` + testy, ekran podsumowania z gwiazdkami/świeczkami/tytułem.
- *Gotowe, gdy:* głośniejszy śpiew daje wyraźnie wyższy wynik, cisza ≈ 0, wynik nie zależy od poziomu tła.

### M5 — Konto grupy i rekordy
- Tabele SQLite + migracje, zapis `performances`, porównanie z rekordem.
- Animacja „NOWY REKORD!” na TV i telefonach.
- Prosta „Złota księga”: rekordy kolęd grupy + historia wieczorów.
- *Gotowe, gdy:* po wpisaniu tej samej nazwy następnego dnia widać wczorajsze rekordy.

### M6 — Narrator TTS
- Głos `pl-PL`, harmonogram wyprzedzenia, ustawienia (wł./wył., głośność, wyprzedzenie, cały wers / początek).
- Maskowanie ramek mikrofonu podczas mowy narratora.
- *Gotowe, gdy:* narrator podpowiada każdy wers w porę i nie zawyża kolędometru.

**= MVP** (wszystko z sekcji 8 wymagań).

### Etap 2
- **M7 — Podkład MIDI:** odtwarzanie Tone.js, transpozycja ±6 półtonów, tempo, głośność, zapamiętane ustawienia per kolęda; przewijanie tekstu z zegara podkładu (F21–F25). Wymaga przygotowania plików MIDI z oznaczeniem początków wersów (markery/lyrics events w MIDI).
- **M8 — Śledzenie śpiewu:** VAD + dopasowanie tempa (przyspiesz/zwolnij scheduler wg wykrytych przerw między frazami); opcjonalnie Web Speech API jako korekta pozycji. Przy podkładzie — odróżnianie śpiewu od muzyki z głośników (znany sygnał podkładu).
- **M9 — Narrator reagujący na śpiew**, pełna Złota księga, własne kolędy (upload JSON), motywy Szopka i Wysoki kontrast.

## 7. Testy

- **Unit (Vitest):** liczenie sylab i czasów wersów, rozwijanie refrenów, logika głosowania i remisów, scoring, normalizacja nazw grup, walidacja wszystkich plików kolęd.
- **Integracja serwera:** Socket.IO z prawdziwymi klientami w teście — fazy sesji, uprawnienia dyrygenta, reconnect.
- **E2E (Playwright, Chromium):** jeden kontekst TV + kilka kontekstów telefonów (emulacja urządzeń mobilnych); mikrofon podmieniony na plik audio (`--use-file-for-fake-audio-capture`) do testu kolędometru.
- **Ręczny test przed świętami:** prawdziwy TV, 3–4 telefony (iOS + Android), sieć komórkowa i Wi-Fi.

## 8. Wdrożenie

- Obraz Docker budowany w CI (GitHub Actions, `linux/arm64` dla instancji Ampere) i publikowany w GHCR; na serwerze `docker compose pull && docker compose up -d`.
- Kontener nasłuchuje na `PORT` (domyślnie np. `8443`, gdy Cloudflare proxy przez DNS; dowolny, gdy Cloudflare Tunnel), plik SQLite na wolumenie + nocny backup (`sqlite3 .backup`).
- Cloudflare: subdomena `kolednik.505844.xyz`, WebSockets włączone, cache tylko dla statycznych plików z hashem w nazwie.
- `/healthz` do monitoringu (np. Cloudflare Health Check / UptimeRobot).

## 9. Ryzyka

| Ryzyko | Wpływ | Środek zaradczy |
|---|---|---|
| Brak polskiego głosu TTS w przeglądarce na PC | narrator nie działa | wykrywanie i komunikat; Chrome/Edge na Windows mają głos `pl-PL`; w razie potrzeby zewnętrzne TTS później |
| Mikrofon laptopa słabo zbiera grupę / głośniki zagłuszają | zaniżony wynik | kalibracja, AGC wył., zalecenie zewnętrznego mikrofonu; scoring względny |
| Cloudflare zrywa WebSockety | telefony „gubią” sesję | heartbeat Socket.IO, auto-reconnect, pełny `session:state` po powrocie; test w M0 |
| Błędy w tekstach kolęd | wstyd przy wigilijnym stole | dwa źródła na każdą kolędę, przegląd ręczny |
| Licencje obrazków i podkładów | problem prawny | tylko własne/CC0/wygenerowane ilustracje; melodie z domeny publicznej, MIDI tworzone samodzielnie |
| Śledzenie śpiewu niedokładne | tekst ucieka | etap 2, zawsze dostępny dyrygent i klawiatura jako zabezpieczenie |
