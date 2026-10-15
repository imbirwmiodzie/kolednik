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
  /** Nikt nie zagłosował — losowanie z całej puli. */
  noVotes?: boolean;
};

export type RecordInfo = { previousBest: number | null; previousAt: number | null; isNew: boolean };

export type Summary = {
  slug: string;
  metrics: Metrics | null;
  record: RecordInfo | null;
};

export type PublicState = {
  sessionId: string;
  groupName: string;
  theme: ThemeId;
  phase: Phase;
  participants: Participant[];
  hostConnected: boolean;
  /** Kolędy zaśpiewane tego wieczoru. */
  sung: string[];
  vote: { endsAt: number; counts: Record<string, number>; voters: number } | null;
  reveal: Reveal | null;
  song: { slug: string; advanceMode: AdvanceMode; keyShift: number; position: LinePosition | null } | null;
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

export type BookEntry = {
  slug: string;
  best: number | null;
  bestAt: number | null;
  times: number;
  lastAt: number;
};
export type BookEvening = { sessionId: string; startedAt: number; songs: number; avgScore: number | null };
export type Book = { groupName: string; records: BookEntry[]; evenings: BookEvening[] };

export interface ClientToServerEvents {
  'time:ping': (ack: (serverNow: number) => void) => void;

  /** Logowanie grupy: nowa nazwa zakłada konto z tym hasłem, istniejąca wymaga zgodnego hasła. */
  'host:create': (
    p: { groupName: string; password: string; theme: ThemeId },
    ack: Ack<{ sessionId: string; hostToken: string; created: boolean }>,
  ) => void;
  'host:resume': (p: { sessionId: string; hostToken: string }, ack: Ack) => void;
  'host:theme': (p: { theme: ThemeId }) => void;
  'host:vote:start': (p: { durationSec: number }) => void;
  'host:vote:end': () => void;
  'host:random': () => void;
  'host:song:start': (p: { slug: string; advanceMode: AdvanceMode; keyShift?: number }) => void;
  'host:song:key': (p: { keyShift: number }) => void;
  /** Nowy kod i link do dołączenia (stary przestaje działać; dołączeni zostają). */
  'host:rotate-code': () => void;
  'host:song:position': (p: LinePosition) => void;
  'host:song:mode': (p: { advanceMode: AdvanceMode }) => void;
  'host:song:finish': (p: PerformanceInput) => void;
  'host:song:abort': () => void;
  'host:summary:close': () => void;
  'host:reset-sung': () => void;
  'host:book': (ack: Ack<{ book: Book }>) => void;

  /**
   * Dołączenie telefonu: `token` z kodu QR, `code` wpisany ręcznie albo `sessionId` przy powrocie
   * po zerwaniu połączenia (tylko dla telefonu, który już był w tym wieczorze).
   */
  'phone:join': (
    p: { token?: string; code?: string; sessionId?: string; clientId: string; nick: string },
    ack: Ack<{ sessionId: string }>,
  ) => void;
  'phone:nick': (p: { nick: string }) => void;
  'phone:vote': (p: { slug: string }) => void;
  'phone:conductor:claim': () => void;
  'phone:conductor:release': () => void;
  'phone:conductor:step': (p: { delta: 1 | -1 }) => void;
}

export interface ServerToClientEvents {
  state: (s: PublicState) => void;
  /** Tylko do TV: kod i tajny klucz do linku w kodzie QR. */
  'join-info': (p: { code: string; token: string }) => void;
  /** Do TV: dyrygent przełączył wers. */
  'conductor:step': (p: { delta: 1 | -1 }) => void;
}

/** Panel administratora: statystyki użycia. */
export type AdminStats = {
  totals: {
    groups: number;
    sessions: number;
    performances: number;
    avgScore: number | null;
    phonesJoined: number;
    failedLogins7d: number;
  };
  live: { sessions: number; tvs: number; phones: number };
  daily: { day: string; sessions: number; songs: number; joins: number }[];
  topSongs: { slug: string; title: string; times: number; avgScore: number | null; best: number | null }[];
  topGroups: { name: string; sessions: number; songs: number; best: number | null; lastAt: number }[];
  eventTypes: { type: string; count: number }[];
};

export type AdminEvent = {
  id: number;
  at: number;
  type: string;
  group: string | null;
  sessionId: string | null;
  ip: string | null;
  data: Record<string, unknown> | null;
};
