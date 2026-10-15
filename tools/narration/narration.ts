/**
 * Nagrania narratora: każdy wers (i jego początek) czytany neuronowym głosem Piper, zapisany jako MP3.
 *
 *   pnpm narration [--python <python z piper-tts>] [--models <katalog na modele>] [--force]
 *
 * Potrzebne: Python z pakietem piper-tts (`pip install piper-tts`) i ffmpeg. Brakujące modele głosów
 * pobierają się same z Hugging Face (rhasspy/piper-voices). Generuje tylko brakujące nagrania, usuwa
 * nieużywane i zapisuje content/narration/manifest.json z długością każdego nagrania.
 * Uruchomcie po dodaniu lub poprawieniu tekstu kolędy.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import {
  NARRATION_RECORDED_RATE,
  NARRATION_VOICES,
  narrationKey,
  promptText,
  type NarrationManifest,
} from '../../packages/shared/src/narration.js';
import { flattenSong, songSchema } from '../../packages/shared/src/song.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SONGS = path.join(ROOT, 'content/songs');
const OUT = path.join(ROOT, 'content/narration');
const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const python = arg('python') ?? process.env.PIPER_PYTHON ?? 'python3';
const modelsDir = arg('models') ?? path.join(homedir(), '.cache/kolednik/piper');
const force = process.argv.includes('--force');

/** Teksty do przeczytania: każdy wers w obu wariantach podpowiedzi. */
export function narrationTexts(): Map<string, string> {
  const texts = new Map<string, string>();
  for (const f of readdirSync(SONGS).filter((f) => f.endsWith('.json'))) {
    const song = songSchema.parse(JSON.parse(readFileSync(path.join(SONGS, f), 'utf8')));
    for (const line of flattenSong(song)) {
      for (const what of ['line', 'start'] as const) {
        const text = promptText(line.text, what);
        texts.set(narrationKey(text), text);
      }
    }
  }
  return texts;
}

/** Tekst dla syntezatora: bez cudzysłowów i myślników, które Piper czyta jako dziwne pauzy. */
function speakable(text: string): string {
  return text
    .replace(/[„”"«»]/g, '')
    .replace(/\s+[–—-]\s+/g, ', ')
    .replace(/…/g, '')
    .trim();
}

async function ensureModel(model: string): Promise<string> {
  const file = path.join(modelsDir, `${model}.onnx`);
  if (existsSync(file) && existsSync(`${file}.json`)) return file;
  mkdirSync(modelsDir, { recursive: true });
  const [lang, name, quality] = [model.split('-')[0]!, model.split('-')[1]!, model.split('-')[2]!];
  const base = `${HF}/${lang.split('_')[0]}/${lang}/${name}/${quality}/${model}`;
  for (const ext of ['.onnx', '.onnx.json']) {
    console.log(`Pobieram ${model}${ext}…`);
    const res = await fetch(base + ext);
    if (!res.ok) throw new Error(`Nie udało się pobrać ${base + ext}: ${res.status}`);
    writeFileSync(file.replace(/\.onnx$/, ext), Buffer.from(await res.arrayBuffer()));
  }
  return file;
}

/**
 * Obróbka nagrania: bez ciszy na początku i końcu, bez dudnienia, wyrównana dynamika i miękkie
 * wejście/wyjście — żeby podpowiedź zaczynała się od razu i brzmiała równo między wersami.
 */
const FILTER = [
  'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02',
  'areverse',
  'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05',
  'areverse',
  'highpass=f=90',
  'equalizer=f=3500:t=q:w=1.2:g=2',
  'acompressor=threshold=-22dB:ratio=3:attack=4:release=90:makeup=3',
  'alimiter=limit=0.85:level=false',
  'afade=t=in:d=0.015',
  'areverse,afade=t=in:d=0.04,areverse',
].join(',');

function encode(wav: string, mp3: string): number {
  execFileSync('ffmpeg', [
    ...['-y', '-loglevel', 'error', '-i', wav, '-af', FILTER],
    ...['-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '48k', mp3],
  ]);
  const out = execFileSync('ffprobe', [
    ...['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3],
  ]).toString();
  return Math.round(parseFloat(out) * 1000);
}

async function main() {
  const texts = narrationTexts();
  const manifestFile = path.join(OUT, 'manifest.json');
  const old: NarrationManifest = existsSync(manifestFile)
    ? JSON.parse(readFileSync(manifestFile, 'utf8'))
    : {};
  const manifest: NarrationManifest = {};

  for (const voice of NARRATION_VOICES) {
    const dir = path.join(OUT, voice.id);
    mkdirSync(dir, { recursive: true });
    const clips: Record<string, number> = {};
    const todo: { key: string; text: string }[] = [];
    for (const [key, text] of texts) {
      const known = old[voice.id]?.clips[key];
      if (!force && known && existsSync(path.join(dir, `${key}.mp3`))) clips[key] = known;
      else todo.push({ key, text });
    }
    // nagrania tekstów, których już nie ma w kolędach
    for (const f of readdirSync(dir)) {
      if (!texts.has(f.replace(/\.mp3$/, ''))) rmSync(path.join(dir, f));
    }
    console.log(`${voice.name}: ${texts.size - todo.length} gotowych, ${todo.length} do nagrania`);

    if (todo.length) {
      const model = await ensureModel(voice.model);
      const tmp = mkdtempSync(path.join(tmpdir(), 'kolednik-narration-'));
      const items = todo.map((t) => ({ text: speakable(t.text), out: path.join(tmp, `${t.key}.wav`) }));
      execFileSync(python, [path.join(import.meta.dirname, 'piper_batch.py')], {
        input: JSON.stringify({ model, lengthScale: 1 / NARRATION_RECORDED_RATE, items }),
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      for (const t of todo) {
        clips[t.key] = encode(path.join(tmp, `${t.key}.wav`), path.join(dir, `${t.key}.mp3`));
      }
      rmSync(tmp, { recursive: true, force: true });
    }
    manifest[voice.id] = {
      clips: Object.fromEntries(Object.entries(clips).sort(([a], [b]) => a.localeCompare(b))),
    };
  }

  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`Zapisano ${path.relative(ROOT, manifestFile)}`);
}

if (process.argv[1] === import.meta.filename) await main();
