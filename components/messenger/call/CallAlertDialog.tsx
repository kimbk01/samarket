"use client";

import { AlertTriangle, PhoneMissed, PhoneOff, ShieldAlert, WifiOff } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog } from "@/components/ui/dibay-overlay/DibayDialog";
import type { DibayOverlayAction } from "@/components/ui/dibay-overlay/DibayOverlayActions";
import type { CallInAppNoticeEvent } from "@/lib/community-messenger/call-ui/call-in-app-notice-contract";
import {
  useCallInAppNoticeStore,
  type CallInAppNoticeState,
} from "@/lib/community-messenger/stores/call-in-app-notice-store";
import { waitForCallInAppNoticeRedialReady } from "@/lib/community-messenger/call-ui/call-alert-redial";

/** 라우트 변경으로 닫기 — 통화 화면 종료 직후의 복귀 이동이 방금 띄운 팝업을 닫지 않도록 유예 */
const ROUTE_CHANGE_DISMISS_GRACE_MS = 1500;

function iconForEvent(event: CallInAppNoticeEvent) {
  switch (event) {
    case "peer_busy":
    case "peer_declined":
    case "self_busy":
      return PhoneOff;
    case "peer_no_answer":
      return PhoneMissed;
    case "peer_unreachable":
    case "call_disconnected":
      return WifiOff;
    case "permission_required":
      return ShieldAlert;
    default:
      return AlertTriangle;
  }
}

/**
 * 통화 실패 중앙 공통 경고 팝업 (3부 U절).
 * - 표시 전용: 닫아도 세션·화면을 다시 활성화하지 않는다(통화 store 는 이미 idle).
 * - [다시 걸기]: 이전 세션 정리 완료(canStartNewCall)를 기다린 뒤 **새 발신**만 연다.
 * - Android 하드웨어 뒤로가기는 DibayDialog(overlay back stack)이 팝업만 닫는다.
 */
export function CallAlertDialog({ current }: { current: CallInAppNoticeState }) {
  const { safeT } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const dismiss = useCallInAppNoticeStore((s) => s.dismiss);
  const [redialing, setRedialing] = useState(false);
  const shownPathRef = useRef(pathname);

  useEffect(() => {
    if (pathname === shownPathRef.current) return;
    if (Date.now() - current.shownAt < ROUTE_CHANGE_DISMISS_GRACE_MS) {
      shownPathRef.current = pathname;
      return;
    }
    dismiss(current.event);
  }, [current.event, current.shownAt, dismiss, pathname]);

  const Icon = iconForEvent(current.event);
  const closeLabel = safeT("common_close", { fallbackKo: "닫기", fallbackEn: "Close" });
  const redialLabel = safeT("cm_ui_call_alert_redial", { fallbackKo: "다시 걸기", fallbackEn: "Call again" });

  const redial = current.redial;
  const canRedial = Boolean(current.spec.retryable && redial && (redial.roomId || redial.peerUserId));

  const onRedial = async () => {
    if (!redial || redialing) return;
    setRedialing(true);
    try {
      const ready = await waitForCallInAppNoticeRedialReady();
      if (!ready) return;
      dismiss(current.event);
      const [{ launchOutgoingDirectCall }, { alertOutgoingCallFailure }] = await Promise.all([
        import("@/lib/community-messenger/call-session-navigation-seed"),
        import("@/lib/community-messenger/call-outgoing-failure-alert"),
      ]);
      const result = await launchOutgoingDirectCall(
        { roomId: redial.roomId, peerUserId: redial.peerUserId, peerLabel: redial.peerLabel, kind: redial.kind },
        router
      );
      if (!result.ok && result.userMessage) alertOutgoingCallFailure(result.userMessage);
    } finally {
      setRedialing(false);
    }
  };

  const actions: DibayOverlayAction[] = [
    { key: "close", label: closeLabel, roleTone: "secondary", onClick: () => dismiss(current.event), disabled: redialing },
  ];
  if (canRedial) {
    actions.push({
      key: "redial",
      label: redialLabel,
      roleTone: "primary",
      onClick: () => void onRedial(),
      loading: redialing,
    });
  }

  return (
    <DibayDialog
      open
      onClose={() => dismiss(current.event)}
      dismissible
      title={
        <span className="flex flex-col items-center gap-2" data-call-alert-event={current.event}>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sam-surface-muted text-sam-fg">
            <Icon className="h-6 w-6" aria-hidden />
          </span>
          <span>{current.title ?? current.message}</span>
        </span>
      }
      description={current.title ? current.message : undefined}
      actions={actions}
      actionsLayout="row"
      ariaLabel={current.title ?? current.message}
    />
  );
}
