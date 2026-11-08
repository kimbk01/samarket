/**
 * B5-3 (docs/audit/i18n-b5-call-plan-2026-11-08.md) — 통화 웹 코드의 카탈로그 밖 대체 문구 삭제.
 *
 * 삭제 전 열거 결과: 모든 키가 ko·en 카탈로그에 안전한 문구로 존재했으므로
 * `safeTranslate` 는 대체 문구를 한 번도 쓰지 않았다(죽은 대체 문구). 따라서 화면 글자는
 * 삭제 전후 모두 「카탈로그 문구」이며, 이 테스트는 키별 ko·en 화면 글자를 고정한다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { isUnsafeTranslationResult, safeTranslate } from "@/lib/i18n/safe-translate";
import {
  DIRECT_CALL_DENY_MESSAGE_KEYS,
  resolveDirectCallDenyUserMessage,
} from "@/lib/community-messenger/direct-call-permission-messages";
import type { DirectCallDenyCode } from "@/lib/community-messenger/direct-call-permission";
import { callV4ConnectionSignalTierMessageKey } from "@/lib/community-messenger/call-v4/call-v4-network-quality";
import type { CallV4ConnectionSignalTier } from "@/lib/community-messenger/call-v4/call-v4-types";
import {
  CALL_IN_APP_NOTICE_EVENTS,
  getCallInAppNoticeSpec,
} from "@/lib/community-messenger/call-ui/call-in-app-notice-contract";
import { getCallInAppNoticeCenterCopy } from "@/lib/community-messenger/call-ui/call-in-app-notice-center-copy";
import { resolveCallLogBadgeMessageKey } from "@/lib/community-messenger/call-history/call-log-display-type";
import { presentCallHistoryStatus } from "@/lib/community-messenger/call-history/call-history-presenter";
import { resolveCallLogKindMessageKey } from "@/lib/community-messenger/call-log-row-copy";
import type { CommunityMessengerCallLogDisplayType } from "@/lib/community-messenger/types";

const LANGS: AppLanguageCode[] = ["ko", "en"];

type Expected = { key: MessageKey; ko: string; en: string };

function expectScreenText({ key, ko, en }: Expected) {
  for (const lang of LANGS) {
    const want = lang === "ko" ? ko : en;
    const raw = translate(lang, key);
    expect(isUnsafeTranslationResult(key, raw.trim()), `${lang}:${key} 카탈로그 존재`).toBe(false);
    expect(raw, `${lang}:${key} 카탈로그 문구`).toBe(want);
    expect(safeTranslate(lang, key), `${lang}:${key} 화면 문구`).toBe(want);
  }
}

/** 삭제 전 화면 글자 = 카탈로그 문구 (2026-11-08 열거 결과 그대로) */
const DENY: Record<DirectCallDenyCode, Expected> = {
  deny_blocked: { key: "cm_call_deny_blocked", ko: "차단된 사용자와는 통화할 수 없습니다.", en: "You cannot call a blocked user." },
  deny_privacy: {
    key: "cm_call_deny_privacy",
    ko: "상대방의 통화 설정으로 인해 연결할 수 없습니다.",
    en: "The other person's call settings do not allow this call.",
  },
  deny_room_state_mismatch: {
    key: "cm_call_deny_room_mismatch",
    ko: "이 대화방 상태에서는 통화를 시작할 수 없습니다.",
    en: "You cannot start a call in this room state.",
  },
  deny_deleted_account: {
    key: "cm_call_deny_room_mismatch",
    ko: "이 대화방 상태에서는 통화를 시작할 수 없습니다.",
    en: "You cannot start a call in this room state.",
  },
  deny_group_room: {
    key: "cm_call_deny_room_mismatch",
    ko: "이 대화방 상태에서는 통화를 시작할 수 없습니다.",
    en: "You cannot start a call in this room state.",
  },
  deny_permission: {
    key: "cm_ui_call_failed_permission_detail_voice",
    ko: "브라우저 주소창의 자물쇠에서 마이크를 허용하거나, 기기 설정에서 마이크 접근을 허용해 주세요.",
    en: "Allow the microphone in the browser lock icon or in your device settings.",
  },
  deny_peer_rejected: {
    key: "cm_call_deny_peer_rejected",
    ko: "상대가 친구 요청을 거절해 통화할 수 없습니다.",
    en: "You can't call this person because they declined your friend request.",
  },
};

const SIGNAL: Record<CallV4ConnectionSignalTier, Expected> = {
  good: { key: "cm_ui_connection_status_good", ko: "통신 상태 좋음", en: "Connection quality · good" },
  fair: { key: "cm_ui_connection_status_fair", ko: "통신 상태 보통", en: "Connection quality · fair" },
  poor: { key: "cm_ui_connection_status_poor", ko: "통신 상태 나쁨", en: "Connection quality · poor" },
  checking: { key: "cm_ui_network_quality_checking", ko: "네트워크 품질 · 확인 중", en: "Network quality · checking" },
};

const PERMISSION_GUIDE: Expected[] = [
  {
    key: "permission_call_guide_video_desc",
    ko: "브라우저 또는 기기 설정에서 카메라와 마이크를 허용해 주세요.",
    en: "Allow camera and microphone in browser or device settings.",
  },
  {
    key: "permission_call_guide_voice_desc",
    ko: "브라우저 또는 기기 설정에서 마이크를 허용해 주세요.",
    en: "Allow microphone in browser or device settings.",
  },
  { key: "permission_call_retry_video", ko: "카메라/마이크 확인", en: "Check camera/microphone" },
  { key: "permission_call_retry_voice", ko: "마이크 확인", en: "Check microphone" },
  { key: "permission_call_settings_label", ko: "권한 설정 안내", en: "Permission setup guide" },
];

const NOTICE_BODY: Record<string, Expected> = {
  peer_busy: {
    key: "cm_ui_call_peer_busy",
    ko: "상대방이 다른 통화 중입니다. 잠시 후 다시 걸어 주세요.",
    en: "The other person is currently on another call. Please try again later.",
  },
  caller_busy: {
    key: "cm_ui_call_caller_busy",
    ko: "지금 다른 통화 중이라 새 통화를 시작할 수 없습니다. 현재 통화를 끝낸 뒤 다시 걸어 주세요.",
    en: "You're already on another call, so a new call cannot be started. End the current call and try again.",
  },
  call_failed: {
    key: "cm_ui_call_start_failed",
    ko: "통화를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    en: "Could not start the call. Please try again.",
  },
  reconnecting: { key: "cm_ui_call_reconnecting", ko: "다시 연결하는 중…", en: "Reconnecting…" },
  remote_ended: { key: "cm_ui_call_ended", ko: "통화가 종료되었습니다", en: "Call ended" },
  missed: { key: "cm_ui_missed_call_notification", ko: "부재중 알림", en: "Missed call" },
  no_answer: {
    key: "cm_ui_call_no_answer",
    ko: "상대방이 전화를 받지 않았습니다. 잠시 후 다시 걸어 주세요.",
    en: "They didn't answer. Please try again later.",
  },
  permission_required: { key: "cm_ui_mic_permission_required", ko: "마이크 권한이 필요합니다", en: "Microphone access required" },
  network_warning: { key: "cm_ui_call_failed_network_detail", ko: "네트워크 상태를 확인해 주세요.", en: "Check your network connection." },
  peer_declined: { key: "cm_ui_peer_declined_call", ko: "상대방이 통화를 거절했습니다.", en: "The other person declined the call." },
};

const CENTER_TITLE: Record<string, Expected> = {
  no_answer: { key: "cm_ui_call_notice_title_no_answer", ko: "응답 없음", en: "No answer" },
  peer_busy: { key: "cm_ui_call_notice_title_peer_busy", ko: "상대방 통화 중", en: "On another call" },
  caller_busy: { key: "cm_ui_call_notice_title_caller_busy", ko: "이미 통화 중", en: "Already on a call" },
  call_failed: { key: "cm_ui_call_notice_title_call_failed", ko: "통화 연결 실패", en: "Call failed" },
  peer_declined: { key: "cm_ui_call_notice_title_peer_declined", ko: "통화 거절", en: "Call declined" },
};

const BADGE: Record<string, { ko: string; en: string }> = {
  cm_call_status_outgoing_answered: { ko: "발신", en: "Outgoing" },
  cm_call_status_incoming_answered: { ko: "수신", en: "Incoming" },
  cm_call_status_missed: { ko: "부재중", en: "Missed" },
  cm_call_status_no_answer: { ko: "부재중", en: "Missed" },
  cm_call_status_rejected: { ko: "거절", en: "Declined" },
  cm_call_status_cancelled: { ko: "취소", en: "Canceled" },
  cm_call_status_busy_peer: { ko: "통화 중", en: "Busy" },
  cm_call_status_failed: { ko: "실패", en: "Failed" },
  cm_call_status_rejected_by_me: { ko: "거절", en: "Declined" },
  cm_call_status_rejected_by_peer: { ko: "거절", en: "Declined" },
  cm_call_status_busy_self: { ko: "다른 통화 중", en: "On another call" },
};

const DISPLAY_TYPES: CommunityMessengerCallLogDisplayType[] = [
  "outgoing",
  "incoming",
  "missed_incoming",
  "missed_outgoing",
  "rejected",
  "cancelled",
  "busy",
  "failed",
];

const CANONICALS = [
  "outgoing_started",
  "incoming_received",
  "connected_ended",
  "outgoing_cancelled",
  "incoming_missed",
  "unanswered",
  "local_rejected",
  "remote_rejected",
  "remote_busy",
  "self_busy",
  "failed",
  "interrupted",
] as const;

describe("B5-3 통화 대체 문구 삭제 — 화면 글자 ko·en 변화 0", () => {
  it("direct-call-permission-messages: 거부 코드 7종", () => {
    for (const code of Object.keys(DIRECT_CALL_DENY_MESSAGE_KEYS) as DirectCallDenyCode[]) {
      expect(DIRECT_CALL_DENY_MESSAGE_KEYS[code]).toBe(DENY[code].key);
      expectScreenText(DENY[code]);
    }
    expect(Object.keys(DIRECT_CALL_DENY_MESSAGE_KEYS).sort()).toEqual(Object.keys(DENY).sort());
    expect(typeof resolveDirectCallDenyUserMessage).toBe("function");
  });

  it("call-v4-view-model: 연결 상태 4단계", () => {
    for (const tier of Object.keys(SIGNAL) as CallV4ConnectionSignalTier[]) {
      expect(callV4ConnectionSignalTierMessageKey(tier)).toBe(SIGNAL[tier].key);
      expectScreenText(SIGNAL[tier]);
    }
  });

  it("call-permission: 권한 안내 5키", () => {
    for (const e of PERMISSION_GUIDE) expectScreenText(e);
  });

  it("call-in-app-notice-store: 알림 이벤트 10종 본문", () => {
    expect([...CALL_IN_APP_NOTICE_EVENTS].sort()).toEqual(Object.keys(NOTICE_BODY).sort());
    for (const event of CALL_IN_APP_NOTICE_EVENTS) {
      expect(getCallInAppNoticeSpec(event).messageKey).toBe(NOTICE_BODY[event].key);
      expectScreenText(NOTICE_BODY[event]);
    }
  });

  it("CallInAppNoticeCenterDialog: 가운데 알림 5종 제목·본문 (이전 대체 문구와도 동일)", () => {
    let count = 0;
    for (const event of CALL_IN_APP_NOTICE_EVENTS) {
      const copy = getCallInAppNoticeCenterCopy(event);
      if (!copy) continue;
      count += 1;
      expect(copy.titleKey).toBe(CENTER_TITLE[event].key);
      expectScreenText(CENTER_TITLE[event]);
      expectScreenText({ key: copy.bodyKey, ko: NOTICE_BODY[event].ko, en: NOTICE_BODY[event].en });
      expect(translate("ko", copy.titleKey)).toBe(copy.fallbackTitleKo);
      expect(translate("en", copy.titleKey)).toBe(copy.fallbackTitleEn);
      expect(translate("ko", copy.bodyKey)).toBe(copy.fallbackBodyKo);
      expect(translate("en", copy.bodyKey)).toBe(copy.fallbackBodyEn);
    }
    expect(count).toBe(Object.keys(CENTER_TITLE).length);
  });

  it("call-history 배지: displayType 8종 + canonical 12종이 낼 수 있는 키 전부", () => {
    const keys = new Set<string>();
    for (const d of DISPLAY_TYPES) keys.add(presentCallHistoryStatus(d).labelKey);
    for (const c of CANONICALS) for (const out of [true, false]) keys.add(resolveCallLogBadgeMessageKey(c, out));
    expect([...keys].sort()).toEqual(Object.keys(BADGE).sort());
    for (const key of keys) expectScreenText({ key: key as MessageKey, ...BADGE[key] });
  });

  it("call-history 부제목: 통화 종류 2종", () => {
    expect(resolveCallLogKindMessageKey("voice")).toBe("cm_ui_call_log_kind_voice");
    expect(resolveCallLogKindMessageKey("video")).toBe("cm_ui_call_log_kind_video");
    expectScreenText({ key: "cm_ui_call_log_kind_voice", ko: "음성 통화", en: "Voice call" });
    expectScreenText({ key: "cm_ui_call_log_kind_video", ko: "영상 통화", en: "Video call" });
  });

  it("대상 8파일에 대체 문구가 남아 있지 않다", () => {
    const files = [
      "lib/community-messenger/direct-call-permission-messages.ts",
      "lib/community-messenger/call-v4/call-v4-view-model.ts",
      "lib/community-messenger/call-permission.ts",
      "lib/community-messenger/stores/call-in-app-notice-store.ts",
      "components/messenger/call/CallInAppNoticeCenterDialog.tsx",
      "components/community-messenger/call-history/CommunityMessengerCallDirectionBadge.tsx",
      "components/community-messenger/call-history/CommunityMessengerCallPeerHistoryRow.tsx",
      "components/community-messenger/call-history/CommunityMessengerCallRow.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      /** 값 전달(`fallbackKo:`)만 금지 — call-v4-view-model 의 `SafeTranslate` 타입 선언(`fallbackKo?:`)은 CallV4Screen 호환으로 유지 */
      expect(src, f).not.toMatch(/fallback(Ko|En)\s*:|fallbackTitle|fallbackBody|_FALLBACKS|FALLBACKS\[/);
    }
  });
});
