"use client";

import { useCallback, useEffect, useRef } from "react";
import jsQR from "jsqr";

/**
 * 카메라 QR 읽기 공용 부품 (PC 로그인 스캐너에서 분리 — 설계안 v3 §3.6).
 * 카메라: getUserMedia(뒤 카메라) — 앱 재빌드 없음. QR 읽기: jsQR, 250ms 간격.
 * `onCode` 가 "accept" 면 읽기를 멈추고 카메라를 끈다. "reject" 면 1초 뒤 다시 읽는다.
 */
const SCAN_INTERVAL_MS = 250;
const REJECT_RETRY_MS = 1_000;

export type QrCodeDecision = "accept" | "reject";

export function useQrCameraScanner(opts: {
  active: boolean;
  onCode: (data: string) => QrCodeDecision;
  onDenied: () => void;
}) {
  const { active } = opts;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onCodeRef = useRef(opts.onCode);
  const onDeniedRef = useRef(opts.onDenied);
  onCodeRef.current = opts.onCode;
  onDeniedRef.current = opts.onDenied;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    /** 영상 연결도 비운다 (재감사 L3) */
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer = 0;
    const run = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          /** 영상 칸이 없으면 켠 카메라를 바로 끈다 (재감사 L3) */
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          return;
        }
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        const scan = () => {
          if (cancelled) return;
          const canvas = canvasRef.current;
          if (video.readyState >= 2 && canvas && video.videoWidth > 0) {
            const w = video.videoWidth;
            const h = video.videoHeight;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, w, h);
              const image = ctx.getImageData(0, 0, w, h);
              const code = jsQR(image.data, w, h, { inversionAttempts: "dontInvert" });
              if (code?.data) {
                if (onCodeRef.current(code.data) === "accept") {
                  stop();
                  return;
                }
                timer = window.setTimeout(scan, REJECT_RETRY_MS);
                return;
              }
            }
          }
          timer = window.setTimeout(scan, SCAN_INTERVAL_MS);
        };
        scan();
      } catch {
        if (!cancelled) onDeniedRef.current();
      }
    };
    void run();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stop();
    };
  }, [active, stop]);

  return { videoRef, canvasRef, stop };
}

/** 갤러리 이미지에서 QR 읽기 — 사진은 밝기가 뒤집힌 경우도 있어 양쪽 모두 시도. 없으면 null */
export async function decodeQrFromImageFile(file: Blob): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image_load_failed"));
      el.src = url;
    });
    const max = 1600;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
    return code?.data ?? null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
