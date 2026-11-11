"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { decodeQrFromImageFile, useQrCameraScanner } from "@/lib/qr/use-qr-camera-scanner";
import { parseFriendQrPayload } from "@/lib/community-messenger/friend-qr/friend-qr-contract";

/**
 * QR 스캔 (설계안 v3 §3.6 · 시안 C) — 앱 안 카메라(PC 로그인과 같은 공용 스캐너) + 갤러리 사진.
 * 디바이 친구 QR 이면 `onToken` — 결과 시트(시안 D)는 메신저 홈이 연다.
 */
export function FriendQrScanPanel({ onToken }: { onToken: (token: string) => void }) {
  const { t } = useI18n();
  const [notice, setNotice] = useState<"not_friend_qr" | "gallery_none" | null>(null);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : null;

  const { videoRef, canvasRef } = useQrCameraScanner({
    active: !cameraDenied && !done,
    onCode: (data) => {
      const token = parseFriendQrPayload(data, origin);
      if (!token) {
        setNotice("not_friend_qr");
        return "reject";
      }
      setDone(true);
      onToken(token);
      return "accept";
    },
    onDenied: () => setCameraDenied(true),
  });

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    const data = await decodeQrFromImageFile(file);
    if (!data) {
      setNotice("gallery_none");
      return;
    }
    const token = parseFriendQrPayload(data, origin);
    if (!token) {
      setNotice("not_friend_qr");
      return;
    }
    setNotice(null);
    onToken(token);
  };

  return (
    <div className="space-y-3" data-testid="friend-qr-scan">
      {cameraDenied ? (
        <p className="px-1 text-[length:var(--overlay-body-2-size)]" style={{ color: "var(--overlay-text-secondary)" }}>
          {t("friend_qr_camera_denied")}
        </p>
      ) : (
        <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-[length:var(--overlay-radius-md)] bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
          <div className="pointer-events-none absolute inset-[18%] rounded-ui-rect border-2 border-white/80" aria-hidden />
          <canvas ref={canvasRef} className="hidden" aria-hidden />
        </div>
      )}
      {!cameraDenied ? (
        <p className="text-center text-[length:var(--overlay-caption-size)]" style={{ color: "var(--overlay-text-secondary)" }}>
          {t("friend_qr_scan_hint")}
        </p>
      ) : null}
      {notice ? (
        <p className="text-center text-[length:var(--overlay-caption-size)]" style={{ color: "var(--overlay-danger)" }} role="status">
          {notice === "gallery_none" ? t("friend_qr_scan_gallery_none") : t("friend_qr_scan_not_friend_qr")}
        </p>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void pickImage(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="dibay-overlay-btn dibay-overlay-btn--secondary w-full"
        onClick={() => fileRef.current?.click()}
        data-testid="friend-qr-scan-gallery"
      >
        {t("friend_qr_scan_gallery")}
      </button>
    </div>
  );
}
