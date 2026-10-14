import { useId } from 'react';
import type { Motif, SongMeta } from '@kolednik/shared';

/** Deterministyczny „losowy” generator — te same gwiazdki dla tej samej kolędy. */
function seeded(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

type Props = { song: Pick<SongMeta, 'art' | 'image' | 'title'>; className?: string };

/** Ilustracja kafelka: obrazek z content/images, a gdy go brak — scenka SVG wg motywu. */
export function SongArt({ song, className }: Props) {
  if (song.image) {
    return <img className={className} src={`/content/images/${song.image}`} alt="" loading="lazy" />;
  }
  return <ArtSvg motif={song.art.motif} hue={song.art.hue} className={className} />;
}

export function ArtSvg({ motif, hue, className }: { motif: Motif; hue: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const rnd = seeded(hue + motif.length * 31);
  const stars = Array.from({ length: 22 }, () => ({ x: rnd() * 160, y: rnd() * 55, r: 0.3 + rnd() * 0.9 }));
  const sky1 = `hsl(${hue} 55% 14%)`;
  const sky2 = `hsl(${(hue + 25) % 360} 50% 34%)`;
  const ground = `hsl(${hue} 35% 9%)`;
  const gold = 'hsl(43 95% 66%)';
  const warm = 'hsl(36 100% 72%)';

  return (
    <svg className={className} viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky1} />
          <stop offset="1" stopColor={sky2} />
        </linearGradient>
        <radialGradient id={`glow${id}`}>
          <stop offset="0" stopColor={warm} stopOpacity="0.95" />
          <stop offset="0.35" stopColor={warm} stopOpacity="0.35" />
          <stop offset="1" stopColor={warm} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`snow${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor={`hsl(${hue} 30% 80%)`} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <rect width="160" height="100" fill={`url(#sky${id})`} />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={0.5 + (i % 3) * 0.2} />
      ))}
      <path d="M0 82 Q40 68 80 78 T160 74 V100 H0 Z" fill={ground} />
      <path d="M0 90 Q50 80 95 88 T160 86 V100 H0 Z" fill={`url(#snow${id})`} />
      {MOTIF_DRAW[motif]({ id, hue, gold, warm })}
    </svg>
  );
}

type Ctx = { id: string; hue: number; gold: string; warm: string };

const Star = ({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) => {
  const pts = Array.from({ length: 16 }, (_, i) => {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? (i % 4 === 0 ? r : r * 0.6) : r * 0.18;
    return `${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`;
  }).join(' ');
  return <polygon points={pts} fill={fill} />;
};

const MOTIF_DRAW: Record<Motif, (c: Ctx) => React.ReactNode> = {
  star: ({ id, gold }) => (
    <g>
      <path d="M112 24 L60 86 L84 86 Z" fill={gold} opacity="0.12" />
      <circle cx="112" cy="24" r="22" fill={`url(#glow${id})`} />
      <Star x={112} y={24} r={13} fill={gold} />
      <path d="M38 80 l6 -9 l6 9 Z M56 82 l5 -7 l5 7 Z" fill="#0008" />
    </g>
  ),
  stable: ({ id, gold, warm }) => (
    <g>
      <circle cx="80" cy="18" r="14" fill={`url(#glow${id})`} />
      <Star x={80} y={18} r={8} fill={gold} />
      <path d="M50 58 L80 36 L110 58 Z" fill="#2a1609" />
      <rect x="56" y="57" width="48" height="27" fill="#3b210f" />
      <rect x="66" y="64" width="28" height="20" fill={warm} opacity="0.85" />
      <circle cx="80" cy="76" r="20" fill={`url(#glow${id})`} opacity="0.7" />
      <path d="M72 84 q8 -10 16 0 Z" fill="#5a3a1a" />
      <path d="M47 59 L80 34 L113 59" stroke="#fff" strokeWidth="2.5" fill="none" opacity="0.85" />
    </g>
  ),
  angel: ({ id, gold }) => (
    <g>
      <circle cx="80" cy="44" r="34" fill={`url(#glow${id})`} opacity="0.6" />
      <path d="M80 40 C60 30 46 36 40 52 C54 48 66 52 76 58 Z" fill="#fff" opacity="0.92" />
      <path d="M80 40 C100 30 114 36 120 52 C106 48 94 52 84 58 Z" fill="#fff" opacity="0.92" />
      <path d="M80 38 L66 80 H94 Z" fill="#fdf6e8" />
      <circle cx="80" cy="33" r="6" fill="#ffe9cf" />
      <ellipse cx="80" cy="25" rx="8" ry="2.4" fill="none" stroke={gold} strokeWidth="1.8" />
      <path d="M86 46 l12 -6" stroke={gold} strokeWidth="2" strokeLinecap="round" />
    </g>
  ),
  candle: ({ id, gold }) => (
    <g>
      <circle cx="80" cy="34" r="32" fill={`url(#glow${id})`} />
      <rect x="71" y="44" width="18" height="40" rx="3" fill="#f3ead8" />
      <path d="M71 50 q9 4 18 0" stroke="#e0d2b6" strokeWidth="2" fill="none" />
      <path d="M80 22 C86 30 86 36 80 40 C74 36 74 30 80 22 Z" fill={gold} />
      <path d="M80 29 C82 33 82 36 80 38 C78 36 78 33 80 29 Z" fill="#fff" />
      <path
        d="M58 84 q-10 -8 0 -14 q4 8 14 6 q-6 6 -14 8 Z M102 84 q10 -8 0 -14 q-4 8 -14 6 q6 6 14 8 Z"
        fill="#1f6b3a"
      />
      <circle cx="74" cy="84" r="3" fill="#d6332b" />
      <circle cx="86" cy="84" r="3" fill="#d6332b" />
    </g>
  ),
  tree: ({ id, gold }) => (
    <g>
      <circle cx="80" cy="18" r="12" fill={`url(#glow${id})`} />
      <path d="M80 22 L58 50 H102 Z M80 34 L52 66 H108 Z M80 48 L46 84 H114 Z" fill="#17643a" />
      <rect x="75" y="84" width="10" height="6" fill="#5a3a1a" />
      <Star x={80} y={20} r={7} fill={gold} />
      {[
        [70, 46, '#e2463f'],
        [90, 47, gold],
        [64, 62, gold],
        [84, 60, '#7fb2ff'],
        [97, 64, '#e2463f'],
        [58, 79, '#7fb2ff'],
        [74, 77, '#e2463f'],
        [92, 79, gold],
        [104, 80, '#7fb2ff'],
      ].map(([x, y, c], i) => (
        <circle key={i} cx={x as number} cy={y as number} r="2.6" fill={c as string} />
      ))}
    </g>
  ),
  moon: ({ id, gold, hue }) => (
    <g>
      <circle cx="108" cy="28" r="26" fill={`url(#glow${id})`} opacity="0.5" />
      <path d="M108 12 A16 16 0 1 0 122 36 A13 13 0 1 1 108 12 Z" fill="#fff4d6" />
      <Star x={70} y={22} r={4} fill={gold} />
      <Star x={52} y={38} r={3} fill={gold} />
      <path d="M56 70 Q80 92 104 70 Z" fill="#6b4423" />
      <path
        d="M58 70 Q80 62 102 70"
        stroke={`hsl(${hue} 40% 85%)`}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="70" cy="66" r="4.5" fill="#ffe1c4" />
      <path d="M52 84 l8 -14 M108 84 l-8 -14" stroke="#6b4423" strokeWidth="2.5" />
    </g>
  ),
  crown: ({ id, gold }) => (
    <g>
      <circle cx="80" cy="50" r="34" fill={`url(#glow${id})`} opacity="0.55" />
      <path d="M54 70 L50 38 L66 52 L80 30 L94 52 L110 38 L106 70 Z" fill={gold} />
      <rect x="54" y="68" width="52" height="8" rx="2" fill="hsl(40 85% 52%)" />
      <circle cx="80" cy="56" r="4" fill="#d6332b" />
      <circle cx="66" cy="62" r="3" fill="#2f7be0" />
      <circle cx="94" cy="62" r="3" fill="#1f9d55" />
      <Star x={36} y={20} r={5} fill={gold} />
      <Star x={124} y={22} r={5} fill={gold} />
      <Star x={80} y={14} r={6} fill={gold} />
    </g>
  ),
  bells: ({ id, gold }) => (
    <g>
      <circle cx="80" cy="46" r="34" fill={`url(#glow${id})`} opacity="0.5" />
      <g transform="rotate(-14 66 50)">
        <path d="M66 30 C54 30 54 50 50 64 H82 C78 50 78 30 66 30 Z" fill={gold} />
        <circle cx="66" cy="67" r="4" fill="hsl(40 85% 50%)" />
      </g>
      <g transform="rotate(14 94 50)">
        <path d="M94 30 C82 30 82 50 78 64 H110 C106 50 106 30 94 30 Z" fill={gold} />
        <circle cx="94" cy="67" r="4" fill="hsl(40 85% 50%)" />
      </g>
      <path d="M80 26 C70 14 62 22 72 28 Z M80 26 C90 14 98 22 88 28 Z" fill="#d6332b" />
      <circle cx="80" cy="26" r="3.5" fill="#b3241d" />
      <path d="M78 28 l-6 14 M82 28 l6 14" stroke="#d6332b" strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
};
