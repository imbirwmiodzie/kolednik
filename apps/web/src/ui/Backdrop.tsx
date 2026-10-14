import { useEffect, useRef } from 'react';
import type { ThemeId } from '@kolednik/shared';
import { themeInfo } from '../themes/themes';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Tło motywu: padający śnieg, światełka choinkowe albo ciepła poświata szopki. */
export function Backdrop({ theme, density = 1 }: { theme: ThemeId; density?: number }) {
  const effect = themeInfo(theme).effect;
  return (
    <div className="backdrop" aria-hidden>
      {effect === 'snow' && <Snow density={density} />}
      {effect === 'lights' && <Lights />}
      {effect === 'glow' && <div className="backdrop-glow" />}
    </div>
  );
}

function Snow({ density }: { density: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || reducedMotion()) return;
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.width = canvas.clientWidth * devicePixelRatio;
      h = canvas.height = canvas.clientHeight * devicePixelRatio;
    };
    resize();
    window.addEventListener('resize', resize);
    const count = Math.round(((w * h) / 18000) * density);
    const flakes = Array.from({ length: Math.min(400, count) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: (0.6 + Math.random() * 2.2) * devicePixelRatio,
      vy: (0.3 + Math.random() * 0.9) * devicePixelRatio,
      phase: Math.random() * Math.PI * 2,
    }));
    let raf = 0;
    let t = 0;
    const frame = () => {
      t += 0.01;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const f of flakes) {
        f.y += f.vy;
        f.x += Math.sin(t + f.phase) * 0.4 * devicePixelRatio;
        if (f.y > h + 5) {
          f.y = -5;
          f.x = Math.random() * w;
        }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [density]);
  return <canvas ref={ref} className="backdrop-canvas" />;
}

const LIGHT_COLORS = ['#ff5a4e', '#ffd166', '#7fd1ff', '#9dff8a', '#ff8ad8'];

function Lights() {
  return (
    <div className="lights">
      <svg viewBox="0 0 1000 60" preserveAspectRatio="none" className="lights-wire">
        <path
          d="M0 10 Q 125 50 250 10 T 500 10 T 750 10 T 1000 10"
          stroke="#0a2a17"
          strokeWidth="3"
          fill="none"
        />
      </svg>
      {Array.from({ length: 24 }, (_, i) => {
        const x = (i + 0.5) / 24;
        const y = 10 + 28 * Math.abs(Math.sin(x * Math.PI * 4));
        return (
          <span
            key={i}
            className="light"
            style={{
              left: `${x * 100}%`,
              top: `${(y / 60) * 100}%`,
              background: LIGHT_COLORS[i % LIGHT_COLORS.length],
              animationDelay: `${(i * 0.37) % 2}s`,
            }}
          />
        );
      })}
    </div>
  );
}

/** Fajerwerki na nowy rekord. */
export function Fireworks({ duration = 6000 }: { duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = (canvas.width = canvas.clientWidth * devicePixelRatio);
    const h = (canvas.height = canvas.clientHeight * devicePixelRatio);
    type P = { x: number; y: number; vx: number; vy: number; life: number; color: string };
    const parts: P[] = [];
    const burst = () => {
      const x = w * (0.15 + Math.random() * 0.7);
      const y = h * (0.15 + Math.random() * 0.4);
      const color = `hsl(${Math.floor(Math.random() * 360)} 100% 65%)`;
      for (let i = 0; i < 80; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (1 + Math.random() * 4) * devicePixelRatio;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color });
      }
    };
    const start = performance.now();
    let last = 0;
    let raf = 0;
    const frame = (now: number) => {
      if (now - start < duration && now - last > 350) {
        burst();
        last = now;
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]!;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05 * devicePixelRatio;
        p.vx *= 0.985;
        p.life -= 0.012;
        if (p.life <= 0) {
          parts.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 2.5 * devicePixelRatio, 2.5 * devicePixelRatio);
      }
      ctx.globalAlpha = 1;
      if (parts.length || now - start < duration) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [duration]);
  return <canvas ref={ref} className="fireworks" aria-hidden />;
}
