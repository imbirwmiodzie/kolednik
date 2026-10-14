import { useEffect, useState } from 'react';
import type { Book, SongMeta } from '@kolednik/shared';
import { getSocket } from '../net/socket';
import { Modal } from '../ui/Modal';
import { plural } from './Lobby';
import { formatDate } from './Summary';

/** Złota księga: rekordy grupy i historia wieczorów (F39). */
export function BookModal({ onClose, bySlug }: { onClose: () => void; bySlug: Map<string, SongMeta> }) {
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => {
    getSocket().emit('host:book', (r) => r.ok && setBook(r.book));
  }, []);
  return (
    <Modal title={book ? `Złota księga — ${book.groupName}` : 'Złota księga'} onClose={onClose}>
      {!book ? (
        <p>Otwieram księgę…</p>
      ) : book.records.length === 0 ? (
        <p>Księga jest jeszcze pusta. Zaśpiewajcie pierwszą kolędę!</p>
      ) : (
        <>
          <table className="book">
            <thead>
              <tr>
                <th>#</th>
                <th>Kolęda</th>
                <th>Rekord</th>
                <th>Kiedy</th>
                <th>Ile razy</th>
              </tr>
            </thead>
            <tbody>
              {book.records.map((r, i) => (
                <tr key={r.slug}>
                  <td>{i === 0 && r.best !== null ? '🏆' : i + 1}</td>
                  <td>{bySlug.get(r.slug)?.title ?? r.slug}</td>
                  <td>
                    <strong>{r.best ?? '—'}</strong>
                  </td>
                  <td>{r.bestAt ? formatDate(r.bestAt) : '—'}</td>
                  <td>{r.times}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Wieczory</h3>
          <ul className="evenings">
            {book.evenings.map((e) => (
              <li key={e.sessionId}>
                {formatDate(e.startedAt)} — {e.songs} {plural(e.songs, 'kolęda', 'kolędy', 'kolęd')}
                {e.avgScore !== null && <>, średnio {e.avgScore} pkt</>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
