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

  useEffect(() => {
    setDuration(null);
    setCurrent(0);
    setPlaying(false);
    clearMaxStopTimer();

    const a = new Audio(resolvedSrc);
    a.preload = "metadata";
    if (shouldUseCrossOrigin(resolvedSrc)) {
      a.crossOrigin = "anonymous";
    }
    audioRef.current = a;

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
    void a.load();

    return () => {
      clearMaxStopTimer();
      a.pause();
      a.removeEventListener("loadedmetadata", syncDuration);
      a.removeEventListener("durationchange", syncDuration);
      a.removeEventListener("canplaythrough", syncDuration);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnded);
      audioRef.current = null;
    };
  }, [clearMaxStopTimer, resolvedSrc]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      clearMaxStopTimer();
      a.pause();
      setPlaying(false);
      return;
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
  }, [clearMaxStopTimer, playing, volume]);

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
