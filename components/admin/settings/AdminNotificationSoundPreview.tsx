"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NOTIFICATION_SOUND_ASSET_PATH } from "@/lib/notifications/play-notification-sound";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = new Audio(resolvedSrc);
    a.preload = "auto";
    a.crossOrigin = "anonymous";
    audioRef.current = a;
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    const onTime = () => setCurrent(a.currentTime || 0);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnded);
    a.addEventListener("canplaythrough", onMeta);
    void a.load();
    return () => {
      a.pause();
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("canplaythrough", onMeta);
      audioRef.current = null;
    };
  }, [resolvedSrc]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    a.volume = Math.max(0, Math.min(1, volume));
    a.currentTime = 0;
    void a
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, [playing, volume]);

  return (
    <div className="flex items-center justify-end gap-2">
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
      <span className="min-w-[4.5rem] font-mono sam-text-helper tabular-nums text-sam-muted">
        {formatTime(current)} / {formatTime(duration)}
      </span>
    </div>
  );
}
