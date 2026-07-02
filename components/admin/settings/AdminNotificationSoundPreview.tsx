"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NOTIFICATION_SOUND_ASSET_PATH } from "@/lib/notifications/play-notification-sound";
import { NOTIFICATION_SOUND_MAX_PLAY_SEC } from "@/lib/notifications/notification-sound-engine";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function resolveDuration(audio: HTMLAudioElement): number | null {
  const d = audio.duration;
  if (Number.isFinite(d) && d > 0) return d;
  return null;
}

function shouldUseCrossOrigin(src: string): boolean {
  if (typeof window === "undefined") return false;
  if (src.startsWith("/") || src.startsWith("blob:") || src.startsWith("data:")) return false;
  try {
    const u = new URL(src, window.location.href);
    return u.origin !== window.location.origin;
  } catch {
    return false;
  }
}

function absoluteAudioSrc(src: string): string {
  try {
    return new URL(src, window.location.href).href;
  } catch {
    return src;
  }
}

function audioSrcMatches(audio: HTMLAudioElement, src: string): boolean {
  if (!audio.src) return false;
  try {
    return new URL(audio.src).href === absoluteAudioSrc(src);
  } catch {
    return false;
  }
}

export function AdminNotificationSoundPreview({
  soundUrl,
  volume,
}: {
  soundUrl: string | null;
  volume: number;
}) {
  const { t } = useI18n();
  const resolvedSrc = (soundUrl?.trim() || NOTIFICATION_SOUND_ASSET_PATH).trim();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listenersCleanupRef = useRef<(() => void) | null>(null);
  const maxStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  const clearMaxStopTimer = useCallback(() => {
    if (maxStopTimerRef.current) {
      clearTimeout(maxStopTimerRef.current);
      maxStopTimerRef.current = null;
    }
  }, []);

  const detachListeners = useCallback(() => {
    listenersCleanupRef.current?.();
    listenersCleanupRef.current = null;
  }, []);

  const releaseAudio = useCallback(() => {
    clearMaxStopTimer();
    detachListeners();
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    a.removeAttribute("src");
    void a.load();
    audioRef.current = null;
  }, [clearMaxStopTimer, detachListeners]);

  const attachListeners = useCallback(
    (a: HTMLAudioElement) => {
      detachListeners();

      const syncDuration = () => {
        const d = resolveDuration(a);
        if (d != null) setDuration(d);
      };

      const onTime = () => {
        const tSec = a.currentTime || 0;
        setCurrent(Math.min(tSec, NOTIFICATION_SOUND_MAX_PLAY_SEC));
      };
      const onEnded = () => {
        clearMaxStopTimer();
        setPlaying(false);
        setCurrent(0);
      };

      a.addEventListener("loadedmetadata", syncDuration);
      a.addEventListener("durationchange", syncDuration);
      a.addEventListener("canplaythrough", syncDuration);
      a.addEventListener("timeupdate", onTime);
      a.addEventListener("ended", onEnded);

      listenersCleanupRef.current = () => {
        a.removeEventListener("loadedmetadata", syncDuration);
        a.removeEventListener("durationchange", syncDuration);
        a.removeEventListener("canplaythrough", syncDuration);
        a.removeEventListener("timeupdate", onTime);
        a.removeEventListener("ended", onEnded);
      };
    },
    [clearMaxStopTimer, detachListeners]
  );

  useEffect(() => {
    releaseAudio();
    setDuration(null);
    setCurrent(0);
    setPlaying(false);
  }, [releaseAudio, resolvedSrc]);

  useEffect(() => {
    return () => {
      releaseAudio();
    };
  }, [releaseAudio]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  const toggle = useCallback(() => {
    if (playing) {
      clearMaxStopTimer();
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }

    let a = audioRef.current;
    if (!a || !audioSrcMatches(a, resolvedSrc)) {
      releaseAudio();
      a = new Audio();
      a.preload = "none";
      if (shouldUseCrossOrigin(resolvedSrc)) {
        a.crossOrigin = "anonymous";
      }
      a.src = resolvedSrc;
      attachListeners(a);
      audioRef.current = a;
    }

    clearMaxStopTimer();
    a.volume = Math.max(0, Math.min(1, volume));
    a.currentTime = 0;
    setCurrent(0);
    void a
      .play()
      .then(() => {
        setPlaying(true);
        const d = resolveDuration(a);
        if (d != null) setDuration(d);
        maxStopTimerRef.current = setTimeout(() => {
          a.pause();
          a.currentTime = 0;
          setPlaying(false);
          setCurrent(0);
          maxStopTimerRef.current = null;
        }, NOTIFICATION_SOUND_MAX_PLAY_SEC * 1000);
      })
      .catch(() => setPlaying(false));
  }, [attachListeners, clearMaxStopTimer, playing, releaseAudio, resolvedSrc, volume]);

  const fileDurationLabel =
    duration != null ? formatTime(duration) : t("admin_notif_sound_preview_duration_unknown");
  const maxLabel = formatTime(NOTIFICATION_SOUND_MAX_PLAY_SEC);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={() => void toggle()}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-app"
        aria-label={playing ? t("common_pause") : t("common_play")}
      >
        {playing ? (
          <span className="flex gap-0.5" aria-hidden>
            <span className="h-3 w-0.5 rounded-sm bg-sam-fg" />
            <span className="h-3 w-0.5 rounded-sm bg-sam-fg" />
          </span>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <span className="shrink-0 font-mono sam-text-helper tabular-nums text-sam-muted">
        {formatTime(current)} / {fileDurationLabel}
      </span>
      <span className="sam-text-helper text-sam-muted">
        ({t("admin_notif_sound_preview_max")} {maxLabel})
      </span>
    </div>
  );
}
