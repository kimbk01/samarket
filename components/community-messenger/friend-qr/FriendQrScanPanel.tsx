"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { decodeQrFromImageFile, QR_SCANNER_BLANK_POSTER, useQrCameraScanner } from "@/lib/qr/use-qr-camera-scanner";

/** 카메라 칸 최대 한 변 — 시트(88dvh) − 머리·탭 78px − 안내·버튼·여백 159px − 하단 안전 영역 (Xiaomi 601px 실측으로 계산·적용 확인) */
const FRIEND_QR_CAMERA_MAX_SIDE = "min(320px, calc(88dvh - 237px - max(1rem, var(--kb-safe-bottom))))";
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

  const { videoRef, canvasRef, videoReady } = useQrCameraScanner({
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
        /**
         * 카메라 칸 — 한 변 = min(320px, 화면에 시트가 다 들어가는 크기). 작은 화면(가로 태블릿 601px 등)에서도
         * [갤러리에서 선택]까지 기기 하단 안전 영역 위에 보이게 (Xiaomi 실측 2026-11-12: 시트 본문 451px, 카메라 외 184px).
         * 첫 화면이 재생되기 전에는 영상을 숨기고(투명 포스터 — WebView 회색 ▶ 아이콘 제거) 「카메라를 켜는 중이에요」.
         */
        <div
          className="relative mx-auto aspect-square w-full overflow-hidden rounded-[length:var(--overlay-radius-md)] bg-black"
          style={{ maxWidth: FRIEND_QR_CAMERA_MAX_SIDE }}
        >
          <video
            ref={videoRef}
            poster={QR_SCANNER_BLANK_POSTER}
            className={`h-full w-full object-cover transition-opacity duration-200 ${videoReady ? "opacity-100" : "opacity-0"}`}
            playsInline
            muted
            autoPlay
          />
          {!videoReady ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80" role="status">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white/90" aria-hidden />
              <span className="text-[length:var(--overlay-caption-size)]">{t("friend_qr_camera_starting")}</span>
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-[18%] rounded-ui-rect border-2 border-white/80" aria-hidden />
          <canvas ref={canvasRef} className="hidden" aria-hidden />
        </div>
      )}
      {/** 안내 한 줄 — 알림(친구 QR 아님·사진에 QR 없음)은 같은 자리에 바꿔 보인다(줄이 늘어 시트가 넘치지 않게) */}
      {notice ? (
        <p className="text-center text-[length:var(--overlay-caption-size)]" style={{ color: "var(--overlay-danger)" }} role="status">
          {notice === "gallery_none" ? t("friend_qr_scan_gallery_none") : t("friend_qr_scan_not_friend_qr")}
        </p>
      ) : !cameraDenied ? (
        <p className="text-center text-[length:var(--overlay-caption-size)]" style={{ color: "var(--overlay-text-secondary)" }}>
          {t("friend_qr_scan_hint")}
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
