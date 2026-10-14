import type { Metrics } from './scoring.js';

export const THEMES = ['classic', 'winter', 'tree', 'nativity', 'contrast'] as const;
export type ThemeId = (typeof THEMES)[number];

export type Phase = 'LOBBY' | 'VOTING' | 'REVEAL' | 'SINGING' | 'SUMMARY';
export type AdvanceMode = 'auto' | 'conductor';

export type Participant = { id: string; nick: string; connected: boolean };

export type LinePosition = {
  index: number;
  /** Początek wersu w czasie serwera (ms). */
  startedAt: number;
  durationMs: number;
  paused: boolean;
};

export type Reveal = {
  slug: string;
  via: 'vote' | 'random';
  candidates: string[];
  viaTiebreak: boolean;
};

export type RecordInfo = { previousBest: number | null; previousAt: number | null; isNew: boolean };

export type Summary = {
  slug: string;
  metrics: Metrics | null;
  record: RecordInfo | null;
};

export type PublicState = {
  sessionId: string;
  code: string;
  groupName: string;
  theme: ThemeId;
  phase: Phase;
  participants: Participant[];
  hostConnected: boolean;
  /** Kolędy zaśpiewane tego wieczoru. */
  sung: string[];
  vote: { endsAt: number; counts: Record<string, number>; voters: number } | null;
  reveal: Reveal | null;
  song: { slug: string; advanceMode: AdvanceMode; position: LinePosition | null } | null;
  conductor: { id: string; nick: string } | null;
  summary: Summary | null;
};

export type Ok<T> = { ok: true } & T;
export type Fail = { ok: false; error: string };
export type Result<T = object> = Ok<T> | Fail;
type Ack<T = object> = (r: Result<T>) => void;

export type PerformanceInput = {
  metrics: Metrics | null;
  keyShift?: number;
  tempo?: number;
};

export type BookEntry = { slug: string; best: number | null; bestAt: number | null; times: number; lastAt: number };
export type BookEvening = { sessionId: string; startedAt: number; songs: number; avgScore: number | null };
export type Book = { groupName: string; records: BookEntry[]; evenings: BookEvening[] };

export interface ClientToServerEvents {
  'time:ping': (ack: (serverNow: number) => void) => void;

  'host:create': (p: { groupName: string; theme: ThemeId }, ack: Ack<{ sessionId: string; hostToken: string }>) => void;
  'host:resume': (p: { sessionId: string; hostToken: string }, ack: Ack) => void;
  'host:theme': (p: { theme: ThemeId }) => void;
  'host:vote:start': (p: { durationSec: number }) => void;
  'host:vote:end': () => void;
  'host:random': () => void;
  'host:song:start': (p: { slug: string; advanceMode: AdvanceMode }) => void;
  'host:song:position': (p: LinePosition) => void;
  'host:song:mode': (p: { advanceMode: AdvanceMode }) => void;
  'host:song:finish': (p: PerformanceInput) => void;
  'host:song:abort': () => void;
  'host:summary:close': () => void;
  'host:reset-sung': () => void;
  'host:book': (ack: Ack<{ book: Book }>) => void;

  'phone:join': (p: { code: string; clientId: string; nick: string }, ack: Ack<{ sessionId: string }>) => void;
  'phone:nick': (p: { nick: string }) => void;
  'phone:vote': (p: { slug: string }) => void;
  'phone:conductor:claim': () => void;
  'phone:conductor:release': () => void;
  'phone:conductor:step': (p: { delta: 1 | -1 }) => void;
}

export interface ServerToClientEvents {
  state: (s: PublicState) => void;
  /** Do TV: dyrygent przełączył wers. */
  'conductor:step': (p: { delta: 1 | -1 }) => void;
}
