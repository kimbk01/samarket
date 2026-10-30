"use client";

import { ChevronRight, Phone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  NATIVE_CALL_BAR_PROBE_INTERVAL_MS,
  decideNativeCallBar,
  formatNativeCallBarDuration,
  nativeCallBarTapFollowUp,
} from "@/lib/call/native/native-active-call-bar";
import {
  bringNativeActiveCallToFrontChecked,
  isNativeBringActiveCallToFrontSupported,
  probeNativeActiveCallId,
  type NativeActiveCallProbe,
} from "@/lib/call/native/native-call-service";
import { callV4HandleRemoteTerminal } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { callV4FetchSession } from "@/lib/community-messenger/call-v4/call-v4-api";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import { CALL_DOCK_LAYER_Z_INDEX } from "@/lib/community-messenger/call-ui/call-dock-theme";
import { communityMessengerCallSessionIsLive } from "@/lib/community-messenger/types";

/** 바 높이 — 표시 중에는 <html> 의 --dibay-call-bar-h 로 상단 안전영역(--safe-top)을 늘려 화면을 바 아래로 민다. */
const NATIVE_CALL_BAR_HEIGHT_PX = 40;
const CALL_BAR_HEIGHT_VAR = "--dibay-call-bar-h";

/** 「통화 없음」으로 확정된 callId — 같은 통화는 다시 표시하지 않는다 */
const suppressedCallIds = new Set<string>();

async function reconcileEndedNativeCall(callId: string): Promise<void> {
  const session = await callV4FetchSession(callId).catch(() => null);
  if (!session) return;
  if (communityMessengerCallSessionIsLive(session.status)) return;
  logCallV4("native_call_bar_reconcile_terminal", { callId, status: session.status });
  await callV4HandleRemoteTerminal(callId, session.status, undefined, "native_call_bar_reconcile");
}

/**
 * 앱 전체 통화 바 (S1) — Android·iOS 네이티브 통화 중 앱 화면 위에 「통화 중 · 시간 · 통화 화면으로 돌아가기」.
 * 통화 유지·종료는 네이티브 소유. 이 바는 표시와 복귀 요청(bringActiveCallToFront)만 한다.
 * 설계: docs/audit/call-inapp-multitask-legacy-design-2026-10-30.md §4·§14
 */
export function NativeActiveCallBar() {
  const { safeT } = useI18n();
  const phase = useCallV4Store((s) => s.phase);
  const storeCallId = useCallV4Store((s) => s.identity?.callId ?? null);
  const connectedAt = useCallV4Store((s) => s.connectedAt);
  const [supported, setSupported] = useState(false);
  const [visible, setVisible] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const visibleRef = useRef(false);
  const tapInFlightRef = useRef(false);

  useEffect(() => {
    setSupported(isNativeBringActiveCallToFrontSupported());
  }, []);

  const callId = storeCallId?.trim() ?? "";
  const candidate = supported && phase === "connected" && callId.length > 0;

  const applyProbe = useCallback(
    (probe: NativeActiveCallProbe | null) => {
      const decision = decideNativeCallBar({
        supported,
        phase,
        storeCallId: callId,
        probe,
        wasVisible: visibleRef.current,
        suppressed: suppressedCallIds.has(callId),
      });
      visibleRef.current = decision.visible;
      setVisible(decision.visible);
      if (decision.suppressAndReconcile && callId) {
        suppressedCallIds.add(callId);
        logCallV4("native_call_bar_hidden_no_native_call", { callId, probe: probe?.kind ?? null });
        void reconcileEndedNativeCall(callId);
      }
    },
    [callId, phase, supported],
  );

  const runProbe = useCallback(async () => {
    if (!candidate) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const probe = await probeNativeActiveCallId();
    applyProbe(probe);
  }, [applyProbe, candidate]);

  // 후보가 아니면 즉시 숨김. 후보면 마운트·주기(5초, 활성 상태에서만)·앱 복귀 때 네이티브 확인.
  useEffect(() => {
    if (!candidate) {
      visibleRef.current = false;
      setVisible(false);
      return;
    }
    void runProbe();
    const timer = window.setInterval(() => void runProbe(), NATIVE_CALL_BAR_PROBE_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void runProbe();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [candidate, runProbe]);

  // 표시 중에만 상단 안전영역을 바 높이만큼 늘린다 — 헤더·탭·검색줄을 가리지 않고 아래로 밀림.
  useEffect(() => {
    if (!visible || typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty(CALL_BAR_HEIGHT_VAR, `${NATIVE_CALL_BAR_HEIGHT_PX}px`);
    return () => {
      root.style.removeProperty(CALL_BAR_HEIGHT_VAR);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [visible]);

  const onReturn = useCallback(async () => {
    if (tapInFlightRef.current || !callId) return;
    tapInFlightRef.current = true;
    try {
      const result = await bringNativeActiveCallToFrontChecked();
      logCallV4("native_call_bar_return_tapped", { callId, result });
      if (nativeCallBarTapFollowUp(result) === "probe") {
        applyProbe(await probeNativeActiveCallId());
      }
    } finally {
      tapInFlightRef.current = false;
    }
  }, [applyProbe, callId]);

  if (!visible || typeof document === "undefined") return null;

  const label = safeT("cm_ui_native_call_bar_label", { fallbackKo: "통화 중", fallbackEn: "On a call" });
  const returnLabel = safeT("cm_ui_native_call_bar_return", {
    fallbackKo: "통화 화면으로 돌아가기",
    fallbackEn: "Return to call",
  });
  const duration = formatNativeCallBarDuration(connectedAt, nowMs);

  return createPortal(
    <div
      data-native-call-bar
      style={{
        position: "fixed",
        top: "var(--safe-top-device, 0px)",
        left: 0,
        right: 0,
        height: NATIVE_CALL_BAR_HEIGHT_PX,
        zIndex: CALL_DOCK_LAYER_Z_INDEX,
      }}
    >
      <button
        type="button"
        onClick={() => void onReturn()}
        aria-label={`${label} ${duration} · ${returnLabel}`}
        className="flex h-full w-full items-center gap-2 bg-sam-primary px-4 text-left text-sam-on-primary"
      >
        {/* sam-text-* 는 회색 글자색을 함께 적용하므로 배경 대비색(text-sam-on-primary)을 각 글자에 명시 */}
        <Phone className="h-4 w-4 shrink-0 text-sam-on-primary" aria-hidden />
        <span className="shrink-0 sam-text-body-secondary font-semibold text-sam-on-primary">{label}</span>
        <span className="shrink-0 sam-text-body-secondary tabular-nums text-sam-on-primary">· {duration}</span>
        <span className="min-w-0 flex-1 truncate text-right sam-text-helper font-semibold text-sam-on-primary">
          {returnLabel}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-sam-on-primary" aria-hidden />
      </button>
    </div>,
    document.body,
  );
}
