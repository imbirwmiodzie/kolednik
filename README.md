# ✦ Kolędnik

Karaoke do kolęd na święta. Telewizor (przeglądarka na PC) pokazuje kafelki kolęd i tekst, goście głosują
telefonami, narrator podpowiada następny wers, a kolędometr ocenia, jak głośno śpiewacie — i pilnuje rekordów.

- Wymagania: [WYMAGANIA.md](WYMAGANIA.md) · Plan i architektura: [PLAN.md](PLAN.md)
- Docelowy adres: **https://kolednik.505844.xyz**

## Jak się tym bawić

1. Na PC przy telewizorze otwórz stronę. Za pierwszym razem pojawi się **samouczek** (można go przerwać
   w każdej chwili przyciskiem „Pomiń” albo Esc; wraca pod „Jak to działa?”).
2. Wpisz **nazwę grupy i hasło** (np. „Rodzina Kowalskich”). Nowa nazwa zakłada konto z tym hasłem, istniejąca
   wymaga zgodnego hasła. Wybierz motyw, kliknij **Włącz mikrofon** i chwilę bądźcie cicho (pomiar szumu).
3. Goście skanują kod QR z telewizora — link zawiera tajny klucz tego wieczoru (albo wchodzą na `/j`
   i wpisują 6-literowy kod z ekranu).
4. **Głosujemy** — telefony pokazują wszystkie jeszcze niezaśpiewane kolędy, wyniki lecą na żywo na TV.
   Remis albo brak głosów rozstrzyga ruletka. Jest też **Losuj** i klik w kafelek.
5. Śpiewacie: tekst przewija się sam (tempo w Ustawieniach) albo prowadzi go **dyrygent** — każdy może
   kliknąć na telefonie „Zostań dyrygentem” i przełączać wersy. Narrator czyta następny wers z wyprzedzeniem.
6. Na końcu: wynik 0–100, gwiazdki, świeczki, „dB” i porównanie z rekordem grupy. **Złota księga** trzyma
   rekordy na zawsze.

Sterowanie na TV: `←/→` wers, `↑/↓` zwrotka, `spacja` pauza, `Esc` koniec i ocena, `F` pełny ekran
(działa też pilot/prezenter z `PageUp/PageDown`).

> Narrator potrzebuje polskiego głosu w przeglądarce — najlepiej Chrome lub Edge na Windows.

### Akordy i podkład

- **Nuty z prawdziwych partytur.** 11 kolęd ma melodię z zapisu nutowego z Wikipedii (`<score>` w LilyPond,
  licencja CC BY-SA). Każda sylaba tekstu ma swoje nuty, więc wers trwa tyle, ile w nutach, a akordy zmieniają
  się dokładnie nad tą sylabą, na którą wypada zmiana. Na TV aktualny wers podświetla się sylaba po sylabie (karaoke).
- **Akordy na gitarę** (Ustawienia → Akordy): nazwy nad sylabami i diagramy chwytów obok. Na telefonie każdy włącza
  je sam przyciskiem 🎸. Akordy dobiera program do melodii (takt po takcie, z kadencjami D → T), a kolęda jest
  przeniesiona do tonacji z łatwymi chwytami. To harmonizacja automatyczna — prosta, ale zgodna z melodią.
- **Podkład** (Ustawienia → Zaawansowane): nagrane instrumenty (próbki *Musyng Kite*, CC BY-SA 3.0) — fortepian,
  gitary, organy, smyczki, chór, flet, harfa, czelesta, pozytywka, dzwony, dzwonki i kontrabas. Można łączyć kilka
  naraz, wybrać instrument prowadzący melodię albo gotowy zestaw („Przy kominku”, „Kolędnicy”, „Kościół”…).
  Tonację zmieniacie w trakcie kolędy przyciskami ♭/♯ (±6 półtonów); zapamiętuje się dla każdej kolędy.
- Podkład z głośników słychać w mikrofonie, więc kolędometr może wtedy zawyżać wynik.
- *Pójdźmy wszyscy do stajenki* nie ma jeszcze nut (brak partytury w źródłach) — śpiewa się ją bez akordów i podkładu.

#### Import nut (dla opiekunów)

`pnpm import:music <katalog z artykułami .wiki>` — dla kolęd z mapy `SOURCES` w `tools/import/import.ts` czyta
partyturę, dzieli tekst z `content/songs/<slug>.json` na sylaby, dopasowuje je do nut (z powtórzeniami i melizmatami),
harmonizuje i zapisuje pole `music` w pliku kolędy. Plik kolędy musi mieć tekst bez nut (pierwszy import).

### Bezpieczeństwo

- Konto grupy = nazwa + hasło; hasła trzymane jako skrót **scrypt** (z solą), nigdy jawnie.
- Po 8 złych hasłach dla grupy (albo 30 z jednego adresu) logowanie jest blokowane na 15 minut.
- Link w kodzie QR ma losowy klucz 144-bitowy po `#`, więc nie trafia do logów serwera ani Cloudflare; telefon
  usuwa go z paska adresu po dołączeniu. Kod do ręcznego wpisania ma 6 liter (~113 mln kombinacji), a po
  20 błędnych próbach z jednego adresu wpisywanie jest blokowane na 10 minut.
- **Nowy kod i link** (Ustawienia) unieważnia stary — dołączeni goście zostają. Kod i klucz zna tylko TV.
- Telefon po zerwaniu połączenia wraca jako znany uczestnik (losowy identyfikator w pamięci telefonu).

### Panel statystyk `/admin`

Osobna strona z logowaniem: na żywo (wieczory, telewizory, telefony online), sumy, wykresy z 30 dni, najczęściej
śpiewane kolędy, grupy i **dziennik zdarzeń** (nowe konta, wieczory, dołączenia, głosowania, kolędy, złe hasła,
blokady…). Adresy IP zapisywane są bez ostatniego członu (np. `83.12.44.x`); dziennik trzymany jest pół roku.
Zdarzenia lecą też na standardowe wyjście serwera (`docker compose logs`).

Login i hasło ustawiają zmienne `ADMIN_USER` / `ADMIN_PASSWORD` (lokalnie domyślnie `lama` / `bezdomna`;
w Dockerze hasło trzeba podać w `deploy/.env` — wzór w `deploy/.env.example`).

## Test na własnym Macu lub Ubuntu (localhost)

Potrzebny tylko **Node.js 22.13+** (`brew install node` albo instalator LTS z https://nodejs.org).
Na Ubuntu `apt` ma za starego Node'a (18) — zainstaluj 22 z NodeSource:

```bash
sudo apt remove -y nodejs libnode-dev npm
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

(albo bez sudo przez nvm: `nvm install 22`). Skrypt `./kolednik-mac.command` działa tak samo na Linuksie.

```sh
git clone https://github.com/imbirwmiodzie/kolednik.git
cd kolednik
git checkout claude/zealous-turing-1s05ac   # dopóki zmiany nie są w main
./kolednik-mac.command                      # albo dwuklik w Finderze
```

Skrypt sam instaluje zależności, buduje aplikację (tylko gdy coś się zmieniło), startuje serwer na porcie
3000 i otwiera Chrome na `http://localhost:3000`. Inny port: `PORT=4000 ./kolednik-mac.command`.
Zatrzymanie: `Ctrl+C`. Rekordy lądują w katalogu `data/` (usuń go, żeby zacząć od zera).

- **Telefony** w tym samym Wi-Fi: zeskanujcie kod QR — na localhost kod sam wskazuje adres Maca w sieci
  (np. `http://192.168.1.23:3000/j/ABCD`). Przy pierwszym starcie macOS zapyta, czy pozwolić `node` na
  połączenia przychodzące — kliknij **Pozwól**.
- **Bez telefonów:** otwórz kilka kart `http://localhost:3000/j?gosc=1`, `?gosc=2`, … — każda karta to
  osobny gość (głosowanie, dyrygent).
- **Mikrofon:** Chrome zapyta o zgodę; jeśli nie zapyta, sprawdź *Ustawienia systemowe → Prywatność
  i ochrona → Mikrofon → Google Chrome*.
- **Narrator:** Chrome na Macu ma głos „Google polski”. W Safari używany jest systemowy głos „Zosia” —
  gdy go brak, pobierz go w *Ustawienia systemowe → Dostępność → Treść mówiona → Głos systemowy*.
- Telewizor przez HDMI/AirPlay: przeciągnij okno na ekran TV i naciśnij `F` (pełny ekran).

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
cp .env.example .env    # i ustaw własne ADMIN_PASSWORD
docker compose up -d --build     # albo `docker compose pull`, gdy obraz jest w GHCR
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

- `bpm` ≈ liczba sylab na minutę (w kolędach z nutami: ćwierćnuty na minutę). Czas wersu liczy się sam z liczby sylab albo z nut; `beats` nadpisuje go dla jednego wersu.
- `motif`: `star`, `stable`, `angel`, `candle`, `tree`, `moon`, `crown`, `bells`; `hue` 0–360 to kolor nieba.
- Własny obrazek: wrzuć `content/images/moja-koleda.webp` i dodaj `"image": "moja-koleda.webp"`.
- `pnpm test` sprawdza wszystkie pliki — zły plik = czerwony test.

## Teksty do przejrzenia przed Wigilią ⚠️

Teksty zostały spisane z pamięci (bez dostępu do źródeł), z pominięciem zwrotek, których nie byłem pewny.
Przed świętami warto je porównać ze śpiewnikiem:

- **Wszystkie** — interpunkcja i drobne warianty (różne śpiewniki różnią się słowami).
- **Akordy** — dobrane automatycznie do melodii z nut; warto zagrać na gitarze i poprawić, gdzie brzmi płasko.
- `gdy-sliczna-panna`, `aniol-pasterzom-mowil` — teksty z *Kantyczek* (1904, 1943) z Wikiźródeł, pisownia uwspółcześniona.
- `w-zlobie-lezy` — 3. zwrotka, zwłaszcza wers „Naprzód tedy niech tak wszędy”.
- `przybiezeli-do-betlejem` — kolejność zwrotek; brakuje m.in. zwrotki o wole i ośle.
- `gdy-sie-chrystus-rodzi` — brakuje 5. zwrotki („A gdy pastuszkowie wszystko zrozumieli…”).
- `jezus-malusienki` — tylko 3 zwrotki, w śpiewnikach bywa ich więcej.
- `lulajze-jezuniu`, `pojdzmy-wszyscy-do-stajenki` — tradycyjnie mają więcej zwrotek niż tu.
- *Mizerna, cicha* — zastąpiona przez *W żłobie leży* (nie pamiętam pewnie dalszych zwrotek); do dodania.
