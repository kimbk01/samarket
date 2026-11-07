"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PC_QR_LOGIN_POLL_MS } from "@/lib/auth/pc-qr-login/pc-qr-login-contract";
import { isDibayWindowsShell } from "@/lib/platform/dibay-windows-shell";

export type PcQrLoginApproved = {
  redirectTo: string;
  signupComplete: boolean;
  needsTermsAgreement: boolean;
};

type PanelState =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "ready"; requestId: string; imageUrl: string; expiresAt: number }
  | { kind: "signing_in" }
  | { kind: "failed" };

/**
 * PC QR 로그인 — Windows 앱 로그인 화면에만 (Owner 「그래 만들어」 2026-11-08 · 설계 §1).
 * QR 을 만들고 2초마다 상태를 확인한다. 휴대폰에서 허용하면 상태 응답이 세션 쿠키를 주고, `onApproved` 로
 * 기존 로그인 완료 경로(`finishClientAuthLogin`)에 넘긴다. 2분이 지나면 새 QR. 서버가 준비되지 않았으면(표 미적용) 숨김.
 */
export function PcQrLoginPanel({
  next,
  onApproved,
  onUnavailable,
}: {
  next: string | null;
  onApproved: (input: PcQrLoginApproved) => Promise<void> | void;
  /** QR 을 만들 수 없음(서버 미준비·오류) — 로그인 화면은 기존 버튼으로 */
  onUnavailable?: () => void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<PanelState>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const onApprovedRef = useRef(onApproved);
  useEffect(() => {
    onApprovedRef.current = onApproved;
  }, [onApproved]);
  const enabled = typeof window !== "undefined" && isDibayWindowsShell();

  const startRequest = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/qr-login/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ client: "windows_shell" }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; requestId: string; qrPayload: string; expiresAt: string }
        | { ok: false; errorCode?: string }
        | null;
      if (!res.ok || !json || !json.ok) {
        setState({ kind: "hidden" });
        return;
      }
      const imageUrl = await QRCode.toDataURL(json.qrPayload, { margin: 1, width: 220, errorCorrectionLevel: "M" });
      setState({ kind: "ready", requestId: json.requestId, imageUrl, expiresAt: Date.parse(json.expiresAt) });
    } catch {
      setState({ kind: "hidden" });
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState({ kind: "hidden" });
      return;
    }
    void startRequest();
  }, [enabled, startRequest]);

  // 2초마다 상태 확인 + 남은 시간 표시
  useEffect(() => {
    if (state.kind !== "ready") return;
    let cancelled = false;
    const { requestId, expiresAt } = state;
    const tick = async () => {
      setNow(Date.now());
      if (Date.now() >= expiresAt) {
        if (!cancelled) {
          setState({ kind: "loading" });
          void startRequest();
        }
        return;
      }
      try {
        const qs = new URLSearchParams({ id: requestId });
        if (next) qs.set("next", next);
        const res = await fetch(`/api/auth/qr-login/status?${qs.toString()}`, {
          credentials: "include",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | { ok: boolean; status?: string; redirectTo?: string; signupComplete?: boolean; needsTermsAgreement?: boolean }
          | null;
        if (cancelled || !json) return;
        if (json.status === "approved" && json.ok && json.redirectTo) {
          setState({ kind: "signing_in" });
          await onApprovedRef.current({
            redirectTo: json.redirectTo,
            signupComplete: json.signupComplete === true,
            needsTermsAgreement: json.needsTermsAgreement !== false,
          });
          return;
        }
        if (json.status === "failed") {
          setState({ kind: "failed" });
          return;
        }
        if (json.status === "expired" || json.status === "consumed" || json.status === "cancelled" || json.status === "invalid") {
          setState({ kind: "loading" });
          void startRequest();
        }
      } catch {
        /* 네트워크 일시 오류 — 다음 확인에서 다시 */
      }
    };
    const timer = window.setInterval(() => void tick(), PC_QR_LOGIN_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [next, startRequest, state]);

  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);
  useEffect(() => {
    if (state.kind === "hidden" && enabled) onUnavailableRef.current?.();
  }, [enabled, state.kind]);

  if (state.kind === "hidden") return null;

  const secondsLeft = state.kind === "ready" ? Math.max(0, Math.ceil((state.expiresAt - now) / 1000)) : null;

  return (
    <section
      className="mt-5 flex flex-col items-center rounded-ui-rect border border-sam-border bg-sam-app px-4 py-4"
      data-testid="pc-qr-login-panel"
      aria-live="polite"
    >
      <h2 className="sam-text-body font-semibold text-sam-fg">{t("auth_pc_qr_title")}</h2>
      <div className="mt-3 flex h-[220px] w-[220px] items-center justify-center bg-white">
        {state.kind === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL QR (외부 이미지 아님)
          <img src={state.imageUrl} alt={t("auth_pc_qr_image_alt")} width={220} height={220} />
        ) : (
          <span className="sam-text-body-secondary text-sam-muted">…</span>
        )}
      </div>
      <p className="mt-3 text-center sam-text-body-secondary text-sam-muted">
        {state.kind === "signing_in"
          ? t("auth_pc_qr_signing_in")
          : state.kind === "failed"
            ? t("auth_pc_qr_failed")
            : t("auth_pc_qr_steps")}
      </p>
      {state.kind === "ready" && secondsLeft != null ? (
        <p className="mt-1 sam-text-xxs text-sam-muted">{t("auth_pc_qr_refresh_in", { seconds: secondsLeft })}</p>
      ) : null}
      {state.kind === "failed" ? (
        <button
          type="button"
          className="mt-3 rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body font-semibold text-sam-fg"
          onClick={() => {
            setState({ kind: "loading" });
            void startRequest();
          }}
        >
          {t("auth_pc_qr_new")}
        </button>
      ) : null}
    </section>
  );
}
