"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function formatVoiceDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function VoiceMessageBubble({
  src,
  durationSeconds,
  isMine,
  pending,
}: {
  src: string;
  durationSeconds: number;
  isMine: boolean;
  pending?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const onTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    setProgress((el.currentTime / el.duration) * 100);
  }, []);

  const onEnded = useCallback(() => {
    setPlaying(false);
    setProgress(0);
    const el = audioRef.current;
    if (el) el.currentTime = 0;
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    setPlaying(false);
    setProgress(0);
    setLoadError(false);
  }, [src]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || loadError) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    void el.play().then(
      () => setPlaying(true),
      () => setPlaying(false)
    );
  }, [loadError, playing]);

  const barClass = isMine ? "bg-white/35" : "bg-gray-200";
  const fillClass = isMine ? "bg-white" : "bg-[#06C755]";

  return (
    <div className="flex min-w-[200px] max-w-[min(280px,78vw)] flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={pending || loadError}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-50 ${
            isMine ? "bg-white/20 text-white" : "bg-[#06C755]/15 text-[#06C755]"
          }`}
          aria-label={playing ? "일시정지" : "재생"}
        >
          {playing ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg className="ml-0.5 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className={`h-1.5 w-full overflow-hidden rounded-full ${barClass}`}>
            <div className={`h-full rounded-full transition-[width] duration-100 ${fillClass}`} style={{ width: `${progress}%` }} />
          </div>
        </div>
        <span className={`shrink-0 tabular-nums text-[12px] font-medium ${isMine ? "text-white/90" : "text-gray-600"}`}>
          {formatVoiceDuration(durationSeconds)}
        </span>
      </div>
      <audio
        ref={audioRef}
        key={src}
        src={src}
        preload="auto"
        className="hidden"
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onError={() => setLoadError(true)}
        playsInline
      />
      {loadError ? (
        <span className={`text-[11px] ${isMine ? "text-white/85" : "text-red-600"}`}>
          재생할 수 없습니다. 새로고침 후 다시 시도해 주세요.
        </span>
      ) : null}
      {pending ? <span className={`text-[11px] ${isMine ? "text-white/80" : "text-gray-500"}`}>전송 중</span> : null}
    </div>
  );
}
