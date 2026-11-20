"use client";

/**
 * 연락처 수동 새로고침(⟳) 공용 — SSOT v5 §19 C1·C2.
 * 친구 탭 섹션 · 「내 연락처의 DIBAY 회원」 전체 화면 · 관리 › 연락처 동기화 세 곳이 같은 버튼·같은 결과 문구를 쓴다.
 * 회전은 엔진의 수동 진행 알림(`CONTACTS_MANUAL_SYNC_EVENT`)을 따른다 — 어느 곳에서 눌러도 열린 ⟳ 가 함께 돌고 함께 멈춘다.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  CONTACTS_MANUAL_SYNC_EVENT,
  isContactsManualSyncRunning,
  type ContactsManualSyncEventDetail,
  type ContactsSyncOutcome,
} from "@/lib/community-messenger/contacts/contacts-sync-engine";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import type { MessageKey } from "@/lib/i18n/messages";

/** 수동 새로고침 결과 안내 (최종 점검 #6) — 결과마다 한 문구 */
export const CONTACTS_REFRESH_RESULT_KEY: Partial<Record<ContactsSyncOutcome, MessageKey>> = {
  uploaded: "cm_contacts_refresh_done",
  unchanged: "cm_contacts_refresh_done",
  stopped: "cm_contacts_refresh_stopped",
  throttled: "cm_contacts_refresh_limited",
  permission_needed: "cm_contacts_refresh_permission",
  permission_revoked: "cm_contacts_refresh_permission",
  failed: "cm_contacts_action_failed",
};

/** 이 회원의 수동 새로고침이 진행 중인가 — 진행 알림을 구독한다. 끝날 때 `onEnd`(결과)를 부른다 */
export function useContactsManualSyncRunning(
  userId: string,
  onEnd?: (outcome: ContactsSyncOutcome | undefined) => void
): boolean {
  const [running, setRunning] = useState(() => (userId ? isContactsManualSyncRunning(userId) : false));
  useEffect(() => {
    if (!userId) return;
    setRunning(isContactsManualSyncRunning(userId));
    const on = (e: Event) => {
      const d = (e as CustomEvent<ContactsManualSyncEventDetail>).detail;
      if (!d || d.userId !== userId) return;
      setRunning(d.running);
      if (!d.running) onEnd?.(d.outcome);
    };
    window.addEventListener(CONTACTS_MANUAL_SYNC_EVENT, on);
    return () => window.removeEventListener(CONTACTS_MANUAL_SYNC_EVENT, on);
  }, [onEnd, userId]);
  return running;
}

/** ⟳ 누름 → 새로고침 1회 → 결과 스낵바 1개 */
export function useContactsRefreshAction(refresh: () => Promise<ContactsSyncOutcome | null>): () => Promise<void> {
  const { t } = useI18n();
  return useCallback(async () => {
    const outcome = await refresh();
    const key = outcome ? CONTACTS_REFRESH_RESULT_KEY[outcome] : undefined;
    if (key) showMessengerSnackbar(t(key), outcome === "failed" ? { variant: "error" } : undefined);
  }, [refresh, t]);
}

/** ⟳ 버튼 (터치 44×44) — 진행 중 회전·비활성·aria-busy */
export function ContactsRefreshButton({
  spinning,
  disabled = false,
  onPress,
  iconClassName = "h-5 w-5",
  className = "",
  dataAttr,
}: {
  spinning: boolean;
  disabled?: boolean;
  onPress: () => void;
  iconClassName?: string;
  className?: string;
  /** 시험·계측용 표시 (예: "section" · "screen" · "settings") */
  dataAttr: string;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-label={t("cm_contacts_refresh")}
      aria-busy={spinning || undefined}
      disabled={spinning || disabled}
      onClick={onPress}
      data-cm-contacts-refresh={dataAttr}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-[color:var(--cm-chat-band)] disabled:opacity-50 ${spinning ? "disabled:opacity-100" : ""} ${className}`}
    >
      <RefreshCw className={`${iconClassName} ${spinning ? "animate-spin" : ""}`} style={{ color: "var(--cm-chat-fg)" }} aria-hidden />
    </button>
  );
}
