"use client";

import {
  MESSENGER_VIDEO_THUMB_MAX_BYTES,
  MESSENGER_VIDEO_THUMB_MAX_LONG_EDGE_PX,
  messengerVideoExtFor,
  precheckMessengerVideo,
  type MessengerVideoExt,
  type MessengerVideoPrecheckError,
} from "@/lib/community-messenger/upload/messenger-video-upload-policy";

/**
 * 웹 대체 경로(설계 §3-7 · O4) — 압축 없이 고른 파일 그대로. 브라우저 `<video>` 로 길이·크기를 읽고
 * 어둡지 않은 첫 장면을 canvas 로 떠서 JPEG 썸네일을 만든다. 서버로 보내기 전에 크기·길이·형식을 검사한다.
 * 장면 고르기: docs/audit/messenger-video-thumbnail-black-frame-design-2026-11-25.md §4-1 (네이티브와 같은 규칙).
 */

/** 이 밝기(0~255) 이상이면 「어둡지 않은 장면」 */
export const MESSENGER_VIDEO_THUMB_MIN_LUMA = 24;

/** 후보 시점(초): 0.1 → 1 → 길이 10% → 길이 50%. 길이를 넘는 시점·중복은 뺀다. */
export function messengerVideoThumbCandidateTimes(durationSec: number): number[] {
  const d = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const out: number[] = [];
  for (const t of [Math.min(0.1, d / 100), 1, d * 0.1, d * 0.5]) {
    if (t < 0 || (d > 0 ? t >= d : t !== 0)) continue;
    if (!out.some((x) => Math.abs(x - t) < 0.05)) out.push(t);
  }
  return out.length > 0 ? out : [0];
}

/** RGBA 픽셀 평균 밝기(0~255) */
export function messengerVideoAverageLuma(rgba: ArrayLike<number>): number {
  const n = Math.floor(rgba.length / 4);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return sum / n;
}

/**
 * 후보 시점을 차례로 보고 어둡지 않은 첫 장면을 고른다. 모두 어두우면 가장 밝은 장면.
 * `measure(t)` 는 그 시점으로 옮겨 밝기를 재고, 못 재면 null.
 */
export async function pickMessengerVideoThumbTime(
  durationSec: number,
  measure: (t: number) => Promise<number | null>
): Promise<number | null> {
  let best: { t: number; luma: number } | null = null;
  for (const t of messengerVideoThumbCandidateTimes(durationSec)) {
    const luma = await measure(t);
    if (luma == null) continue;
    if (luma >= MESSENGER_VIDEO_THUMB_MIN_LUMA) return t;
    if (!best || luma > best.luma) best = { t, luma };
  }
  return best ? best.t : null;
}

export type MessengerWebVideo = {
  kind: "web";
  file: File;
  ext: MessengerVideoExt;
  durationMs: number;
  width: number | null;
  height: number | null;
  thumb: Blob;
  /** 말풍선·선택 줄 미리보기(blob:) — 주인이 해제한다 */
  thumbUrl: string;
};

const META_TIMEOUT_MS = 15_000;

function loadVideoElement(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    const timer = window.setTimeout(() => reject(new Error("video_meta_timeout")), META_TIMEOUT_MS);
    v.onloadeddata = () => {
      window.clearTimeout(timer);
      resolve(v);
    };
    v.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("video_meta_error"));
    };
    v.src = url;
    v.load();
  });
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      resolve();
    };
    v.addEventListener("seeked", done);
    try {
      v.currentTime = t;
    } catch {
      resolve();
    }
    window.setTimeout(done, 3_000);
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

function measureFrameLuma(v: HTMLVideoElement): number | null {
  if (!(v.videoWidth > 0 && v.videoHeight > 0)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(v, 0, 0, 16, 16);
    return messengerVideoAverageLuma(ctx.getImageData(0, 0, 16, 16).data);
  } catch {
    return null;
  }
}

async function captureThumb(v: HTMLVideoElement): Promise<Blob | null> {
  const w = v.videoWidth;
  const h = v.videoHeight;
  if (!(w > 0 && h > 0)) return null;
  const scale = Math.min(1, MESSENGER_VIDEO_THUMB_MAX_LONG_EDGE_PX / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
  for (const q of [0.8, 0.6, 0.4]) {
    const blob = await canvasToJpeg(canvas, q);
    if (blob && blob.size > 0 && blob.size <= MESSENGER_VIDEO_THUMB_MAX_BYTES) return blob;
  }
  return null;
}

export type ReadMessengerWebVideoResult =
  | { ok: true; video: MessengerWebVideo }
  | { ok: false; error: MessengerVideoPrecheckError | "video_read_failed" };

export async function readMessengerWebVideo(file: File): Promise<ReadMessengerWebVideoResult> {
  const ext = messengerVideoExtFor({ name: file.name, mime: file.type });
  const pre = precheckMessengerVideo({ bytes: file.size, durationMs: null, ext });
  if (!pre.ok) return { ok: false, error: pre.error };
  const url = URL.createObjectURL(file);
  try {
    const v = await loadVideoElement(url);
    const durationMs = Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : NaN;
    const withDuration = precheckMessengerVideo({ bytes: file.size, durationMs, ext });
    if (!withDuration.ok) return { ok: false, error: withDuration.error };
    /* 어둡지 않은 첫 장면 — 후보 시점마다 seek 1회(각 3초 제한) */
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    let current: number | null = null;
    const picked = await pickMessengerVideoThumbTime(dur, async (t) => {
      await seek(v, t);
      current = t;
      return measureFrameLuma(v);
    });
    const target = picked ?? messengerVideoThumbCandidateTimes(dur)[0];
    if (current !== target) await seek(v, target);
    const thumb = await captureThumb(v);
    v.removeAttribute("src");
    v.load();
    if (!thumb) return { ok: false, error: "video_read_failed" };
    return {
      ok: true,
      video: {
        kind: "web",
        file,
        ext: withDuration.ext,
        durationMs,
        width: v.videoWidth > 0 ? v.videoWidth : null,
        height: v.videoHeight > 0 ? v.videoHeight : null,
        thumb,
        thumbUrl: URL.createObjectURL(thumb),
      },
    };
  } catch {
    return { ok: false, error: "video_read_failed" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function isMessengerVideoFile(file: { type?: string; name?: string }): boolean {
  return messengerVideoExtFor({ name: file.name ?? "", mime: file.type ?? "" }) != null || String(file.type ?? "").startsWith("video/");
}
