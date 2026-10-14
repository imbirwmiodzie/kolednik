/** Nazwa grupy jako klucz „konta”: bez względu na wielkość liter i nadmiarowe spacje (F40). */
export function normalizeGroupName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl');
}

export function cleanDisplayName(name: string, max = 40): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, max);
}

/** Litery bez łatwych do pomylenia znaków (I/O/Q/V). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPRSTUWXYZ';

export function randomCode(rng: () => number = Math.random, length = 4): string {
  let s = '';
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return s;
}
