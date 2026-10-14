import { useSyncExternalStore } from 'react';

/** localStorage odporny na tryb prywatny / zablokowane dane strony. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

export function loadRaw<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* brak miejsca / tryb prywatny — trudno */
  }
}

export function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* j.w. */
  }
}

/** Mały reaktywny magazyn ustawień zapisywany w localStorage. */
export function createStore<T extends object>(key: string, defaults: T) {
  let value = load(key, defaults);
  const listeners = new Set<() => void>();
  const get = () => value;
  const set = (patch: Partial<T>) => {
    value = { ...value, ...patch };
    save(key, value);
    for (const l of listeners) l();
  };
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };
  const use = () => useSyncExternalStore(subscribe, get);
  return { get, set, use };
}

export function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
