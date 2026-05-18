import fs from "node:fs";

const p = "components/admin/community-messenger/AdminCommunityMessengerDetailPage.tsx";
let s = fs.readFileSync(p, "utf8");

const map = [
  ['title="메신저 방 상세"', 'titleKey="admin_cm_page_detail_title"'],
  ['description="방 상태 조치, 참여자 확인, 메시지 흐름 점검"', 'descriptionKey="admin_cm_page_detail_desc"'],
  ['<AdminCard title="방 정보">', '<AdminCard titleKey="admin_cm_card_room_info">'],
  ['<AdminCard title="운영 조치">', '<AdminCard titleKey="admin_cm_card_ops_actions">'],
  ['<AdminCard title="참여자">', '<AdminCard titleKey="admin_cm_card_participants">'],
  ['<AdminCard title="최근 통화">', '<AdminCard titleKey="admin_cm_card_recent_calls_detail">'],
  ['<AdminCard title="활성 통화 세션">', '<AdminCard titleKey="admin_cm_card_active_calls">'],
  ['<AdminCard title="강제 종료 감사 로그">', '<AdminCard titleKey="admin_cm_card_force_end_audit">'],
  ['<AdminCard title="메시지 타임라인">', '<AdminCard titleKey="admin_cm_card_message_timeline">'],
  ['<AdminCard title="방 신고 내역">', '<AdminCard titleKey="admin_cm_card_room_reports">'],
  ['label="방 제목"', 'label={t("admin_cm_label_room_title")}'],
  ['label="방 ID"', 'label={t("admin_cm_label_room_id")}'],
  ['label="유형"', 'label={t("admin_cm_th_type")}'],
  [
    'value={room.roomType === "open_group" ? "공개 그룹" : room.roomType === "private_group" ? "비공개 그룹" : "1:1"}',
    'value={roomTypeLabel(room.roomType === "open_group" ? "open_group" : room.roomType === "private_group" ? "private_group" : "direct")}',
  ],
  ['label="상태"', 'label={t("admin_cm_th_status")}'],
  ['label="공개 여부"', 'label={t("admin_cm_label_visibility")}'],
  ['label="입장 정책"', 'label={t("admin_cm_label_join_policy")}'],
  ['label="읽기 전용"', 'label={t("admin_cm_label_readonly")}'],
  ['value={room.isReadonly ? "ON" : "OFF"}', 'value={room.isReadonly ? t("admin_cm_common_on") : t("admin_cm_common_off")}'],
  ['label="생성자"', 'label={t("admin_cm_th_creator")}'],
  ['label="방장"', 'label={t("admin_cm_label_owner")}'],
  ['label="참여자 수"', 'label={t("admin_cm_label_member_count")}'],
  ['value={`${room.memberCount}명`}', 'value={t("admin_cm_common_members", { count: room.memberCount })}'],
  ['label="최대 인원"', 'label={t("admin_cm_label_member_limit")}'],
  [
    'value={room.memberLimit ? `${room.memberLimit}명` : "-"}',
    'value={room.memberLimit ? t("admin_cm_common_members", { count: room.memberLimit }) : t("admin_cm_common_dash")}',
  ],
  ['label="목록 노출"', 'label={t("admin_cm_label_discoverable")}'],
  ['value={room.isDiscoverable ? "ON" : "OFF"}', 'value={room.isDiscoverable ? t("admin_cm_common_on") : t("admin_cm_common_off")}'],
  ['label="비밀번호 설정"', 'label={t("admin_cm_label_password")}'],
  [
    'value={room.requiresPassword ? "설정됨" : "없음"}',
    'value={room.requiresPassword ? t("admin_cm_common_configured") : t("admin_cm_common_not_set")}',
  ],
  ['label="최근 메시지 시간"', 'label={t("admin_cm_label_last_message_at")}'],
  ['label="방 소개"', 'label={t("admin_cm_label_summary")}'],
  ['value={room.summary || "-"}', 'value={room.summary || t("admin_cm_common_dash")}'],
  ['label="최근 메시지"', 'label={t("admin_cm_th_last_message")}'],
  ['label="운영 메모"', 'label={t("admin_cm_label_ops_note")}'],
  ['value={room.adminNote || "-"}', 'value={room.adminNote || t("admin_cm_common_dash")}'],
  ['label="최근 조치 관리자"', 'label={t("admin_cm_label_last_moderator")}'],
  ['label="최근 조치 시각"', 'label={t("admin_cm_label_last_moderated_at")}'],
  [
    'value={room.moderatedAt ? formatDateTime(room.moderatedAt) : "-"}',
    'value={room.moderatedAt ? formatDateTime(room.moderatedAt) : t("admin_cm_common_dash")}',
  ],
  ['<option value="">강제 종료 사유 코드를 선택하세요</option>', '<option value="">{t("admin_cm_select_force_end_reason")}</option>'],
  ["{COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.map((reason) => (", "{forceEndReasonOptions.map((reason) => ("],
  [
    'placeholder="운영 메모를 남기세요. 강제 종료 시에는 선택한 사유 코드에 대한 상세 설명을 적어 주세요."',
    'placeholder={t("admin_cm_placeholder_ops_note")}',
  ],
  [
    "통화 강제 종료에는 사유 코드 선택과 운영 메모 입력이 모두 필수입니다.",
    '{t("admin_cm_force_end_requires_note")}',
  ],
  ['label="채팅 차단"', 'label={t("admin_cm_action_block_chat")}'],
  ['label="차단 해제"', 'label={t("admin_cm_action_unblock_chat")}'],
  ['label="보관"', 'label={t("admin_cm_action_archive")}'],
  ['label="보관 해제"', 'label={t("admin_cm_action_unarchive")}'],
  ['label="읽기 전용"', 'label={t("admin_cm_action_readonly_on")}'],
  ['label="읽기 전용 해제"', 'label={t("admin_cm_action_readonly_off")}'],
  ['<option value="">모든 기록 상태</option>', '<option value="">{t("admin_cm_filter_all_record_status")}</option>'],
  ['<option value="">모든 통화 종류</option>', '<option value="">{t("admin_cm_filter_all_call_kind")}</option>'],
  [">통화 기록이 없습니다.<", ">{t(\"admin_cm_empty_call_logs\")}<"],
  ['<option value="">모든 활성 상태</option>', '<option value="">{t("admin_cm_filter_all_active_status")}</option>'],
  [">현재 진행 중인 통화 세션이 없습니다.<", ">{t(\"admin_cm_empty_active_calls_detail\")}<"],
  [
    '{call.sessionMode === "group" ? "그룹 통화" : "1:1 통화"}',
    '{call.sessionMode === "group" ? t("admin_cm_call_group") : t("admin_cm_call_direct")}',
  ],
  ['placeholder="관리자, 세션 ID, 메모 검색"', 'placeholder={t("admin_cm_placeholder_audit_search_detail")}'],
  ['<option value="">전체 기간</option>', '<option value="">{t("admin_cm_period_all")}</option>'],
  ['<option value="24h">최근 24시간</option>', '<option value="24h">{t("admin_cm_period_24h")}</option>'],
  ['<option value="7d">최근 7일</option>', '<option value="7d">{t("admin_cm_period_7d")}</option>'],
  ['<option value="30d">최근 30일</option>', '<option value="30d">{t("admin_cm_period_30d")}</option>'],
  [
    '<div className="flex items-center sam-text-helper text-sam-muted">결과 {filteredCallAudits.length}건</div>',
    '<div className="flex items-center sam-text-helper text-sam-muted">{t("admin_cm_common_results", { count: filteredCallAudits.length })}</div>',
  ],
  [">이 방의 강제 종료 감사 로그가 없습니다.<", ">{t(\"admin_cm_empty_room_audit_logs\")}<"],
  [">강제 종료</span>", ">{t(\"admin_cm_force_end_badge\")}</span>"],
  ["관리자 {log.actorLabel}", '{t("admin_cm_common_admin_actor", { name: log.actorLabel })}'],
  [
    "사유 코드: {log.reasonLabel} ({log.reasonCode})",
    '{t("admin_cm_common_reason_code", { label: log.reasonLabel, code: log.reasonCode ?? "" })}',
  ],
  [">메모: {log.note}<", ">{t(\"admin_cm_common_note\", { text: log.note })}<"],
  [">숨김</span>", ">{t(\"admin_cm_badge_hidden\")}</span>"],
  ["신고 {message.reportCount}", '{t("admin_cm_badge_reports", { count: message.reportCount })'],
  ['(빈 메시지)', '{t("admin_cm_empty_message")}'],
  ["숨김 해제", '{t("admin_cm_action_unhide_message")}'],
  ['>메시지 숨김</button>', '>{t("admin_cm_action_hide_message")}</button>'],
  [">이 방에 접수된 신고가 없습니다.<", ">{t(\"admin_cm_empty_room_reports\")}<"],
  ["관리 메모: {report.adminNote}", '{t("admin_cm_common_admin_note", { text: report.adminNote })}'],
  [">검토중</button>", ">{t(\"admin_cm_action_reviewing\")}</button>"],
  [">해결</button>", ">{t(\"admin_cm_action_resolve\")}</button>"],
  [">기각</button>", ">{t(\"admin_cm_action_dismiss\")}</button>"],
  ["메시지 숨김 제재", '{t("admin_cm_action_sanction_hide")}'],
  ["방 차단 제재", '{t("admin_cm_action_sanction_block_room")}'],
  ['{busy === action ? "처리 중..." : label}', '{busy === action ? t("admin_cm_common_processing") : label}'],
  ["통화 강제 종료 확인", '{t("admin_cm_modal_force_end_title")}'],
  [
    "이 작업은 즉시 통화를 종료시키며 감사 로그에 기록됩니다. 실행 전에 대상과 사유를 다시 확인하세요.",
    '{t("admin_cm_modal_force_end_warning")}',
  ],
  [">대상 통화</span>", ">{t(\"admin_cm_modal_target_call\")}</span>"],
  [">시작자</span>", ">{t(\"admin_cm_modal_initiator\")}</span>"],
  [">참여 인원</span>", ">{t(\"admin_cm_modal_participants\")}</span>"],
  [">사유 코드</span>", ">{t(\"admin_cm_modal_reason_code\")}</span>"],
  [">상세 메모</span>", ">{t(\"admin_cm_modal_detail_note\")}</span>"],
  [">취소</button>", ">{t(\"admin_cm_common_cancel\")}</button>"],
  [
    '{busy ? "강제 종료 중..." : "강제 종료 확인"}',
    '{busy ? t("admin_cm_action_force_end_in_progress") : t("admin_cm_action_force_end_confirm")}',
  ],
  [
    '{busy === `call:${call.id}:force_end` ? "종료 중..." : "강제 종료"}',
    '{busy === `call:${call.id}:force_end` ? t("admin_cm_common_ending") : t("admin_cm_action_force_end")}',
  ],
  [
    "상태 {call.status} · 시작자 {call.initiatorLabel} · 시작 {formatDateTime(call.startedAt)}",
    '{t("admin_cm_common_call_status_line", { status: call.status, initiator: call.initiatorLabel, started: formatDateTime(call.startedAt) })}',
  ],
  [
    "참여 {call.joinedCount}명 · 대기 {call.invitedCount}명 · 전체 {call.participantCount}명",
    '{t("admin_cm_common_participants_joined", { joined: call.joinedCount, invited: call.invitedCount, total: call.participantCount })}',
  ],
  [
    '<div>참여 {participant.joinedAt ? formatDateTime(participant.joinedAt) : "-"}</div>',
    '<div>{t("admin_cm_common_joined", { date: participant.joinedAt ? formatDateTime(participant.joinedAt) : t("admin_cm_common_dash") })}</div>',
  ],
];

let miss = 0;
for (const [from, to] of map) {
  if (!s.includes(from)) {
    miss++;
    console.log("miss:", from.slice(0, 80));
    continue;
  }
  s = s.replaceAll(from, to);
}

s = s.replace(
  /\nfunction formatDateTime\(value: string\) \{[\s\S]*?\n\}\n\nfunction matchesAuditPeriod/,
  "\n\nfunction matchesAuditPeriod"
);

s = s.replace(
  "function ActionButton({\n  busy,\n  action,\n  label,\n  onRun,\n}: {\n  busy: string | null;\n  action: RoomAction;\n  label: string;\n  onRun: (action: RoomAction) => Promise<void>;\n}) {\n  return (",
  "function ActionButton({\n  busy,\n  action,\n  label,\n  onRun,\n}: {\n  busy: string | null;\n  action: RoomAction;\n  label: string;\n  onRun: (action: RoomAction) => Promise<void>;\n}) {\n  const { t } = useCmAdminLabels();\n  return ("
);

s = s.replace(
  "}) {\n  if (!open || !call) return null;\n\n  const reasonLabel =\n    COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.find((item) => item.code === reasonCode)?.label ??",
  "}) {\n  const { t, forceEndReasonLabel } = useCmAdminLabels();\n  if (!open || !call) return null;\n\n  const reasonLabel = reasonCode ? forceEndReasonLabel(reasonCode) :"
);

if (!s.includes("COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS")) {
  s = s.replace(
    /import \{\n  COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS,\n  type CommunityMessengerCallForceEndReasonCode,\n\} from "@\/lib\/admin-community-messenger\/call-force-end-reasons";\n/,
    'import type { CommunityMessengerCallForceEndReasonCode } from "@/lib/admin-community-messenger/call-force-end-reasons";\n'
  );
}

fs.writeFileSync(p, s);
console.log("miss", miss);
