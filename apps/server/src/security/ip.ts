import type { IncomingHttpHeaders } from 'node:http';

/** Adres klienta: za Cloudflare jest w CF-Connecting-IP, za innym proxy w X-Forwarded-For. */
export function clientIp(headers: IncomingHttpHeaders, fallback: string | undefined): string {
  const cf = headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf;
  const xff = headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || fallback || 'unknown';
}

/** Do logów zapisujemy adres bez ostatniego członu — wystarczy do statystyk i wykrywania nadużyć. */
export function maskIp(ip: string): string {
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4.replace(/\.\d+$/, '.x');
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + ':…';
  return ip;
}
