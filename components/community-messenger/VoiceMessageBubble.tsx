"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  COMMUNITY_MESSENGER_VOICE_PLAY_EVENT,
  dispatchCommunityMessengerVoicePlay,
} from "@/lib/community-messenger/voice-playback-bus";

function formatVoiceDuration(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const PLAYBACK_RATES = [1, 1.5, 2] as const;

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
  /** 밝은색(시안) 발신 말풍선 — Viber 등 */
  mineBubbleStyle = "signature",
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
  mineBubbleStyle?: "signature" | "viberLight";
}) {
  const { t } = useI18n();
  const instanceId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const playIntentRef = useRef(false);
  const [activeSrc, setActiveSrc] = useState(src);
  const [usedFallback, setUsedFallback] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [rateIdx, setRateIdx] = useState(0);
  const playbackRate = PLAYBACK_RATES[rateIdx] ?? 1;

  useEffect(() => {
    setActiveSrc(src);
    setUsedFallback(false);
    setLoadError(false);
    setPlaying(false);
    setProgress(0);
    setRemainingSec(null);
    playIntentRef.current = false;
    setRateIdx(0);
  }, [src]);

  const pauseSelf = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    }
    playIntentRef.current = false;
    setPlaying(false);
    setRemainingSec(null);
  }, []);

  useEffect(() => {
    const onOtherPlay = (ev: Event) => {
      const id = (ev as CustomEvent<{ id?: string }>).detail?.id;
      if (id && id !== instanceId) pauseSelf();
    };
    window.addEventListener(COMMUNITY_MESSENGER_VOICE_PLAY_EVENT, onOtherPlay);
    return () => window.removeEventListener(COMMUNITY_MESSENGER_VOICE_PLAY_EVENT, onOtherPlay);
  }, [instanceId, pauseSelf]);

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

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.playbackRate = playbackRate;
  }, [playbackRate, safePlaybackSrc]);

  const onTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    setProgress((el.currentTime / el.duration) * 100);
    setRemainingSec(Math.max(0, el.duration - el.currentTime));
  }, []);

  const onEnded = useCallback(() => {
    setPlaying(false);
    setProgress(0);
    setRemainingSec(null);
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

  const seekFromClientX = useCallback((clientX: number) => {
    const el = audioRef.current;
    const wrap = waveformRef.current;
    if (!el || !wrap || loadError || playbackBlocked) return;
    if (!Number.isFinite(el.duration) || el.duration <= 0) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    el.currentTime = ratio * el.duration;
    setProgress(ratio * 100);
    setRemainingSec(Math.max(0, el.duration - el.currentTime));
  }, [loadError, playbackBlocked]);

  const onWaveformPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== undefined && e.button !== 0) return;
      seekFromClientX(e.clientX);
    },
    [seekFromClientX]
  );

  const cyclePlaybackRate = useCallback((e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setRateIdx((i) => (i + 1) % PLAYBACK_RATES.length);
  }, []);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || loadError || playbackBlocked) return;
    if (playing) {
      playIntentRef.current = false;
      el.pause();
      setPlaying(false);
      setRemainingSec(null);
      return;
    }
    playIntentRef.current = true;
    dispatchCommunityMessengerVoicePlay(instanceId);
    el.playbackRate = playbackRate;
    void el
      .play()
      .then(() => {
        playIntentRef.current = false;
        setPlaying(true);
        if (Number.isFinite(el.duration) && el.duration > 0) {
          setRemainingSec(Math.max(0, el.duration - el.currentTime));
        }
      })
      .catch(() => {
        playIntentRef.current = false;
        setPlaying(false);
        setRemainingSec(null);
      });
  }, [instanceId, loadError, playbackBlocked, playbackRate, playing]);

  const onCanPlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || loadError || !playIntentRef.current) return;
    el.playbackRate = playbackRate;
    void el
      .play()
      .then(() => {
        playIntentRef.current = false;
        setPlaying(true);
        if (Number.isFinite(el.duration) && el.duration > 0) {
          setRemainingSec(Math.max(0, el.duration - el.currentTime));
        }
      })
      .catch(() => {
        playIntentRef.current = false;
        setPlaying(false);
        setRemainingSec(null);
      });
  }, [loadError, playbackRate]);

  const mineLight = isMine && mineBubbleStyle === "viberLight";
  const inactiveBar = isMine ? (mineLight ? "bg-sam-surface/35" : "bg-sam-surface/30") : "bg-sam-border-soft";
  const activeBar = isMine ? (mineLight ? "bg-[color:var(--cm-room-primary)]" : "bg-sam-surface") : "bg-sam-ink";

  const durationLabelSec =
    playing && remainingSec != null && Number.isFinite(remainingSec) ? remainingSec : Math.max(0, durationSeconds);

  return (
    <div className="flex min-w-[220px] max-w-[min(300px,82vw)] flex-col gap-1">
      <div className="flex items-stretch gap-2.5">
        <button
          type="button"
          onClick={toggle}
          disabled={loadError || playbackBlocked}
          className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full shadow-sm transition active:scale-95 disabled:opacity-50 ${
            isMine
              ? mineLight
                ? "bg-sam-surface/25 text-white ring-2 ring-sam-surface/40"
                : "bg-sam-surface/25 text-white ring-2 ring-sam-surface/35"
              : "bg-sam-ink text-white ring-2 ring-sam-border"
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
          <div
            ref={waveformRef}
            className="flex h-8 w-full cursor-pointer touch-none select-none items-end justify-between gap-[1.5px]"
            onPointerDown={onWaveformPointerDown}
            role="slider"
            tabIndex={0}
            aria-label={t("nav_messenger_voice_waveform_seek")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            onKeyDown={(e) => {
              const el = audioRef.current;
              if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                el.currentTime = Math.max(0, el.currentTime - Math.min(3, el.duration * 0.05));
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                el.currentTime = Math.min(el.duration, el.currentTime + Math.min(3, el.duration * 0.05));
              }
            }}
          >
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
          <div
            className={`flex items-baseline justify-between gap-2 sam-text-xxs leading-tight ${
              isMine ? (mineLight ? "text-white/85" : "text-white/90") : "text-sam-muted"
            }`}
          >
            <span className="flex min-w-0 items-baseline gap-1.5 tabular-nums">
              <span className="shrink-0 font-medium">{formatVoiceDuration(durationLabelSec)}</span>
              {safePlaybackSrc && !loadError ? (
                <button
                  type="button"
                  onClick={cyclePlaybackRate}
                  className={`shrink-0 rounded px-1 py-0 sam-text-xxs font-semibold uppercase tracking-wide ${
                    isMine
                      ? mineLight
                        ? "bg-sam-surface/20 text-white hover:bg-sam-surface/30"
                        : "bg-sam-surface/20 text-white hover:bg-sam-surface/30"
                      : "bg-sam-border-soft text-sam-fg hover:bg-sam-border"
                  }`}
                  aria-label={t("nav_messenger_voice_playback_rate")}
                >
                  {playbackRate === 1 ? "1×" : playbackRate === 1.5 ? "1.5×" : "2×"}
                </button>
              ) : null}
            </span>
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
        <span className={`sam-text-xxs ${isMine ? (mineLight ? "text-red-600" : "text-white/85") : "text-red-600"}`}>
          {t("nav_messenger_voice_upload_failed")}
        </span>
      ) : null}
      {pending ? (
        <span className={`sam-text-xxs ${isMine ? (mineLight ? "text-sam-muted" : "text-white/80") : "text-sam-muted"}`}>
          {t("common_sending")}
        </span>
      ) : null}
    </div>
  );
}
