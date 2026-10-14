import { countSyllables } from '@kolednik/shared';

/** Narrator-suflerka: syntetyczny głos czyta następny wers (F26). */
class Narrator {
  private voice: SpeechSynthesisVoice | null = null;
  private speaking = false;
  private lastEnd = 0;

  get supported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  get hasPolishVoice() {
    return this.voice?.lang.toLowerCase().startsWith('pl') ?? false;
  }

  get voiceName() {
    return this.voice?.name ?? null;
  }

  init() {
    if (!this.supported) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      const pl = voices.filter((v) => v.lang.toLowerCase().startsWith('pl'));
      // Głosy „online”/Google brzmią zwykle lepiej niż lokalne.
      this.voice =
        pl.find((v) => /google|natural|online/i.test(v.name)) ??
        pl[0] ??
        voices.find((v) => v.default) ??
        null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
  }

  /** Przeglądarki wymagają kliknięcia przed pierwszą mową. */
  unlock() {
    if (!this.supported) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }

  say(text: string, opts: { volume: number; rate: number }) {
    if (!this.supported) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang ?? 'pl-PL';
    u.volume = opts.volume;
    u.rate = opts.rate;
    u.onstart = () => (this.speaking = true);
    u.onend = u.onerror = () => {
      this.speaking = false;
      this.lastEnd = performance.now();
    };
    this.speaking = true;
    speechSynthesis.speak(u);
  }

  cancel() {
    if (!this.supported) return;
    speechSynthesis.cancel();
    this.speaking = false;
  }

  /** Czy właśnie mówi (z zapasem na pogłos) — wtedy mikrofon nie liczy się do kolędometru (F29). */
  isMasking() {
    return this.speaking || performance.now() - this.lastEnd < 350;
  }
}

export const narrator = new Narrator();

/** Szacowany czas wypowiedzi tekstu przez TTS. */
export function estimateSpeechMs(text: string, rate: number) {
  return (countSyllables(text) * 170) / rate + 250;
}

export function promptText(line: string, what: 'line' | 'start') {
  if (what === 'line') return line;
  const words = line.split(/\s+/);
  return words.length <= 3 ? line : `${words.slice(0, 3).join(' ')}…`;
}
