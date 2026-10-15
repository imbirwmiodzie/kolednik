import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEYLEN = 32;
const PARAMS = { N: 16384, r: 8, p: 1 };

/** Hasło grupy jako `scrypt$sól$skrót` — nigdy nie trzymamy go jawnie. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize('NFC'), salt, KEYLEN, PARAMS);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(
    password.normalize('NFC'),
    Buffer.from(salt, 'base64url'),
    expected.length,
    PARAMS,
  );
  return timingSafeEqual(actual, expected);
}

/** Porównanie w stałym czasie (np. login admina). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
