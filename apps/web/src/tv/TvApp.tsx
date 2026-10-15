import { useCallback, useEffect, useState } from 'react';
import type { SongMeta, ThemeId } from '@kolednik/shared';
import { mic } from '../audio/mic';
import { useSongs } from '../net/api';
import { getSocket, useConnected, useSessionState } from '../net/socket';
import { narrator } from '../narrator/narrator';
import { navigate } from '../router';
import { hostSettings } from '../settings';
import { loadRaw, save } from '../storage';
import { applyTheme } from '../themes/themes';
import { Backdrop } from '../ui/Backdrop';
import { AudioGate, Calibration } from './AudioGate';
import { BookModal } from './Book';
import { Lobby } from './Lobby';
import { Reveal } from './Reveal';
import { SettingsModal } from './Settings';
import { Sing } from './Sing';
import { Summary } from './Summary';
import { HOST_SESSION_KEY, type HostSessionRef } from './TvStart';
import { Tutorial } from './Tutorial';
import { Voting } from './Voting';

export function TvApp({ sessionId }: { sessionId: string }) {
  const state = useSessionState();
  const connected = useConnected();
  const songs = useSongs();
  const [error, setError] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(true);
  const [calibrating, setCalibrating] = useState(false);
  const [modal, setModal] = useState<'settings' | 'book' | 'tutorial' | null>(null);
  const [welcome, setWelcome] = useState<string | null>(null);

  // Połączenie / ponowne połączenie jako gospodarz (N7: odświeżenie TV nie gubi wieczoru).
  useEffect(() => {
    document.body.className = 'tv';
    const ref = loadRaw<HostSessionRef>(HOST_SESSION_KEY);
    if (!ref || ref.sessionId !== sessionId) {
      setError('Ten wieczór był otwarty na innym komputerze albo w innej przeglądarce.');
      return;
    }
    if (ref.created) {
      // Powitanie nowego konta — raz.
      setWelcome(ref.groupName);
      save(HOST_SESSION_KEY, { ...ref, created: false });
      setTimeout(() => setWelcome(null), 9000);
    }
    const s = getSocket();
    const resume = () =>
      s.emit('host:resume', { sessionId: ref.sessionId, hostToken: ref.hostToken }, (r) => {
        if (!r.ok) setError(r.error);
      });
    if (s.connected) resume();
    s.on('connect', resume);
    return () => {
      s.off('connect', resume);
    };
  }, [sessionId]);

  useEffect(() => {
    if (state) applyTheme(state.theme);
  }, [state]);

  useEffect(() => {
    narrator.init();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' && !(e.target instanceof HTMLInputElement)) {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setTheme = useCallback((theme: ThemeId) => {
    hostSettings.set({ theme });
    applyTheme(theme);
    getSocket().emit('host:theme', { theme });
  }, []);

  const calibrate = useCallback(() => setCalibrating(true), []);

  if (error) {
    return (
      <div className="screen center">
        <div className="card">
          <h1>Ups!</h1>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Zacznij nowy wieczór
          </button>
        </div>
      </div>
    );
  }

  if (!state || !songs) {
    return (
      <div className="screen center">
        <p className="loading">Zapalamy świeczki…</p>
      </div>
    );
  }

  const bySlug = new Map<string, SongMeta>(songs.map((s) => [s.slug, s]));

  return (
    <div className={`screen tv-screen phase-${state.phase.toLowerCase()}`}>
      <Backdrop theme={state.theme} />
      {!connected && <div className="offline-banner">Łączenie z serwerem…</div>}

      {state.phase === 'LOBBY' && (
        <Lobby
          state={state}
          songs={songs}
          onSettings={() => setModal('settings')}
          onBook={() => setModal('book')}
        />
      )}
      {state.phase === 'VOTING' && <Voting state={state} bySlug={bySlug} />}
      {state.phase === 'REVEAL' && state.reveal && <Reveal reveal={state.reveal} bySlug={bySlug} />}
      {state.phase === 'SINGING' && state.song && (
        <Sing
          key={state.song.slug}
          slug={state.song.slug}
          mode={state.song.advanceMode}
          conductor={state.conductor}
        />
      )}
      {state.phase === 'SUMMARY' && state.summary && <Summary summary={state.summary} bySlug={bySlug} />}

      {modal === 'settings' && (
        <SettingsModal
          onClose={() => setModal(null)}
          onTheme={setTheme}
          onCalibrate={calibrate}
          onTutorial={() => setModal('tutorial')}
        />
      )}
      {modal === 'book' && <BookModal onClose={() => setModal(null)} bySlug={bySlug} />}
      {modal === 'tutorial' && <Tutorial onClose={() => setModal(null)} />}
      {welcome && !gateOpen && (
        <div className="toast" role="status">
          🎉 Założyliśmy konto „{welcome}”. Zapamiętajcie nazwę i hasło — za rok otworzą wasze rekordy!
        </div>
      )}

      {gateOpen && (
        <AudioGate
          onDone={(withMic) => {
            setGateOpen(false);
            if (withMic && mic.getSnapshot().status === 'on') setCalibrating(true);
          }}
        />
      )}
      {calibrating && <Calibration onDone={() => setCalibrating(false)} />}
    </div>
  );
}
