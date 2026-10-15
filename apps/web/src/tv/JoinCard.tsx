import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { PublicState } from '@kolednik/shared';
import { useJoinInfo } from '../net/socket';

type Info = { publicUrl: string | null; lanAddresses: string[] };
let infoPromise: Promise<Info> | null = null;
const isLocalhost = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

/**
 * Adres dla telefonów. Gdy TV otworzyło stronę przez localhost (testy na własnym komputerze),
 * telefon musi dostać adres komputera w sieci Wi-Fi, a nie „localhost”.
 */
function useJoinBase(): string {
  const [base, setBase] = useState(location.origin);
  useEffect(() => {
    infoPromise ??= fetch('/api/info').then((r) => r.json() as Promise<Info>);
    infoPromise
      .then((info) => {
        if (info.publicUrl) setBase(info.publicUrl.replace(/\/$/, ''));
        else if (isLocalhost() && info.lanAddresses[0]) {
          setBase(`${location.protocol}//${info.lanAddresses[0]}${location.port ? `:${location.port}` : ''}`);
        }
      })
      .catch(() => undefined);
  }, []);
  return base;
}

/**
 * Kod QR + kod wieczoru do dołączenia z telefonu (F9). Link zawiera tajny, losowy klucz wieczoru
 * (po „#”, więc nie trafia nawet do logów serwera ani Cloudflare); kod do wpisania ręcznie jest
 * zapasowy i chroniony limitem prób.
 */
export function JoinCard({ state, compact = false }: { state: PublicState; compact?: boolean }) {
  const info = useJoinInfo();
  const base = useJoinBase();
  const url = info ? `${base}/j#k=${info.token}` : null;
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (url) void QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: 'M' }).then(setQr);
  }, [url]);
  const online = state.participants.filter((p) => p.connected);
  return (
    <div className={`join-card ${compact ? 'compact' : ''}`} data-join-url={url ?? undefined}>
      {qr ? <img className="qr" src={qr} alt="Kod QR do dołączenia" /> : <div className="qr" />}
      <div className="join-text">
        <div className="join-label">Dołącz telefonem</div>
        <div className="join-code" aria-label="Kod wieczoru">
          {info?.code ?? '······'}
        </div>
        {!compact && <div className="join-url">{base.replace(/^https?:\/\//, '')}/j</div>}
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
