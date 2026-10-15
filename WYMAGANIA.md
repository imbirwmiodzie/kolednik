# Kolędnik — wymagania

Aplikacja „karaoke do kolęd” na spotkania świąteczne. Uruchamiana na PC podłączonym do telewizora, uczestnicy biorą udział przez swoje smartfony.

Status: **szkic wymagań** (wersja 0.5 — samouczek, akordy, podkład, hasła, bezpieczny QR, statystyki). Implementacja jeszcze nie rozpoczęta.

---

## 1. Kontekst i założenia

- **Ekran główny (TV):** przeglądarka na PC podłączonym do telewizora, tryb pełnoekranowy, czytelność z kanapy (3–4 m od ekranu).
- **Uczestnicy:** 2–20 osób w jednym pomieszczeniu, każdy z własnym smartfonem.
- **Aplikacja webowa hostowana w internecie:** brak instalacji — TV otwiera stronę w przeglądarce, telefony dołączają przez kod QR / krótki link. Wymagany dostęp do internetu na PC i telefonach.
- **Mikrofon:** wbudowany w laptopa albo zewnętrzny, podłączony do PC przy TV.
- **Język:** interfejs i kolędy po polsku (możliwość dodania innych języków później).

## 2. Role

| Rola | Urządzenie | Co robi |
|---|---|---|
| **Gospodarz** | PC + TV | uruchamia sesję, wybiera motyw, steruje odtwarzaniem, włącza podkład i ustawia tonację, uruchamia głosowanie lub losowanie |
| **Uczestnik** | smartfon | dołącza do sesji, głosuje na następną kolędę, widzi tekst kolędy zsynchronizowany z TV |
| **Dyrygent** | smartfon | dowolny uczestnik, który przejął rolę; przełącza wersy z telefonu (gdy tekst nie jest przewijany automatycznie) |

## 3. Wymagania funkcjonalne

### 3.1 Biblioteka kolęd (ekran startowy)
- **F1.** Domyślny widok to siatka **kafelków**: tytuł kolędy + ładna, świąteczna ilustracja.
- **F2.** Kliknięcie kafelka uruchamia kolędę.
- **F3.** Każda kolęda ma: tytuł, **pełny tekst ze wszystkimi zwrotkami** podzielony na wersy, (opcjonalnie) refren, ilustrację, przybliżone tempo / czasy wersów, tonację oryginalną oraz (opcjonalnie) podkład muzyczny.
- **F4.** Startowy zestaw najpopularniejszych polskich kolęd z tekstami w domenie publicznej (np. *Wśród nocnej ciszy*, *Bóg się rodzi*, *Lulajże, Jezuniu*, *Cicha noc*, *Przybieżeli do Betlejem*, *Dzisiaj w Betlejem*, *Pójdźmy wszyscy do stajenki*, *Gdy się Chrystus rodzi*, *Mizerna, cicha*, *Jezus malusieńki*).
- **F5.** Możliwość dodawania własnych kolęd (format pliku do ustalenia — np. JSON/Markdown).
- **F5a.** Kafelki kolęd już zaśpiewanych w bieżącej sesji są oznaczone (np. przygaszone z ikoną ✓).

### 3.2 Wybór następnej kolędy: głosowanie i losowanie
- **F6.** Domyślnym sposobem wyboru jest **głosowanie na wszystkie kolędy**, które **nie zostały jeszcze zaśpiewane** w tej sesji.
- **F6a.** **Sesja = jeden wieczór.** Lista zaśpiewanych kolęd jest liczona w obrębie sesji; nowa sesja (nowy wieczór) zaczyna z pustą listą.
- **F7.** Dostępny jest też tryb **„Losuj”** — animowane losowanie (np. kręcące się kafelki, koło fortuny, bombki) spośród kolęd jeszcze nie zaśpiewanych.
- **F8.** Losowanie jest używane również automatycznie: przy remisie w głosowaniu (losowanie spośród remisujących) oraz gdy nikt nie zagłosował.
- **F8a.** Gdy wszystkie kolędy zostały zaśpiewane, aplikacja to ogłasza i proponuje nową rundę (wyzerowanie listy zaśpiewanych).

### 3.3 Głosowanie ze smartfonów
- **F9.** Na TV wyświetla się **kod QR** + krótki kod sesji; zeskanowanie otwiera stronę dołączenia na telefonie (bez logowania).
- **F10.** Gospodarz otwiera głosowanie: telefony pokazują listę wszystkich niezaśpiewanych kolęd (kafelki / lista z wyszukiwaniem).
- **F11.** Jeden uczestnik = jeden głos na rundę (możliwość zmiany głosu do zamknięcia rundy).
- **F12.** Wyniki **na żywo** na TV (paski / licznik dla kolęd, które dostały głosy), opóźnienie od kliknięcia do pojawienia się na TV **< 1 s**.
- **F13.** Głosowanie kończy się po czasie (np. 15–30 s, konfigurowalne) albo gdy zagłosują wszyscy; zwycięzca jest efektownie ogłaszany na TV.
- **F14.** Remis rozstrzyga losowanie (F8).

### 3.4 Wyświetlanie tekstu i śledzenie śpiewu
- **F15.** Tekst wyświetlany dużą czcionką, aktualny wers wyróżniony, kolejny wers widoczny pod spodem (podgląd).
- **F16.** Domyślnie śpiewane są **absolutnie wszystkie zwrotki** kolędy.
- **F17.** Aplikacja **nasłuchuje przez mikrofon** i na tej podstawie **przewija tekst** do aktualnie śpiewanego miejsca.
- **F18.** **Tryby przechodzenia do następnego wersu** (wybiera gospodarz, można zmienić w trakcie kolędy):
  - **automatyczny** — wg śledzenia śpiewu, zapisanego tempa lub podkładu,
  - **z telefonu** — wersy przełącza **dyrygent** dużym przyciskiem „następny wers” na telefonie; **każdy uczestnik może przejąć rolę dyrygenta** jednym kliknięciem („Zostań dyrygentem”), na TV widać, kto aktualnie dyryguje; w danej chwili dyrygent jest jeden,
  - zawsze dostępne jest ręczne sterowanie z PC (strzałki / pilot).
- **F19.** Możliwość zatrzymania, cofnięcia o wers, przejścia do następnej zwrotki, zakończenia kolędy.
- **F20.** **Tekst na telefonach:** w trakcie kolędy telefon uczestnika pokazuje tekst zsynchronizowany z TV (wyróżniony bieżący wers, auto-przewijanie), z możliwością powiększenia czcionki.

### 3.5 Podkład muzyczny i tonacja
- **F21.** **Podkład muzyczny jest opcjonalny** — gospodarz może go włączyć lub śpiewać a cappella (ustawienie globalne i/lub per kolęda).
- **F22.** **Regulacja tonacji:** zmiana tonacji podkładu w półtonach (np. od −6 do +6), z podglądem aktualnej tonacji (np. „F-dur → D-dur”).
- **F23.** Regulacja tempa podkładu (wolniej/szybciej), regulacja głośności podkładu niezależnie od narratora.
- **F24.** Ustawiona tonacja/tempo zapamiętywane dla danej kolędy (żeby kolejnym razem grało tak samo).
- **F25.** Gdy podkład gra, przewijanie tekstu jest zsynchronizowane z podkładem (śledzenie śpiewu służy wtedy głównie do oceny).

### 3.6 Narrator (podpowiadacz)
- **F26.** Narrator — **głos syntetyczny** (TTS) — **czyta kolejny wers z wyprzedzeniem**, zanim uczestnicy zaczną go śpiewać (jak „suflerka” w chórze).
- **F27.** Narrator reaguje na postęp śpiewu: po usłyszeniu (rozpoznaniu) końcówki bieżącego wersu podpowiada następny.
- **F28.** Konfigurowalne: włącz/wyłącz, głośność, wyprzedzenie (ile przed końcem wersu), co czytać (cały wers / początek wersu / tylko pierwsze słowa zwrotki).
- **F29.** Głos narratora i podkład nie mogą być mylone przez aplikację ze śpiewem uczestników (np. wyciszanie analizy mikrofonu na czas podpowiedzi, kasowanie echa, odejmowanie znanego sygnału podkładu).

### 3.7 Motywy kolorystyczne
- **F30.** Kilka gotowych wersji kolorystycznych do wyboru, np.:
  - **Klasyczny** — czerwień i złoto,
  - **Zimowa noc** — granat, srebro, płatki śniegu,
  - **Choinka** — zieleń i ciepłe światełka,
  - **Szopka** — ciepłe brązy, beże, światło świecy,
  - **Wysoki kontrast** — dla lepszej czytelności.
- **F31.** Motyw zmienia tło, kolory tekstu, wyróżnienia i animacje (np. padający śnieg) na TV i na telefonach; wybór zapamiętywany między uruchomieniami.

### 3.8 Ocena zaangażowania („Kolędometr”)
- **F32.** Przez cały czas trwania kolędy aplikacja mierzy głośność/energię śpiewu z mikrofonu.
- **F33.** Ocena dotyczy **całej grupy** (brak wyników indywidualnych).
- **F34.** Na końcu kolędy wyświetla się efektowne podsumowanie, np.:
  - średni i szczytowy poziom w **dB** (względnych, skalibrowanych),
  - „procent zaśpiewanego tekstu” (jak dużą część wersów było słychać śpiew),
  - wynik końcowy w fancy formie: termometr, liczba zapalonych świeczek na choince, „gwiazdki betlejemskie” 1–5, tytuł („Chór anielski”, „Pasterze po kolacji”, „Cicha noc… aż za cicha”).
- **F35.** Kalibracja przed startem: krótki pomiar ciszy w pokoju (poziom tła), żeby wynik nie zależał od mikrofonu.

### 3.9 Rekordy i historia
- **F36.** Wyniki są **zapisywane na serwerze** i dostępne między sesjami — „bijemy rekordy”.
- **F37.** Dla każdej kolędy przechowywany jest **rekord grupy** (najlepszy wynik + data); na koniec kolędy pokazywane jest porównanie z rekordem. Zmiana tonacji/tempa **nie** tworzy osobnego rekordu — liczy się do tego samego.
- **F38.** Pobicie rekordu = specjalna animacja na TV i telefonach („NOWY REKORD!” — fajerwerki, dzwonki).
- **F39.** Tabela rekordów / „Złota księga” — ranking kolęd wg najlepszego wyniku, historia sesji (data, zaśpiewane kolędy, wyniki).
- **F40.** **Bez logowania:** gospodarz przy starcie wpisuje imię / nazwę (np. „Rodzina Kowalskich”) — ta nazwa jest „kontem” grupy, pod którym zapisują się rekordy i historia. Wpisanie tej samej nazwy kolejnym razem wczytuje dotychczasowe rekordy. Nazwa porównywana bez względu na wielkość liter i spacje na końcach.
- **F41.** Rekordy i historia są widoczne **tylko dla własnej grupy** (brak publicznego rankingu).
- **F42.** Uczestnicy dołączający z telefonu nie zakładają konta — opcjonalnie podają ksywkę (np. do wyboru dyrygenta).

### 3.10 Dodane w wersji 0.5
- **F43. Samouczek** przy pierwszym otwarciu, w formie kreatora krok po kroku; można go przerwać w każdej chwili
  i otworzyć ponownie.
- **F44. Podkład muzyczny z różnymi instrumentami** (pianino, gitara, organy, smyczki, pozytywka, dzwonki) —
  wybór instrumentu tylko w ustawieniach zaawansowanych.
- **F45. Akordy na gitarę** — opcjonalnie, nad tekstem i jako diagramy chwytów; przesuwają się ze zmianą tonacji.
- **F46. Konto grupy z hasłem** — nowa grupa podaje nazwę i hasło; istniejąca loguje się tym hasłem (zastępuje F40).
- **F47. Link w kodzie QR zabezpieczony** losowym kluczem wieczoru danej rodziny; możliwość wygenerowania nowego.
- **F48. Statystyki i dziennik zdarzeń** na serwerze, na osobnej stronie z loginem i hasłem.
- **F49. Nuty z prawdziwych partytur** — melodia i rytm wersów z zapisu nutowego; akordy zmieniają się nad właściwą
  sylabą; podkład gra melodię i akompaniament nagranymi instrumentami, które można łączyć.

## 4. Wymagania niefunkcjonalne

- **N1. Czytelność na TV:** duże fonty, wysoki kontrast, układ 16:9, brak drobnych elementów sterujących na ekranie śpiewania.
- **N2. Telefony:** strona uczestnika działa w mobilnym Safari i Chrome, bez instalacji; widok głosowania i widok tekstu czytelne w pionie.
- **N3. Opóźnienia:** głos → TV < 1 s; synchronizacja tekstu TV ↔ telefony < 0,5 s; przewijanie płynne (bez skoków).
- **N4. Prywatność:** dźwięk z mikrofonu analizowany lokalnie w przeglądarce, **nie jest nagrywany ani wysyłany** na serwer — na serwer trafiają tylko wyniki liczbowe.
- **N5. Hosting:** adres **https://kolednik.505844.xyz**, serwer własny na **Oracle Cloud**, ruch przez **reverse proxy Cloudflare**. HTTPS wymagany (m.in. do dostępu do mikrofonu i połączeń WebSocket z telefonów); serwer obsługuje wiele równoległych sesji różnych grup.
- **N6. Prostota startu:** od otwarcia strony do pierwszej kolędy — maks. kilka kliknięć.
- **N8. Bezpieczeństwo:** hasła jako skrót scrypt, limity nieudanych prób (hasło, kod, panel), tajny klucz w linku QR,
  ciasteczko panelu HttpOnly + SameSite, IP w logach maskowane.
- **N7. Odporność na zerwanie połączenia:** telefon, który stracił połączenie, automatycznie wraca do sesji; chwilowy brak internetu nie przerywa śpiewania na TV.

## 5. Uwagi techniczne (wstępne, do decyzji)

- **Architektura:** frontend (ekran TV + widok telefonu) + serwer z **WebSocketami** do sesji, głosowania i synchronizacji tekstu (np. Node.js) + baza danych na rekordy i historię (wystarczy SQLite).
- **Wdrożenie:** aplikacja na VM w Oracle Cloud nasłuchuje na **własnym porcie** (konfigurowalny przez zmienną środowiskową `PORT`), opcjonalnie w kontenerze Docker. Przed nią **Cloudflare** jako reverse proxy dla subdomeny `kolednik.505844.xyz` — TLS/HTTPS załatwia Cloudflare.
  - Jeśli to **Cloudflare Tunnel** (`cloudflared`): port może być dowolny i nie trzeba otwierać portów w Oracle Cloud.
  - Jeśli to zwykły rekord DNS z „pomarańczową chmurką”: Cloudflare przekazuje ruch tylko na określone porty (np. 443, 8443, 2053, 2083, 2087, 2096 dla HTTPS) — port aplikacji trzeba dobrać z tej listy i otworzyć go w *Security List* / NSG oraz w firewallu systemu.
  - **WebSockety** przez Cloudflare działają, ale bezczynne połączenie jest zrywane po ok. 100 s — aplikacja musi wysyłać heartbeat (ping) i automatycznie się łączyć ponownie (patrz N7).
- **Bezpieczeństwo „konta” bez logowania:** kto zna nazwę grupy, widzi i dopisuje jej rekordy — przy domowym użyciu akceptowalne; w razie potrzeby później można dodać opcjonalny PIN.
- **Podkład i tonacja:** najprościej podkłady jako **MIDI** (lub inny zapis nutowy) odtwarzane syntezatorem w przeglądarce — zmiana tonacji i tempa jest wtedy bezstratna i trywialna, a melodie kolęd są w domenie publicznej. Alternatywa: nagrania audio + pitch-shifting (gorsza jakość przy dużych zmianach, trudniejsze licencyjnie).
- **Śledzenie śpiewu:** rozpoznawanie mowy (Web Speech API) słabo radzi sobie ze śpiewem grupowym. Realistyczne podejście hybrydowe:
  1. tekst z przybliżonymi czasami wersów (jak pliki LRC) lub synchronizacja z podkładem,
  2. wykrywanie aktywności głosu (VAD) i przerw między wersami z Web Audio API, żeby dopasować tempo,
  3. opcjonalnie rozpoznawanie słów jako dodatkowa korekta pozycji.
- **Narrator:** synteza mowy w przeglądarce (Web Speech API `speechSynthesis`, polski głos); w przyszłości ewentualnie zewnętrzne TTS dla lepszej jakości.
- **Decybele:** pomiar RMS z Web Audio API → poziom w dB względem kalibracji ciszy; przeglądarka nie zna bezwzględnego SPL, więc „dB” są umowne. Przy włączonym podkładzie trzeba odróżnić śpiew od muzyki z głośników.
- **Ilustracje:** własne / generowane / z licencją pozwalającą na użycie; teksty i melodie kolęd tylko z domeny publicznej.

## 6. Decyzje (z odpowiedzi)

| # | Pytanie | Decyzja |
|---|---|---|
| 1 | Podkład muzyczny? | Opcjonalny + regulacja tonacji |
| 2 | Tekst na telefonie? | Tak |
| 3 | Serwer lokalny czy w internecie? | Serwer w internecie |
| 4 | Na co głosujemy? | Na wszystkie kolędy, poza już zaśpiewanymi |
| 5 | Ile zwrotek? | Absolutnie wszystkie |
| 6 | Zapis wyników? | Tak — rekordy między sesjami |
| 7 | Wynik indywidualny czy grupowy? | Tylko grupowy |
| 8 | Głos narratora? | Na razie syntetyczny |
| 9 | Identyfikacja grupy? | Bez logowania — wpisane imię/nazwa = konto |
| 10 | Rekordy publiczne? | Nie — tylko własna grupa |
| 11 | Zmieniona tonacja/tempo a rekord? | Ten sam rekord |
| 12 | Kto przełącza wersy? | Automatycznie (opcja) albo dyrygent z telefonu |
| 13 | Zakres listy zaśpiewanych? | Jeden wieczór (sesja) |
| 14 | Hosting? | 505844.xyz, własny serwer na Oracle Cloud |
| 15 | Adres aplikacji? | kolednik.505844.xyz |
| 16 | Proxy / port? | Aplikacja na własnym porcie, reverse proxy przez Cloudflare |
| 17 | Kto może zostać dyrygentem? | Każdy uczestnik |

## 7. Otwarte pytania

Brak — wymagania gotowe do zaplanowania implementacji.

## 8. Proponowany zakres MVP

1. Kafelki kolęd + ekran śpiewania z wyróżnionym wersem, wszystkie zwrotki; przewijanie automatyczne wg tempa albo przez dyrygenta z telefonu (każdy może przejąć rolę).
2. Głosowanie z telefonów przez QR na niezaśpiewane kolędy + wyniki na żywo; losowanie (tryb ręczny i przy remisie).
3. Tekst kolędy zsynchronizowany na telefonach.
4. 2–3 motywy kolorystyczne.
5. Kolędometr (głośność w dB + wynik w formie gwiazdek/świeczek) dla całej grupy.
6. „Konto” grupy przez wpisanie nazwy, zapis rekordów na serwerze + animacja „nowy rekord”.
7. Wdrożenie na Oracle Cloud pod kolednik.505844.xyz (własny port, reverse proxy Cloudflare).
8. Narrator TTS czytający kolejny wers wg czasu.

Etap 2: podkład muzyczny (MIDI) z regulacją tonacji i tempa, śledzenie śpiewu z mikrofonu, narrator reagujący na śpiew, Złota księga / historia sesji, własne kolędy.
