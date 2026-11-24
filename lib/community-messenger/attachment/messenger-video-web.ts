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
 * 첫 프레임을 canvas 로 떠서 JPEG 썸네일을 만든다. 서버로 보내기 전에 크기·길이·형식을 검사한다.
 */

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
    /* 검은 첫 프레임 회피 — 0.1초(또는 길이의 1%) 지점 */
    await seek(v, Math.min(0.1, (v.duration || 1) / 100));
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
