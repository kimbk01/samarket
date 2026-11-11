"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/**
 * 카메라 QR 읽기 공용 부품 (PC 로그인 스캐너·친구 QR 스캔 — 설계안 v3 §3.6).
 * 카메라: getUserMedia(뒤 카메라) — 앱 재빌드 없음. QR 읽기: jsQR, 250ms 간격.
 * `onCode` 가 "accept" 면 읽기를 멈추고 카메라를 끈다. "reject" 면 1초 뒤 다시 읽는다.
 *
 * QR 친구 재감사 (2026-11-12):
 * - Q7 앱이 백그라운드로 가거나 화면이 꺼지면(문서 hidden) 카메라를 끄고, 돌아오면 다시 켠다.
 * - Q8 해독은 화면에 보이는 가운데 정사각형(두 스캐너 모두 `aspect-square` + `object-cover`)만, 최대 640px 로 줄여서.
 *   캔버스 크기는 바뀔 때만 다시 정한다(매번 넣으면 버퍼를 새로 만든다).
 */
const SCAN_INTERVAL_MS = 250;
const REJECT_RETRY_MS = 1_000;
/** 해독 이미지 한 변 최대 — QR 한 칸이 화면에서 보일 크기면 640 으로 충분 */
const DECODE_MAX_SIDE = 640;

export type QrCodeDecision = "accept" | "reject";

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

export function useQrCameraScanner(opts: {
  active: boolean;
  onCode: (data: string) => QrCodeDecision;
  onDenied: () => void;
}) {
  const visible = useDocumentVisible();
  /** 읽기 성공(accept) 뒤에는 화면이 다시 보여도 카메라를 다시 켜지 않는다 — 호출처가 active 를 바꿀 때만 초기화 */
  const [accepted, setAccepted] = useState(false);
  useEffect(() => {
    setAccepted(false);
  }, [opts.active]);
  const active = opts.active && visible && !accepted;
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
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            const side = Math.min(vw, vh);
            const out = Math.min(side, DECODE_MAX_SIDE);
            if (canvas.width !== out || canvas.height !== out) {
              canvas.width = out;
              canvas.height = out;
            }
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, out, out);
              const image = ctx.getImageData(0, 0, out, out);
              const code = jsQR(image.data, out, out, { inversionAttempts: "dontInvert" });
              if (code?.data) {
                if (onCodeRef.current(code.data) === "accept") {
                  stop();
                  setAccepted(true);
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
