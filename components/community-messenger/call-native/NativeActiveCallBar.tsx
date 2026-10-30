"use client";

import { Phone } from "lucide-react";
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
import { CALL_DOCK_LAYER_Z_INDEX, CALL_DOCK_MAX_WIDTH_PX } from "@/lib/community-messenger/call-ui/call-dock-theme";
import { communityMessengerCallSessionIsLive } from "@/lib/community-messenger/types";

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
        top: "calc(var(--safe-top, 0px) + var(--sector-header-h, 52px) + 6px)",
        left: 12,
        right: 12,
        maxWidth: CALL_DOCK_MAX_WIDTH_PX,
        marginLeft: "auto",
        marginRight: "auto",
        zIndex: CALL_DOCK_LAYER_Z_INDEX,
      }}
    >
      <button
        type="button"
        onClick={() => void onReturn()}
        aria-label={`${label} ${duration} · ${returnLabel}`}
        className="flex w-full items-center gap-2 rounded-ui-rect bg-sam-primary px-3 py-2 text-left text-sam-on-primary shadow-sam-elevated"
      >
        <Phone className="h-4 w-4 shrink-0" aria-hidden />
        <span className="shrink-0 sam-text-body-secondary font-semibold">{label}</span>
        <span className="shrink-0 sam-text-body-secondary tabular-nums">· {duration}</span>
        <span className="min-w-0 flex-1 truncate text-right sam-text-helper font-semibold">{returnLabel}</span>
      </button>
    </div>,
    document.body,
  );
}
