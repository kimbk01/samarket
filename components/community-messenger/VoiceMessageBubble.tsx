"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function formatVoiceDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const PLACEHOLDER_BARS = 40;

function placeholderPeaks(): number[] {
  return Array.from({ length: PLACEHOLDER_BARS }, () => 0.12);
}

export function VoiceMessageBubble({
  src,
  durationSeconds,
  isMine,
  pending,
  waveformPeaks,
  sentTimeLabel,
  fallbackSrc,
  mediaType,
}: {
  src: string;
  durationSeconds: number;
  isMine: boolean;
  pending?: boolean;
  waveformPeaks?: number[] | null;
  sentTimeLabel?: string;
  /** API 스트림 실패 시 재생용 (공개 Storage URL 등) */
  fallbackSrc?: string | null;
  /** `<source type>` — blob/브라우저별 디코딩 안정화 */
  mediaType?: string | null;
}) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playIntentRef = useRef(false);
  const [activeSrc, setActiveSrc] = useState(src);
  const [usedFallback, setUsedFallback] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setActiveSrc(src);
    setUsedFallback(false);
    setLoadError(false);
    setPlaying(false);
    setProgress(0);
    playIntentRef.current = false;
  }, [src]);

  const bars = useMemo(() => {
    if (waveformPeaks && waveformPeaks.length > 0) return waveformPeaks;
    return placeholderPeaks();
  }, [waveformPeaks]);

  const sourceType = useMemo(() => {
    const t = (mediaType ?? "").split(";")[0]!.trim();
    if (!t) return undefined;
    if (t.startsWith("audio/")) return mediaType!.trim();
    return undefined;
  }, [mediaType]);

  /** 상대·잘못된 `src` 가 `/audio` 등으로 요청되는 것을 막음 */
  const safePlaybackSrc = useMemo(() => {
    const s = activeSrc.trim();
    if (!s) return null;
    if (s.startsWith("blob:")) return s;
    if (s.startsWith("/api/")) return s;
    if (/^https?:\/\//i.test(s)) return s;
    return null;
  }, [activeSrc]);

  const playbackBlocked = !pending && !safePlaybackSrc;

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

  const onAudioError = useCallback(() => {
    if (!usedFallback && fallbackSrc && fallbackSrc !== activeSrc && /^https?:\/\//i.test(fallbackSrc)) {
      setUsedFallback(true);
      setActiveSrc(fallbackSrc);
      setLoadError(false);
      return;
    }
    setLoadError(true);
    setPlaying(false);
  }, [activeSrc, fallbackSrc, usedFallback]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || loadError || playbackBlocked) return;
    if (playing) {
      playIntentRef.current = false;
      el.pause();
      setPlaying(false);
      return;
    }
    playIntentRef.current = true;
    void el
      .play()
      .then(() => {
        playIntentRef.current = false;
        setPlaying(true);
      })
      .catch(() => {
        playIntentRef.current = false;
        setPlaying(false);
      });
  }, [loadError, playbackBlocked, playing]);

  const onCanPlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || pending || loadError || !playIntentRef.current) return;
    void el.play().then(() => {
      playIntentRef.current = false;
      setPlaying(true);
    }).catch(() => {
      playIntentRef.current = false;
      setPlaying(false);
    });
  }, [loadError, pending]);

  const inactiveBar = isMine ? "bg-white/30" : "bg-gray-200";
  const activeBar = isMine ? "bg-white" : "bg-gray-900";

  return (
    <div className="flex min-w-[220px] max-w-[min(300px,82vw)] flex-col gap-1">
      <div className="flex items-stretch gap-2.5">
        <button
          type="button"
          onClick={toggle}
          disabled={pending || loadError || playbackBlocked}
          className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full shadow-sm transition active:scale-95 disabled:opacity-50 ${
            isMine ? "bg-white/25 text-white ring-2 ring-white/35" : "bg-gray-900 text-white ring-2 ring-gray-300"
          }`}
          aria-label={playing ? t("common_pause") : t("common_play")}
        >
          {playing ? (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg className="ml-0.5 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="flex min-h-[36px] min-w-0 flex-1 flex-col justify-center gap-1">
          <div className="flex h-8 w-full items-end justify-between gap-[1.5px]">
            {bars.map((peak, i) => {
              const t = bars.length > 1 ? i / (bars.length - 1) : 0;
              const played = progress / 100;
              const isPlayed = t <= played + 0.02;
              const h = 4 + Math.round(peak * 26);
              return (
                <div
                  key={i}
                  className={`w-[2px] shrink-0 rounded-full transition-colors duration-100 ${isPlayed ? activeBar : inactiveBar}`}
                  style={{ height: `${h}px`, maxHeight: "100%" }}
                />
              );
            })}
          </div>
          <div className={`flex items-baseline justify-between gap-2 text-[11px] leading-tight ${isMine ? "text-white/90" : "text-gray-500"}`}>
            <span className="shrink-0 tabular-nums font-medium">{formatVoiceDuration(durationSeconds)}</span>
            {sentTimeLabel ? (
              <span className="min-w-0 truncate tabular-nums opacity-80">{sentTimeLabel}</span>
            ) : null}
          </div>
        </div>
      </div>
      {safePlaybackSrc ? (
        <audio
          ref={audioRef}
          key={`${safePlaybackSrc}|${sourceType ?? ""}`}
          preload="auto"
          className="hidden"
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onError={onAudioError}
          onCanPlay={onCanPlay}
          playsInline
        >
          <source src={safePlaybackSrc} type={sourceType} />
        </audio>
      ) : null}
      {loadError || playbackBlocked ? (
        <span className={`text-[11px] ${isMine ? "text-white/85" : "text-red-600"}`}>
          {t("nav_messenger_voice_upload_failed")}
        </span>
      ) : null}
      {pending ? <span className={`text-[11px] ${isMine ? "text-white/80" : "text-gray-500"}`}>{t("common_sending")}</span> : null}
    </div>
  );
}
