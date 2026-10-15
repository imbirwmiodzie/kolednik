import { useEffect, useState, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, PublicState, ServerToClientEvents } from '@kolednik/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/** Kod i tajny klucz do linku w kodzie QR — serwer wysyła je tylko do TV. */
type JoinInfo = { code: string; token: string };
let joinInfo: JoinInfo | null = null;
const joinListeners = new Set<() => void>();
/** Przesunięcie zegara: czas serwera = Date.now() + offset. */
let offset = 0;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({ reconnectionDelayMax: 3000 });
    socket.on('connect', () => void syncClock());
    socket.on('join-info', (info) => {
      joinInfo = info;
      for (const l of joinListeners) l();
    });
  }
  return socket;
}

async function syncClock() {
  const s = getSocket();
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    try {
      const server = await s.timeout(3000).emitWithAck('time:ping');
      const t1 = Date.now();
      const rtt = t1 - t0;
      if (rtt < best) {
        best = rtt;
        offset = server + rtt / 2 - t1;
      }
    } catch {
      return;
    }
  }
}

export const serverNow = () => Date.now() + offset;
export const toServerTime = (local: number) => local + offset;

const connListeners = new Set<() => void>();
function subscribeConn(cb: () => void) {
  const s = getSocket();
  connListeners.add(cb);
  s.on('connect', cb);
  s.on('disconnect', cb);
  return () => {
    connListeners.delete(cb);
    s.off('connect', cb);
    s.off('disconnect', cb);
  };
}

export function useConnected(): boolean {
  return useSyncExternalStore(subscribeConn, () => getSocket().connected);
}

/** Ostatni stan sesji wysłany przez serwer. */
export function useSessionState(): PublicState | null {
  const [state, setState] = useState<PublicState | null>(null);
  useEffect(() => {
    const s = getSocket();
    s.on('state', setState);
    return () => {
      s.off('state', setState);
    };
  }, []);
  return state;
}

export function useJoinInfo(): JoinInfo | null {
  return useSyncExternalStore(
    (cb) => {
      getSocket();
      joinListeners.add(cb);
      return () => joinListeners.delete(cb);
    },
    () => joinInfo,
  );
}
