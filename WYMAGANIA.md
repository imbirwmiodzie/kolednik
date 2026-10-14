# Kolędnik — wymagania

Aplikacja „karaoke do kolęd” na spotkania świąteczne. Uruchamiana na PC podłączonym do telewizora, uczestnicy biorą udział przez swoje smartfony.

Status: **szkic wymagań** (wersja 0.1). Implementacja jeszcze nie rozpoczęta.

---

## 1. Kontekst i założenia

- **Ekran główny (TV):** przeglądarka na PC podłączonym do telewizora, tryb pełnoekranowy, czytelność z kanapy (3–4 m od ekranu).
- **Uczestnicy:** 2–20 osób w jednym pomieszczeniu, każdy z własnym smartfonem.
- **Aplikacja webowa:** brak instalacji — TV otwiera stronę w przeglądarce, telefony dołączają przez kod QR / krótki link.
- **Mikrofon:** wbudowany w laptopa albo zewnętrzny, podłączony do PC przy TV.
- **Język:** interfejs i kolędy po polsku (możliwość dodania innych języków później).

## 2. Role

| Rola | Urządzenie | Co robi |
|---|---|---|
| **Gospodarz** | PC + TV | uruchamia sesję, wybiera motyw, steruje odtwarzaniem, może pominąć głosowanie |
| **Uczestnik** | smartfon | dołącza do sesji, głosuje na następną kolędę, widzi aktualny tekst (opcjonalnie) |

## 3. Wymagania funkcjonalne

### 3.1 Biblioteka kolęd (ekran startowy)
- **F1.** Domyślny widok to siatka **kafelków**: tytuł kolędy + ładna, świąteczna ilustracja.
- **F2.** Kliknięcie kafelka uruchamia kolędę.
- **F3.** Każda kolęda ma: tytuł, tekst podzielony na zwrotki i wersy, (opcjonalnie) refren, ilustrację, przybliżone tempo / czasy wersów.
- **F4.** Startowy zestaw najpopularniejszych polskich kolęd z tekstami w domenie publicznej (np. *Wśród nocnej ciszy*, *Bóg się rodzi*, *Lulajże, Jezuniu*, *Cicha noc*, *Przybieżeli do Betlejem*, *Dzisiaj w Betlejem*, *Pójdźmy wszyscy do stajenki*, *Gdy się Chrystus rodzi*, *Mizerna, cicha*, *Jezus malusieńki*).
- **F5.** Możliwość dodawania własnych kolęd (format pliku do ustalenia — np. JSON/Markdown).

### 3.2 Losowanie następnej kolędy
- **F6.** Przycisk / tryb **„Losuj”** — animowane losowanie (np. kręcące się kafelki, koło fortuny, bombki).
- **F7.** Losowanie pomija kolędy już zaśpiewane w tej sesji (do wyczerpania puli).
- **F8.** Losowanie może wybrać kilku kandydatów (np. 3–4), na których następnie głosują uczestnicy (patrz 3.3).

### 3.3 Głosowanie ze smartfonów
- **F9.** Na TV wyświetla się **kod QR** + krótki kod sesji; zeskanowanie otwiera stronę dołączenia na telefonie (bez logowania, opcjonalnie imię/ksywka).
- **F10.** Gospodarz otwiera głosowanie: telefony pokazują listę kandydatów (wylosowanych lub wszystkich dostępnych).
- **F11.** Jeden uczestnik = jeden głos na rundę (możliwość zmiany głosu do zamknięcia rundy).
- **F12.** Wyniki **na żywo** na TV (paski / licznik), opóźnienie od kliknięcia do pojawienia się na TV **< 1 s**.
- **F13.** Głosowanie kończy się po czasie (np. 15–30 s, konfigurowalne) albo gdy zagłosują wszyscy; zwycięzca jest efektownie ogłaszany na TV.
- **F14.** Remis rozstrzyga losowanie.

### 3.4 Wyświetlanie tekstu i śledzenie śpiewu
- **F15.** Tekst wyświetlany dużą czcionką, aktualny wers wyróżniony, kolejny wers widoczny pod spodem (podgląd).
- **F16.** Aplikacja **nasłuchuje przez mikrofon** i na tej podstawie **przewija tekst** do aktualnie śpiewanego miejsca.
- **F17.** Tryb awaryjny / ręczny: przewijanie wg zapisanego tempa oraz ręcznie (strzałki / pilot / przycisk na telefonie gospodarza).
- **F18.** Możliwość zatrzymania, cofnięcia o wers, przejścia do następnej zwrotki, zakończenia kolędy.

### 3.5 Narrator (podpowiadacz)
- **F19.** Narrator — głos syntetyczny — **czyta kolejny wers z wyprzedzeniem**, zanim uczestnicy zaczną go śpiewać (jak „suflerka” w chórze).
- **F20.** Narrator reaguje na postęp śpiewu: po usłyszeniu (rozpoznaniu) końcówki bieżącego wersu podpowiada następny.
- **F21.** Konfigurowalne: włącz/wyłącz, głośność, wyprzedzenie (ile przed końcem wersu), co czytać (cały wers / początek wersu / tylko pierwsze słowa zwrotki).
- **F22.** Głos narratora nie może być mylony przez aplikację ze śpiewem uczestników (np. wyciszanie analizy mikrofonu na czas podpowiedzi albo kasowanie echa).

### 3.6 Motywy kolorystyczne
- **F23.** Kilka gotowych wersji kolorystycznych do wyboru, np.:
  - **Klasyczny** — czerwień i złoto,
  - **Zimowa noc** — granat, srebro, płatki śniegu,
  - **Choinka** — zieleń i ciepłe światełka,
  - **Szopka** — ciepłe brązy, beże, światło świecy,
  - **Wysoki kontrast** — dla lepszej czytelności.
- **F24.** Motyw zmienia tło, kolory tekstu, wyróżnienia i animacje (np. padający śnieg); wybór zapamiętywany między uruchomieniami.

### 3.7 Ocena zaangażowania („Kolędometr”)
- **F25.** Przez cały czas trwania kolędy aplikacja mierzy głośność/energię śpiewu z mikrofonu.
- **F26.** Na końcu kolędy wyświetla się efektowne podsumowanie, np.:
  - średni i szczytowy poziom w **dB** (względnych, skalibrowanych),
  - „procent zaśpiewanego tekstu” (jak dużą część wersów było słychać śpiew),
  - wynik końcowy w fancy formie: termometr, liczba zapalonych świeczek na choince, „gwiazdki betlejemskie” 1–5, tytuł („Chór anielski”, „Pasterze po kolacji”, „Cicha noc… aż za cicha”).
- **F27.** Ranking kolęd w sesji — która została zaśpiewana „najgłośniej / najlepiej”.
- **F28.** Kalibracja przed startem: krótki pomiar ciszy w pokoju (poziom tła), żeby wynik nie zależał od mikrofonu.

## 4. Wymagania niefunkcjonalne

- **N1. Czytelność na TV:** duże fonty, wysoki kontrast, układ 16:9, brak drobnych elementów sterujących na ekranie śpiewania.
- **N2. Telefony:** strona uczestnika działa w mobilnym Safari i Chrome, bez instalacji, mieści się na jednym ekranie.
- **N3. Opóźnienia:** głos → TV < 1 s; reakcja przewijania na śpiew możliwie płynna (bez skoków).
- **N4. Prywatność:** dźwięk z mikrofonu analizowany lokalnie w przeglądarce, **nie jest nagrywany ani wysyłany** na serwer.
- **N5. Działanie w sieci domowej:** telefony i PC w tym samym Wi-Fi; preferowane działanie bez internetu (poza ewentualnym hostingiem).
- **N6. Prostota startu:** od otwarcia strony do pierwszej kolędy — maks. kilka kliknięć.

## 5. Uwagi techniczne (wstępne, do decyzji)

- **Architektura:** frontend (ekran TV + widok telefonu) + lekki serwer z **WebSocketami** do sesji i głosowania (np. Node.js). Serwer może działać lokalnie na PC (telefony łączą się po IP w sieci lokalnej) albo w chmurze.
- **Śledzenie śpiewu:** rozpoznawanie mowy (Web Speech API) słabo radzi sobie ze śpiewem grupowym. Realistyczne podejście hybrydowe:
  1. tekst z przybliżonymi czasami wersów (jak pliki LRC),
  2. wykrywanie aktywności głosu (VAD) i przerw między wersami z Web Audio API, żeby dopasować tempo,
  3. opcjonalnie rozpoznawanie słów jako dodatkowa korekta pozycji.
- **Narrator:** synteza mowy w przeglądarce (Web Speech API `speechSynthesis`, polski głos) lub nagrania/zewnętrzne TTS dla lepszej jakości.
- **Decybele:** pomiar RMS z Web Audio API → poziom w dB względem kalibracji ciszy; przeglądarka nie zna bezwzględnego SPL, więc „dB” są umowne.
- **Ilustracje:** własne / generowane / z licencją pozwalającą na użycie; teksty kolęd tylko z domeny publicznej.

## 6. Otwarte pytania

1. Czy aplikacja ma odtwarzać **podkład muzyczny** (instrumental), czy śpiewamy a cappella?
2. Czy telefon uczestnika ma też pokazywać tekst kolędy (np. dla osób daleko od TV)?
3. Serwer lokalny na PC czy hosting w internecie?
4. Czy głosujemy na wszystkie kolędy, czy tylko na wylosowanych kandydatów — a może oba tryby do wyboru?
5. Ile zwrotek śpiewamy domyślnie (wszystkie / pierwsze 2–3)?
6. Czy ranking/wyniki mają być zapisywane między sesjami (np. „rekord z zeszłej Wigilii”)?
7. Czy potrzebne są indywidualne punkty dla uczestników, czy tylko wynik grupowy?
8. Narrator: głos syntetyczny wystarczy, czy chcemy nagrany (np. „głos Mikołaja”)?

## 7. Proponowany zakres MVP

1. Kafelki kolęd + ekran śpiewania z wyróżnionym wersem (przewijanie wg tempa + ręczne).
2. Losowanie następnej kolędy.
3. Głosowanie z telefonów przez QR + wyniki na żywo.
4. 2–3 motywy kolorystyczne.
5. Kolędometr (głośność w dB + wynik w formie gwiazdek/świeczek).
6. Narrator TTS czytający kolejny wers wg czasu.

Etap 2: śledzenie śpiewu z mikrofonu, narrator reagujący na śpiew, ranking sesji, własne kolędy.
