import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { PublicState } from '@kolednik/shared';

/** Kod QR + kod wieczoru do dołączenia z telefonu (F9). */
export function JoinCard({ state, compact = false }: { state: PublicState; compact?: boolean }) {
  const url = `${location.origin}/j/${state.code}`;
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    void QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: 'M' }).then(setQr);
  }, [url]);
  const online = state.participants.filter((p) => p.connected);
  return (
    <div className={`join-card ${compact ? 'compact' : ''}`}>
      {qr && <img className="qr" src={qr} alt={`Kod QR: ${url}`} />}
      <div className="join-text">
        <div className="join-label">Dołącz telefonem</div>
        <div className="join-code">{state.code}</div>
        {!compact && <div className="join-url">{url.replace(/^https?:\/\//, '')}</div>}
        <div className="join-count">
          {online.length === 0 ? 'Nikt jeszcze nie dołączył' : `${online.length} na pokładzie`}
        </div>
        {!compact && online.length > 0 && (
          <div className="nicks">
            {online.slice(0, 12).map((p) => (
              <span key={p.id} className="nick">
                {p.nick}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
