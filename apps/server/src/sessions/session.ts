import {
  pickRandom,
  resolveVote,
  type AdvanceMode,
  type LinePosition,
  type Phase,
  type PublicState,
  type Reveal,
  type Summary,
  type ThemeId,
} from '@kolednik/shared';

export type ParticipantState = { nick: string; connected: number };

/** Stan jednego wieczoru (sesji) w pamięci serwera. Czyste metody — bez I/O, łatwe do testów. */
export class Session {
  phase: Phase = 'LOBBY';
  participants = new Map<string, ParticipantState>();
  hostSockets = 0;
  sung: string[];
  vote: { endsAt: number; ballots: Map<string, string> } | null = null;
  reveal: Reveal | null = null;
  song: { slug: string; advanceMode: AdvanceMode; position: LinePosition | null } | null = null;
  conductorId: string | null = null;
  summary: Summary | null = null;
  lastActivity = Date.now();

  constructor(
    readonly id: string,
    public code: string,
    readonly groupId: number,
    readonly groupName: string,
    readonly hostToken: string,
    public theme: ThemeId,
    sung: string[],
    private readonly allSlugs: () => string[],
  ) {
    this.sung = [...sung];
  }

  /** Kolędy, które można jeszcze wybrać tego wieczoru (F6). */
  pool(): string[] {
    return this.allSlugs().filter((s) => !this.sung.includes(s));
  }

  connectedParticipants(): string[] {
    return [...this.participants].filter(([, p]) => p.connected > 0).map(([id]) => id);
  }

  join(clientId: string, nick: string) {
    const p = this.participants.get(clientId);
    if (p) {
      p.connected++;
      if (nick) p.nick = nick;
    } else {
      this.participants.set(clientId, { nick: nick || this.defaultNick(), connected: 1 });
    }
  }

  private defaultNick(): string {
    return `Kolędnik ${this.participants.size + 1}`;
  }

  leave(clientId: string) {
    const p = this.participants.get(clientId);
    if (p) p.connected = Math.max(0, p.connected - 1);
  }

  setNick(clientId: string, nick: string) {
    const p = this.participants.get(clientId);
    if (p && nick) p.nick = nick;
  }

  startVote(durationSec: number, now = Date.now()): boolean {
    if (this.phase !== 'LOBBY' || this.pool().length === 0) return false;
    this.phase = 'VOTING';
    this.vote = { endsAt: now + durationSec * 1000, ballots: new Map() };
    return true;
  }

  castVote(clientId: string, slug: string): boolean {
    if (this.phase !== 'VOTING' || !this.vote || !this.pool().includes(slug)) return false;
    this.vote.ballots.set(clientId, slug);
    return true;
  }

  /** Wszyscy połączeni uczestnicy oddali głos (F13). */
  everyoneVoted(): boolean {
    const connected = this.connectedParticipants();
    return connected.length > 0 && connected.every((id) => this.vote?.ballots.has(id));
  }

  endVote(rng?: () => number): boolean {
    if (this.phase !== 'VOTING' || !this.vote) return false;
    const r = resolveVote(this.vote.ballots.values(), this.pool(), rng);
    this.reveal = { ...r, via: 'vote' };
    this.vote = null;
    this.phase = 'REVEAL';
    return true;
  }

  random(rng?: () => number): boolean {
    const pool = this.pool();
    if (this.phase !== 'LOBBY' || pool.length === 0) return false;
    this.reveal = { slug: pickRandom(pool, rng), candidates: pool, via: 'random', viaTiebreak: true };
    this.phase = 'REVEAL';
    return true;
  }

  startSong(slug: string, advanceMode: AdvanceMode): boolean {
    if (this.phase === 'SINGING') return false;
    this.vote = null;
    this.reveal = null;
    this.summary = null;
    this.song = { slug, advanceMode, position: null };
    this.phase = 'SINGING';
    return true;
  }

  setPosition(pos: LinePosition): boolean {
    if (this.phase !== 'SINGING' || !this.song) return false;
    this.song.position = pos;
    return true;
  }

  setMode(mode: AdvanceMode): boolean {
    if (!this.song) return false;
    this.song.advanceMode = mode;
    return true;
  }

  finishSong(summary: Omit<Summary, 'slug'>): string | null {
    if (this.phase !== 'SINGING' || !this.song) return null;
    const slug = this.song.slug;
    if (!this.sung.includes(slug)) this.sung.push(slug);
    this.summary = { slug, ...summary };
    this.song = null;
    this.phase = 'SUMMARY';
    return slug;
  }

  abortSong() {
    this.song = null;
    this.reveal = null;
    this.phase = 'LOBBY';
  }

  closeSummary() {
    if (this.phase !== 'SUMMARY') return;
    this.summary = null;
    this.phase = 'LOBBY';
  }

  /** Wszystko zaśpiewane → nowa runda (F8a). */
  resetSung() {
    this.sung = [];
  }

  /** Każdy uczestnik może przejąć rolę dyrygenta; przejęcie włącza tryb z telefonu. */
  claimConductor(clientId: string) {
    if (!this.participants.has(clientId)) return false;
    this.conductorId = clientId;
    if (this.song) this.song.advanceMode = 'conductor';
    return true;
  }

  releaseConductor(clientId: string) {
    if (this.conductorId !== clientId) return false;
    this.conductorId = null;
    if (this.song) this.song.advanceMode = 'auto';
    return true;
  }

  isConductor(clientId: string) {
    return this.conductorId === clientId;
  }

  toPublic(): PublicState {
    const counts: Record<string, number> = {};
    for (const slug of this.vote?.ballots.values() ?? []) counts[slug] = (counts[slug] ?? 0) + 1;
    const conductor = this.conductorId ? this.participants.get(this.conductorId) : undefined;
    return {
      sessionId: this.id,
      code: this.code,
      groupName: this.groupName,
      theme: this.theme,
      phase: this.phase,
      participants: [...this.participants].map(([id, p]) => ({ id, nick: p.nick, connected: p.connected > 0 })),
      hostConnected: this.hostSockets > 0,
      sung: [...this.sung],
      vote: this.vote ? { endsAt: this.vote.endsAt, counts, voters: this.vote.ballots.size } : null,
      reveal: this.reveal,
      song: this.song,
      conductor: conductor && this.conductorId ? { id: this.conductorId, nick: conductor.nick } : null,
      summary: this.summary,
    };
  }
}
