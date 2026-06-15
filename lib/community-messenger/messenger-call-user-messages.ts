/**
 * 통화·메신저 클라이언트에서 공통으로 쓰는 사용자 노출 문구.
 * API `error` 코드 매핑은 서버 스키마와 맞출 것.
 */
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";

const KEYS = {
  sessionActionFailed: "cm_ui_call_session_action_failed",
  sessionRejectFailed: "cm_ui_call_session_reject_failed",
  incomingListFailed: "cm_ui_incoming_call_list_failed",
  incomingListReload: "cm_ui_incoming_call_list_reload",
  networkOrServer: "cm_ui_network_or_server_unreachable",
  signalPollUnstable: "cm_ui_call_signal_poll_unstable",
  groupRingEndFailed: "cm_ui_group_ring_end_failed",
  groupCancelFailed: "cm_ui_group_call_cancel_failed",
  groupEndFailed: "cm_ui_group_call_end_failed",
  autoAcceptFailed: "cm_ui_call_auto_accept_failed",
} as const satisfies Record<string, MessageKey>;

function tr(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

export const MESSENGER_CALL_USER_MSG = {
  get sessionActionFailed() {
    return tr(KEYS.sessionActionFailed);
  },
  get sessionRejectFailed() {
    return tr(KEYS.sessionRejectFailed);
  },
  get incomingListFailed() {
    return tr(KEYS.incomingListFailed);
  },
  get incomingListReload() {
    return tr(KEYS.incomingListReload);
  },
  get networkOrServer() {
    return tr(KEYS.networkOrServer);
  },
  get signalPollUnstable() {
    return tr(KEYS.signalPollUnstable);
  },
  get groupRingEndFailed() {
    return tr(KEYS.groupRingEndFailed);
  },
  get groupCancelFailed() {
    return tr(KEYS.groupCancelFailed);
  },
  get groupEndFailed() {
    return tr(KEYS.groupEndFailed);
  },
  get autoAcceptFailed() {
    return tr(KEYS.autoAcceptFailed);
  },
} as const;

export const SIGNAL_POLL_SOFT_ERROR = MESSENGER_CALL_USER_MSG.signalPollUnstable;
