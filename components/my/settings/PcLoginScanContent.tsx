"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { parsePcQrLoginPayload } from "@/lib/auth/pc-qr-login/pc-qr-login-contract";
import { MYPAGE_PROFILE_HREF } from "@/lib/mypage/mypage-profile-routes";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { QR_SCANNER_BLANK_POSTER, useQrCameraScanner } from "@/lib/qr/use-qr-camera-scanner";

type Describe = {
  client: string | null;
  createdAt: string;
  geoCountry: string | null;
  geoCity: string | null;
};

type ScreenState =
  | { kind: "scanning"; notice: "invalid" | "expired" | "failed" | null }
  | { kind: "camera_denied" }
  | { kind: "checking" }
  | { kind: "confirm"; requestId: string; nonce: string; info: Describe }
  | { kind: "approving"; requestId: string; nonce: string; info: Describe }
  | { kind: "done" };

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
}

/**
 * 휴대폰 「My → 설정 → PC 로그인」 — PC 화면의 QR 을 찍고, 확인 화면에서 허용하면 PC 가 이 계정으로 로그인한다.
 * (Owner 「그래 만들어」 2026-11-08 · 설계 docs/audit/windows-qr-login-design-2026-11-08.md §1·§5)
 * 카메라·QR 읽기: 공용 `useQrCameraScanner` (getUserMedia + jsQR) — 앱 재빌드 없음. 디바이 앱(Android·iOS) 안에서만 동작.
 */
export function PcLoginScanContent() {
  const { t } = useI18n();
  const router = useRouter();
  const [isApp] = useState(() => typeof window !== "undefined" && isCapacitorNativePlatform());
  const [state, setState] = useState<ScreenState>({ kind: "scanning", notice: null });

  const handleCode = useCallback(
    async (parsed: { requestId: string; nonce: string }) => {
      // 카메라는 공용 스캐너가 "accept" 에서 끈다
      setState({ kind: "checking" });
      try {
        const qs = new URLSearchParams({ id: parsed.requestId, n: parsed.nonce });
        const res = await fetch(`/api/auth/qr-login/describe?${qs.toString()}`, {
          credentials: "include",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as ({ ok: true } & Describe) | { ok: false; errorCode?: string } | null;
        if (!json || !json.ok) {
          const expired = json && !json.ok && json.errorCode === "pc_qr_login_expired";
          setState({ kind: "scanning", notice: expired ? "expired" : "failed" });
          return;
        }
        setState({ kind: "confirm", requestId: parsed.requestId, nonce: parsed.nonce, info: json });
      } catch {
        setState({ kind: "scanning", notice: "failed" });
      }
    },
    [],
  );

  // 카메라 + QR 읽기 (scanning 상태에서만) — 공용 스캐너
  const { videoRef, canvasRef, videoReady } = useQrCameraScanner({
    active: isApp && state.kind === "scanning",
    onCode: (data) => {
      const parsed = parsePcQrLoginPayload(data);
      if (parsed) {
        void handleCode(parsed);
        return "accept";
      }
      // 디바이 PC 로그인 QR 이 아님 — 안내만 하고 계속 찍는다
      setState((prev) =>
        prev.kind === "scanning" && prev.notice !== "invalid" ? { kind: "scanning", notice: "invalid" } : prev,
      );
      return "reject";
    },
    onDenied: () => setState({ kind: "camera_denied" }),
  });

  const approve = useCallback(async () => {
    if (state.kind !== "confirm") return;
    const { requestId, nonce, info } = state;
    setState({ kind: "approving", requestId, nonce, info });
    try {
      const res = await fetch("/api/auth/qr-login/approve", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id: requestId, n: nonce }),
      });
      const json = (await res.json().catch(() => null)) as { ok: boolean; errorCode?: string } | null;
      if (json?.ok) {
        setState({ kind: "done" });
        return;
      }
      setState({ kind: "scanning", notice: json?.errorCode === "pc_qr_login_expired" ? "expired" : "failed" });
    } catch {
      setState({ kind: "scanning", notice: "failed" });
    }
  }, [state]);

  if (!isApp) {
    return <p className="px-4 py-6 sam-text-body text-sam-muted" data-testid="pc-login-app-only">{t("pc_login_app_only")}</p>;
  }

  if (state.kind === "camera_denied") {
    return (
      <div className="px-4 py-6">
        <p className="sam-text-body text-sam-fg">{t("pc_login_camera_denied")}</p>
        <button
          type="button"
          className="mt-4 w-full rounded-ui-rect border border-sam-border py-3 sam-text-body font-semibold text-sam-fg"
          onClick={() => setState({ kind: "scanning", notice: null })}
        >
          {t("pc_login_scan_again")}
        </button>
      </div>
    );
  }

  /** 허용 완료 — 「PC에 로그인되었습니다」 → [확인] → 내정보 (Owner 2026-11-08) */
  if (state.kind === "done") {
    return (
      <div className="px-4 py-10 text-center" data-testid="pc-login-done">
        <p className="sam-text-body font-semibold text-sam-fg">{t("pc_login_done")}</p>
        <button
          type="button"
          className="mt-6 w-full max-w-sm rounded-ui-rect bg-sam-primary py-3 sam-text-body font-semibold text-white"
          data-testid="pc-login-done-ok"
          onClick={() => router.push(MYPAGE_PROFILE_HREF)}
        >
          {t("pc_login_done_ok")}
        </button>
      </div>
    );
  }

  if (state.kind === "confirm" || state.kind === "approving") {
    const { info } = state;
    const location = [info.geoCity, info.geoCountry].filter(Boolean).join(", ") || t("pc_login_confirm_location_unknown");
    const device = info.client === "windows_shell" ? t("pc_login_confirm_device_windows") : t("pc_login_confirm_device_web");
    const busy = state.kind === "approving";
    return (
      <div className="px-4 py-6" data-testid="pc-login-confirm">
        <h2 className="sam-text-body font-semibold text-sam-fg">{t("pc_login_confirm_title")}</h2>
        <dl className="mt-4 divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          <div className="flex justify-between gap-3 px-4 py-3">
            <dt className="sam-text-body-secondary text-sam-muted">{t("pc_login_confirm_device")}</dt>
            <dd className="sam-text-body text-sam-fg">{device}</dd>
          </div>
          <div className="flex justify-between gap-3 px-4 py-3">
            <dt className="sam-text-body-secondary text-sam-muted">{t("pc_login_confirm_time")}</dt>
            <dd className="sam-text-body text-sam-fg">{formatTime(info.createdAt)}</dd>
          </div>
          <div className="flex justify-between gap-3 px-4 py-3">
            <dt className="sam-text-body-secondary text-sam-muted">{t("pc_login_confirm_location")}</dt>
            <dd className="sam-text-body text-sam-fg">{location}</dd>
          </div>
        </dl>
        <p className="mt-3 sam-text-body-secondary text-sam-danger">{t("pc_login_confirm_warning")}</p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={busy}
            className="flex-1 rounded-ui-rect border border-sam-border py-3 sam-text-body font-semibold text-sam-fg disabled:opacity-50"
            onClick={() => setState({ kind: "scanning", notice: null })}
          >
            {t("pc_login_cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex-1 rounded-ui-rect bg-sam-primary py-3 sam-text-body font-semibold text-white disabled:opacity-50"
            onClick={() => void approve()}
          >
            {t("pc_login_allow")}
          </button>
        </div>
      </div>
    );
  }

  const notice =
    state.kind === "scanning" && state.notice
      ? state.notice === "invalid"
        ? t("pc_login_invalid_qr")
        : state.notice === "expired"
          ? t("pc_login_expired")
          : t("pc_login_failed")
      : null;

  return (
    <div className="px-4 py-4" data-testid="pc-login-scan">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-ui-rect bg-black">
        {/* 투명 포스터 + 첫 화면 전 숨김 — WebView 회색 ▶ 아이콘 제거 (QR 스캐너 공용, 2026-11-12) */}
        <video
          ref={videoRef}
          poster={QR_SCANNER_BLANK_POSTER}
          className={`h-full w-full object-cover transition-opacity duration-200 ${videoReady ? "opacity-100" : "opacity-0"}`}
          playsInline
          muted
          autoPlay
        />
        <div className="pointer-events-none absolute inset-[18%] rounded-ui-rect border-2 border-white/80" aria-hidden />
        <canvas ref={canvasRef} className="hidden" aria-hidden />
      </div>
      <p className="mt-3 text-center sam-text-body-secondary text-sam-muted">
        {state.kind === "checking" ? "…" : t("pc_login_scan_hint")}
      </p>
      {notice ? <p className="mt-2 text-center sam-text-body-secondary text-sam-danger">{notice}</p> : null}
    </div>
  );
}
