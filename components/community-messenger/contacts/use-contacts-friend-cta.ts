"use client";

import { useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMessengerFriendActions } from "@/components/community-messenger/friend-cta/messenger-friend-actions-context";
import {
  communityMessengerFriendRequestFailureMessage,
  postCommunityMessengerFriendRequestApi,
} from "@/lib/community-messenger/community-messenger-friend-request-client";
import { useIncomingFriendRequestPopupStore } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { contactsApi } from "@/lib/community-messenger/contacts/contacts-api-client";
import type { ContactsMemberRow } from "@/lib/community-messenger/contacts/contacts-contract";

export type ContactsRequestState = "none" | "sent" | "received";

/**
 * 연락처 회원 친구 버튼 (친구 추가 · 수락) — 메신저 친구 요청 SSOT 를 그대로 쓴다.
 * - 메신저 홈 안(친구 탭 섹션): 홈의 친구 행동(`MessengerFriendActionsProvider`)으로 보낸다 →
 *   받은 요청 카드·친구 목록·요청 팝업·친구 수가 같은 처리에서 함께 바뀐다 (최종 점검 N1).
 *   상태(요청됨·수락·이미 친구)도 홈의 실시간 값을 우선한다.
 * - 홈 밖(연락처 전체 화면): 같은 서버 경로(친구 요청 보내기 · 요청자 기준 수락)를 부르고 요청 팝업을 정리한다.
 *   홈은 다시 들어올 때 목록을 맞춘다 (방 화면 수락과 같은 방식).
 */
export function useContactsFriendCta(fallbackAccept: (requesterId: string) => Promise<{ ok: boolean; error?: string }>) {
  const { t } = useI18n();
  const home = useMessengerFriendActions();

  /**
   * 홈 데이터를 받은 뒤(`viewerUserId` 있음)에는 홈의 실시간 요청 상태 기준 — 홈에서 거절·취소한 요청도 바로 반영.
   * 홈을 아직 못 받았거나 홈 밖이면 목록 응답 기준 (빈 값으로 서버 상태를 지우지 않음 — 최종 점검 #22).
   */
  const homeLoaded = Boolean(home?.viewerUserId);
  const requestStateOf = useCallback(
    (m: ContactsMemberRow): ContactsRequestState => {
      if (!home || !homeLoaded) return m.request_state;
      if (home.pendingSets.incomingPendingByPeerId.has(m.user_id)) return "received";
      if (home.pendingSets.outgoingPendingPeerIds.has(m.user_id)) return "sent";
      return "none";
    },
    [home, homeLoaded]
  );

  /**
   * 홈에서 방금 바뀐 관계는 연락처 목록에서 바로 뺀다 (§5-5 — 서버 목록은 다음 조회에서 같은 결과):
   * 친구가 됨(수락) · 대화·통화 불가(내가 차단 ∪ 내 요청을 거절) — 최종 점검 #5.
   */
  const isGoneNow = useCallback(
    (m: ContactsMemberRow): boolean =>
      Boolean(home?.friendIds?.has(m.user_id) || home?.unavailablePeerIds?.has(m.user_id) || home?.blockedByMePeerIds?.has(m.user_id)),
    [home]
  );

  const addFriend = useCallback(
    async (m: ContactsMemberRow): Promise<boolean> => {
      if (home) return (await home.onSend(m.user_id, "contacts")) === true;
      const r = await postCommunityMessengerFriendRequestApi(m.user_id, undefined, "contacts");
      if (r.ok) {
        showMessengerSnackbar(t("cm_contacts_request_sent"), { variant: "success" });
        return true;
      }
      showMessengerSnackbar(communityMessengerFriendRequestFailureMessage(r) ?? t("cm_contacts_action_failed"), { variant: "error" });
      return false;
    },
    [home, t]
  );

  const accept = useCallback(
    async (m: ContactsMemberRow, label: string): Promise<boolean> => {
      const requestId = home?.pendingSets.incomingPendingByPeerId.get(m.user_id);
      if (home && requestId) return (await home.onRespond(requestId, "accept", label)) === true;
      const r = await fallbackAccept(m.user_id);
      if (r.ok) {
        const popup = useIncomingFriendRequestPopupStore.getState();
        for (const e of popup.friendRequestList) if (e.requesterId === m.user_id) popup.removeFriendRequestIfId(e.id);
        showMessengerSnackbar(t("cm_friend_request_you_accepted", { name: label }), { variant: "success" });
        return true;
      }
      const gone = r.error === "not_pending" || r.error === "request_not_found";
      showMessengerSnackbar(t(gone ? "cm_friend_request_no_longer_pending" : "cm_friend_request_respond_failed"), { variant: "error" });
      return false;
    },
    [fallbackAccept, home, t]
  );

  /** 추천에서 숨기기 (연락처 재추천 제한 — 상대 모름) */
  const hide = useCallback(
    async (m: ContactsMemberRow): Promise<boolean> => {
      const r = await contactsApi.suppress(m.user_id);
      showMessengerSnackbar(r.ok ? t("cm_contacts_hidden_done") : t("cm_contacts_action_failed"), r.ok ? undefined : { variant: "error" });
      return r.ok;
    },
    [t]
  );

  /** 차단 — 홈 안이면 홈 차단 처리(친구·숨김·방 목록·차단 목록·안내를 같은 처리로), 밖이면 같은 서버 경로 */
  const block = useCallback(
    async (m: ContactsMemberRow): Promise<boolean> => {
      if (home?.onBlock) return home.onBlock(m.user_id);
      const res = await fetch("/api/community-messenger/relations/block", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: m.user_id, blockSource: "profile" }),
      }).catch(() => null);
      const j = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean }) : {};
      const ok = Boolean(res?.ok && j.ok);
      showMessengerSnackbar(ok ? t("cm_contacts_blocked_done") : t("cm_contacts_action_failed"), ok ? undefined : { variant: "error" });
      return ok;
    },
    [home, t]
  );

  return { requestStateOf, isGoneNow, addFriend, accept, hide, block, insideHome: Boolean(home) };
}
