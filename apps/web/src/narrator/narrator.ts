import {
  countSyllables,
  NARRATION_RECORDED_RATE,
  NARRATION_VOICES,
  narrationKey,
  type NarrationManifest,
  type NarrationVoiceId,
} from '@kolednik/shared';

export { promptText } from '@kolednik/shared';

/** Głos narratora: nagrania z serwera albo syntezator przeglądarki (gdy nagrań brak). */
export type NarratorVoice = NarrationVoiceId | 'browser';

export type SayOpts = { volume: number; rate: number; voice: NarratorVoice };

/** Krótka cisza (WAV) do odblokowania odtwarzania po kliknięciu — Safari tego wymaga. */
function silentWav(): string {
  const n = 800;
  const buf = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  buf.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true);
  buf.setUint16(22, 1, true);
  buf.setUint32(24, 16000, true);
  buf.setUint32(28, 32000, true);
  buf.setUint16(32, 2, true);
  buf.setUint16(34, 16, true);
  str(36, 'data');
  buf.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/**
 * Narrator-suflerka (F26): czyta następny wers. Gra nagrania przygotowane na serwerze neuronowym głosem
 * (content/narration); syntezator przeglądarki zostaje tylko na wypadek braku nagrania.
 */
class Narrator {
  private browserVoice: SpeechSynthesisVoice | null = null;
  private audio: HTMLAudioElement | null = null;
  private manifest: NarrationManifest | null = null;
  private manifestLoad: Promise<void> | null = null;
  /** Pobrane nagrania (klucz głos/tekst → adres blob), żeby podpowiedź ruszała bez opóźnienia sieci. */
  private clips = new Map<string, Promise<string | null>>();
  /** Podpowiedź czekająca na pobranie nagrania (nowsza lub cancel() ją unieważnia). */
  private pending: Promise<void> | null = null;
  private speaking = false;
  private lastEnd = 0;
  private listeners = new Set<(speaking: boolean) => void>();

  get supported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  get hasPolishVoice() {
    return this.browserVoice?.lang.toLowerCase().startsWith('pl') ?? false;
  }

  /** Czy serwer ma nagrania tego głosu. */
  hasRecordings(voice: NarratorVoice) {
    return voice !== 'browser' && Object.keys(this.manifest?.[voice]?.clips ?? {}).length > 0;
  }

  /** Powiadamia, gdy narrator zaczyna i kończy mówić (np. ściszenie podkładu). */
  onSpeaking(cb: (speaking: boolean) => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private setSpeaking(on: boolean) {
    if (this.speaking === on) return;
    this.speaking = on;
    if (!on) this.lastEnd = performance.now();
    for (const l of this.listeners) l(on);
  }

  init() {
    this.manifestLoad ??= fetch('/content/narration/manifest.json')
      .then((r) => (r.ok ? (r.json() as Promise<NarrationManifest>) : null))
      .then((m) => void (this.manifest = m))
      .catch(() => undefined);
    if (!this.supported) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      const pl = voices.filter((v) => v.lang.toLowerCase().startsWith('pl'));
      // Głosy „online”/Google brzmią zwykle lepiej niż lokalne.
      this.browserVoice =
        pl.find((v) => /google|natural|online/i.test(v.name)) ??
        pl[0] ??
        voices.find((v) => v.default) ??
        null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
  }

  /** Przeglądarki wymagają kliknięcia przed pierwszym dźwiękiem. */
  unlock() {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.preservesPitch = true;
      this.audio.addEventListener('playing', () => this.setSpeaking(true));
      for (const ev of ['ended', 'pause', 'error'] as const) {
        this.audio.addEventListener(ev, () => this.setSpeaking(false));
      }
      this.audio.src = silentWav();
      void this.audio.play().catch(() => undefined);
    }
    if (this.supported) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  }

  private clipUrl(voice: NarrationVoiceId, text: string): Promise<string | null> | null {
    const key = narrationKey(text);
    if (!this.manifest?.[voice]?.clips[key]) return null;
    const id = `${voice}/${key}`;
    let p = this.clips.get(id);
    if (!p) {
      p = fetch(`/content/narration/${id}.mp3`)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        .then((b) => URL.createObjectURL(b))
        .catch(() => {
          this.clips.delete(id);
          return null;
        });
      this.clips.set(id, p);
    }
    return p;
  }

  /** Pobiera z góry nagrania podpowiedzi kolędy. */
  async preload(texts: string[], voice: NarratorVoice) {
    if (voice === 'browser') return;
    await this.manifestLoad;
    await Promise.all(texts.map((t) => this.clipUrl(voice, t)));
  }

  say(text: string, opts: SayOpts) {
    this.cancel();
    const clip = opts.voice === 'browser' ? null : this.clipUrl(opts.voice, text);
    if (clip && this.audio) {
      const audio = this.audio;
      this.setSpeaking(true);
      const started = (this.pending = clip.then((url) => {
        // w międzyczasie przyszła nowsza podpowiedź albo cancel()
        if (this.pending !== started) return;
        if (!url) return this.speakBrowser(text, opts);
        audio.src = url;
        audio.volume = Math.min(1, opts.volume);
        audio.playbackRate = opts.rate / NARRATION_RECORDED_RATE;
        audio.play().catch(() => this.setSpeaking(false));
      }));
      return;
    }
    this.speakBrowser(text, opts);
  }

  private speakBrowser(text: string, opts: SayOpts) {
    if (!this.supported) return;
    const u = new SpeechSynthesisUtterance(text);
    if (this.browserVoice) u.voice = this.browserVoice;
    u.lang = this.browserVoice?.lang ?? 'pl-PL';
    u.volume = opts.volume;
    u.rate = opts.rate;
    u.onstart = () => this.setSpeaking(true);
    u.onend = u.onerror = () => this.setSpeaking(false);
    this.setSpeaking(true);
    speechSynthesis.speak(u);
  }

  cancel() {
    this.pending = null;
    if (this.audio && !this.audio.paused) this.audio.pause();
    if (this.supported) speechSynthesis.cancel();
    this.setSpeaking(false);
  }

  /** Czas podpowiedzi (ms): z nagrania, a dla syntezatora przeglądarki — szacunek z liczby sylab. */
  durationMs(text: string, opts: Pick<SayOpts, 'rate' | 'voice'>) {
    const ms = opts.voice === 'browser' ? undefined : this.manifest?.[opts.voice]?.clips[narrationKey(text)];
    if (ms) return (ms * NARRATION_RECORDED_RATE) / opts.rate;
    return (countSyllables(text) * 170) / opts.rate + 250;
  }

  /** Czy właśnie mówi (z zapasem na pogłos) — wtedy mikrofon nie liczy się do kolędometru (F29). */
  isMasking() {
    return this.speaking || performance.now() - this.lastEnd < 350;
  }
}

export const narrator = new Narrator();

export const NARRATOR_VOICES: { id: NarratorVoice; name: string }[] = [
  ...NARRATION_VOICES.map((v) => ({ id: v.id, name: v.name })),
  { id: 'browser', name: 'Syntezator przeglądarki' },
];
