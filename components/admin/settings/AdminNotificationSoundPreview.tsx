"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NOTIFICATION_SOUND_ASSET_PATH } from "@/lib/notifications/play-notification-sound";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const BAR_COUNT = 52;

/**
 * 업로드/기본 알림음 미리듣기 — 파형 스타일 바 + 재생 시간 + 재생 버튼
 */
export function AdminNotificationSoundPreview({
  soundUrl,
  volume,
}: {
  soundUrl: string | null;
  volume: number;
}) {
  const resolvedSrc = (soundUrl?.trim() || NOTIFICATION_SOUND_ASSET_PATH).trim();
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    (async () => {
      try {
        const res = await fetch(resolvedSrc, { mode: "cors", credentials: "omit" });
        if (!res.ok) throw new Error("fetch");
        const ab = await res.arrayBuffer();
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(ab.slice(0));
        await ctx.close();
        const ch = decoded.getChannelData(0);
        const step = Math.max(1, Math.floor(ch.length / BAR_COUNT));
        const out: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          let max = 0;
          const start = i * step;
          const end = Math.min(start + step, ch.length);
          for (let j = start; j < end; j++) max = Math.max(max, Math.abs(ch[j]));
          out.push(max);
        }
        const maxPeak = Math.max(...out, 1e-6);
        if (!cancelled) setPeaks(out.map((p) => p / maxPeak));
      } catch {
        if (!cancelled) {
          setPeaks(
            Array.from({ length: BAR_COUNT }, (_, i) => 0.15 + (Math.sin(i * 0.35) + 1) * 0.18)
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedSrc]);

  useEffect(() => {
    const a = new Audio(resolvedSrc);
    a.preload = "auto";
    a.crossOrigin = "anonymous";
    audioRef.current = a;
    const onMeta = () => {
      setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    };
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
    if (a) {
      a.volume = Math.max(0, Math.min(1, volume));
    }
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

  const progress = duration > 0 ? Math.min(1, current / duration) : 0;
  const bars = peaks ?? Array(BAR_COUNT).fill(0.25);

  return (
    <div className="rounded-ui-rect border border-ui-border bg-ui-surface p-3 shadow-sm">
      <p className="mb-2 text-[12px] font-medium text-ui-fg">미리듣기</p>
      <div className="flex items-stretch gap-3">
        <button
          type="button"
          onClick={() => void toggle()}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ui-primary text-white shadow-sm transition hover:opacity-95"
          aria-label={playing ? "일시정지" : "재생"}
        >
          {playing ? (
            <span className="flex gap-0.5" aria-hidden>
              <span className="h-4 w-1 rounded-sm bg-white" />
              <span className="h-4 w-1 rounded-sm bg-white" />
            </span>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="relative">
            <div
              className="flex h-11 items-end justify-between gap-[2px] rounded-ui-rect bg-ui-page-bg px-1.5 py-1"
              aria-hidden
            >
              {bars.map((h, i) => {
                const past = i / BAR_COUNT < progress;
                return (
                  <span
                    key={i}
                    className={`min-w-[2px] flex-1 rounded-[1px] transition-colors ${
                      past ? "bg-ui-primary" : "bg-ui-border"
                    }`}
                    style={{ height: `${Math.max(12, 12 + h * 76)}%` }}
                  />
                );
              })}
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[12px] tabular-nums text-ui-muted">
            <span>{formatTime(current)}</span>
            <span className="text-ui-border">/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-ui-muted">
        {soundUrl?.trim()
          ? "위에 올린 파일 기준으로 재생합니다. 볼륨 슬라이더 값이 반영됩니다."
          : "앱 기본 알림음으로 재생합니다. 파일을 올리면 해당 음원으로 바뀝니다."}
      </p>
    </div>
  );
}
