import fs from "node:fs";

const p = "components/admin/community-messenger/AdminCommunityMessengerPage.tsx";
let s = fs.readFileSync(p, "utf8");

if (!s.includes("useCmAdminLabels")) {
  s = s.replace(
    'import { runSingleFlight } from "@/lib/http/run-single-flight";',
    'import { runSingleFlight } from "@/lib/http/run-single-flight";\nimport { useCmAdminLabels } from "./useCmAdminLabels";\nimport type { CmAdminTranslate } from "./useCmAdminLabels";'
  );
  s = s.replace(
    "export function AdminCommunityMessengerPage() {\n  const searchParams = useSearchParams();",
    `export function AdminCommunityMessengerPage() {
  const {
    t,
    formatDateTime,
    roomTypeLabel,
    periodLabel,
    forceEndReasonOptions,
    forceEndReasonLabel,
    weekdays,
    heatmapHours,
    heatmapHourHeader,
    heatmapCellTitle,
    heatmapSlotLabel,
    adminUnknownLabel,
    defaultRoomLabel,
  } = useCmAdminLabels();
  const searchParams = useSearchParams();`
  );
}

s = s.replace(
  'const FORCE_END_HEATMAP_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;\nconst FORCE_END_HEATMAP_HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}시`);\n\n',
  ""
);

const map = [
  ['title="커뮤니티 메신저 운영"', 'titleKey="admin_cm_page_overview_title"'],
  [
    'description="친구 요청, 1:1·그룹 채팅방, 통화 기록을 관리자에서 통합 관리합니다."',
    'descriptionKey="admin_cm_page_overview_desc"',
  ],
  ['<AdminCard title="강제 종료 분석">', '<AdminCard titleKey="admin_cm_card_force_end_analysis">'],
  ['<AdminCard title="강제 종료 사유 KPI">', '<AdminCard titleKey="admin_cm_card_force_end_kpi">'],
  ['<AdminCard title="강제 종료 추이">', '<AdminCard titleKey="admin_cm_card_force_end_trend">'],
  ['<AdminCard title="관리자별 강제 종료 집계">', '<AdminCard titleKey="admin_cm_card_force_end_by_admin">'],
  ['<AdminCard title="방 유형별 강제 종료 분석">', '<AdminCard titleKey="admin_cm_card_force_end_by_room_type">'],
  ['<AdminCard title="강제 종료 재발 분석">', '<AdminCard titleKey="admin_cm_card_force_end_recurrence">'],
  ['<AdminCard title="사유 코드 x 재발 여부">', '<AdminCard titleKey="admin_cm_card_force_end_reason_recurrence">'],
  ['<AdminCard title="관리자별 재발 억제 효과">', '<AdminCard titleKey="admin_cm_card_force_end_admin_effect">'],
  ['<AdminCard title="시간대별 강제 종료/재발 히트맵">', '<AdminCard titleKey="admin_cm_card_force_end_heatmap">'],
  ['<AdminCard title="사유 코드 x 시간대 히트맵">', '<AdminCard titleKey="admin_cm_card_force_end_reason_heatmap">'],
  ['<AdminCard title="사유 코드 x 관리자">', '<AdminCard titleKey="admin_cm_card_force_end_reason_admin">'],
  ['<AdminCard title="메신저 방 목록">', '<AdminCard titleKey="admin_cm_card_room_list">'],
  ['<AdminCard title="활성 통화 세션">', '<AdminCard titleKey="admin_cm_card_active_calls">'],
  ['<AdminCard title="친구 요청 관리">', '<AdminCard titleKey="admin_cm_card_friend_requests">'],
  ['<AdminCard title="최근 통화 기록">', '<AdminCard titleKey="admin_cm_card_recent_calls">'],
  ['<AdminCard title="강제 종료 감사 로그">', '<AdminCard titleKey="admin_cm_card_force_end_audit">'],
  ['<AdminCard title="최근 메신저 신고">', '<AdminCard titleKey="admin_cm_card_recent_reports">'],
  ['label="전체 메신저 방"', 'label={t("admin_cm_stat_total_rooms")}'],
  ['helper="1:1 + 비공개 + 공개"', 'helper={t("admin_cm_stat_total_rooms_helper")}'],
  ['label="활성 방"', 'label={t("admin_cm_stat_active_rooms")}'],
  ['helper="정상 운영 중"', 'helper={t("admin_cm_stat_active_rooms_helper")}'],
  ['label="운영 차단/보관"', 'label={t("admin_cm_stat_blocked_archived")}'],
  ['label="대기 친구 요청"', 'label={t("admin_cm_stat_pending_requests")}'],
  ['helper="관리 검토 가능"', 'helper={t("admin_cm_stat_pending_requests_helper")}'],
  ['label="비공개 그룹"', 'label={t("admin_cm_stat_private_groups")}'],
  ['label="공개 그룹"', 'label={t("admin_cm_stat_open_groups")}'],
  ['label="활성 통화 세션"', 'label={t("admin_cm_stat_active_calls")}'],
  ['label="활성 그룹 통화"', 'label={t("admin_cm_stat_active_group_calls")}'],
  ['label="미처리 신고"', 'label={t("admin_cm_stat_open_reports")}'],
  ['label="강제 종료 누적"', 'label={t("admin_cm_stat_force_end_total")}'],
  ['helper="감사 로그 기준"', 'helper={t("admin_cm_stat_force_end_total_helper")}'],
  ['<option value="">모든 사유 코드</option>', '<option value="">{t("admin_cm_filter_all_reason_codes")}</option>'],
  ['{COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.map((reason) => (', '{forceEndReasonOptions.map((reason) => ('],
  ['<option value="">전체 기간</option>', '<option value="">{t("admin_cm_period_all")}</option>'],
  ['<option value="24h">최근 24시간</option>', '<option value="24h">{t("admin_cm_period_24h")}</option>'],
  ['<option value="7d">최근 7일</option>', '<option value="7d">{t("admin_cm_period_7d")}</option>'],
  ['<option value="30d">최근 30일</option>', '<option value="30d">{t("admin_cm_period_30d")}</option>'],
  ['필터 초기화', '{t("admin_cm_filter_reset")}'],
  [
    '분석 대상 {filteredAnalyticsAudits.length}건',
    '{t("admin_cm_common_analysis_target", { count: filteredAnalyticsAudits.length })}',
  ],
  [
    '강제 종료 집계가 없습니다.',
    '{t("admin_cm_empty_force_end_stats")}',
  ],
  ['label="재발 방"', 'label={t("admin_cm_recurrence_rooms")}'],
  ['helper="같은 방에서 2회 이상 강제 종료"', 'helper={t("admin_cm_recurrence_rooms_helper")}'],
  ['label="재발 발신자"', 'label={t("admin_cm_recurrence_callers")}'],
  ['helper="세션 매핑 가능한 발신자 기준"', 'helper={t("admin_cm_recurrence_callers_helper")}'],
  ['반복 발생 방 TOP', '{t("admin_cm_repeat_rooms_top")}'],
  ['반복 발생 방이 없습니다.', '{t("admin_cm_empty_repeat_rooms")}'],
  ['반복 발생 발신자 TOP', '{t("admin_cm_repeat_callers_top")}'],
  ['반복 발생 발신자가 없습니다.', '{t("admin_cm_empty_repeat_callers")}'],
  [
    '재발 분석 대상 사유 코드가 없습니다.',
    '{t("admin_cm_empty_reason_recurrence")}',
  ],
  [
    '재발 억제 효과를 계산할 데이터가 없습니다.',
    '{t("admin_cm_empty_recurrence_data")}',
  ],
  ['title="강제 종료 분포"', 'title={t("admin_cm_heatmap_force_end")}'],
  ['description="요일/시간대별 전체 강제 종료 건수"', 'description={t("admin_cm_heatmap_force_end_desc")}'],
  ['title="후속 재발 분포"', 'title={t("admin_cm_heatmap_recurrence")}'],
  [
    'description="해당 시점 이후 같은 방 또는 발신자에서 다시 강제 종료된 케이스"',
    'description={t("admin_cm_heatmap_recurrence_desc")}',
  ],
  [
    '시간대 패턴을 표시할 사유 코드가 없습니다.',
    '{t("admin_cm_empty_reason_heatmap")}',
  ],
  [
    '운영자 교차 분석 대상 사유 코드가 없습니다.',
    '{t("admin_cm_empty_reason_admin")}',
  ],
  ['placeholder="방 제목, 참여자, 최근 메시지 검색"', 'placeholder={t("admin_cm_placeholder_room_search")}'],
  ['<option value="">모든 상태</option>', '<option value="">{t("admin_cm_filter_all_status")}</option>'],
  ['<option value="">모든 유형</option>', '<option value="">{t("admin_cm_filter_all_types")}</option>'],
  ['<option value="private_group">비공개 그룹</option>', '<option value="private_group">{t("admin_cm_room_type_private_group")}</option>'],
  ['<option value="open_group">공개 그룹</option>', '<option value="open_group">{t("admin_cm_room_type_open_group")}</option>'],
  ['새로고침', '{t("admin_cm_common_refresh")}'],
  ['불러오는 중...', '{t("admin_cm_common_loading")}'],
  ['표시할 메신저 방이 없습니다.', '{t("admin_cm_empty_rooms")}'],
  ['<th className="px-3 py-2">방</th>', '<th className="px-3 py-2">{t("admin_cm_th_room")}</th>'],
  ['<th className="px-3 py-2">유형</th>', '<th className="px-3 py-2">{t("admin_cm_th_type")}</th>'],
  ['<th className="px-3 py-2">상태</th>', '<th className="px-3 py-2">{t("admin_cm_th_status")}</th>'],
  ['<th className="px-3 py-2">생성자</th>', '<th className="px-3 py-2">{t("admin_cm_th_creator")}</th>'],
  ['<th className="px-3 py-2">참여자</th>', '<th className="px-3 py-2">{t("admin_cm_th_participants")}</th>'],
  ['<th className="px-3 py-2">최근 메시지</th>', '<th className="px-3 py-2">{t("admin_cm_th_last_message")}</th>'],
  ['<th className="px-3 py-2">최근 시간</th>', '<th className="px-3 py-2">{t("admin_cm_th_last_time")}</th>'],
  ['<th className="px-3 py-2 text-right">상세</th>', '<th className="px-3 py-2 text-right">{t("admin_cm_th_detail")}</th>'],
  ['placeholder="통화방, 시작자, 참여자 검색"', 'placeholder={t("admin_cm_placeholder_call_search")}'],
  ['<option value="">모든 통화 유형</option>', '<option value="">{t("admin_cm_filter_all_call_types")}</option>'],
  ['<option value="group">그룹</option>', '<option value="group">{t("admin_cm_session_mode_group")}</option>'],
  ['<option value="">모든 활성 상태</option>', '<option value="">{t("admin_cm_filter_all_active_status")}</option>'],
  ['<option value="">모든 통화 종류</option>', '<option value="">{t("admin_cm_filter_all_call_kind")}</option>'],
  ['활성 통화 세션이 없습니다.', '{t("admin_cm_empty_active_calls")}'],
  ['<option value="">모든 요청 상태</option>', '<option value="">{t("admin_cm_filter_all_request_status")}</option>'],
  ['친구 요청이 없습니다.', '{t("admin_cm_empty_friend_requests")}'],
  ['<option value="">모든 기록 상태</option>', '<option value="">{t("admin_cm_filter_all_record_status")}</option>'],
  ['통화 기록이 없습니다.', '{t("admin_cm_empty_call_logs")}'],
  ['placeholder="방 제목, 관리자, 세션 ID, 메모 검색"', 'placeholder={t("admin_cm_placeholder_audit_search")}'],
  [
    '결과 {filteredCallAudits.length}건',
    '{t("admin_cm_common_results", { count: filteredCallAudits.length })}',
  ],
  ['강제 종료 감사 로그가 없습니다.', '{t("admin_cm_empty_audit_logs")}'],
  ['메신저 신고가 없습니다.', '{t("admin_cm_empty_reports")}'],
  ['alert(json.error ?? "신고 처리 실패");', 'alert(json.error ?? t("admin_cm_err_report_action_failed"));'],
  ['전체 강제 종료 중 {percent}%', '{t("admin_cm_common_share_of_force_end", { percent })}'],
  ['이전 동일 기간 {previousCount}건 대비', '{t("admin_cm_common_vs_previous_period", { count: previousCount })}'],
  ['<p className="sam-text-xxs text-sam-meta">건수</p>', '<p className="sam-text-xxs text-sam-meta">{t("admin_cm_common_count", { count: "" }).replace("건", "").replace("", "")}</p>'],
];

// fix count label - use a simpler approach below
const map2 = [
  ['>건수</p>', '>{t("admin_cm_th_metric")}</p>'], // wrong - use dedicated
];

let miss = 0;
for (const [from, to] of map) {
  if (!s.includes(from)) {
    miss++;
    console.log("miss:", from.slice(0, 70));
    continue;
  }
  s = s.replaceAll(from, to);
}

// builder functions - add t parameter
s = s.replace(
  "return buildForceEndTrendStats(analyticsAuditsByReason, forceEndAnalysisPeriodFilter);",
  "return buildForceEndTrendStats(analyticsAuditsByReason, forceEndAnalysisPeriodFilter, t);"
);
s = s.replace(
  "return buildForceEndAdminStats(filteredAnalyticsAudits);",
  "return buildForceEndAdminStats(filteredAnalyticsAudits, t);"
);
s = s.replace(
  "return buildForceEndRoomTypeStats(filteredAnalyticsAudits, roomTypeByRoomId);",
  "return buildForceEndRoomTypeStats(filteredAnalyticsAudits, roomTypeByRoomId, t);"
);
s = s.replace(
  "return buildForceEndRecurrenceAnalysis(filteredAnalyticsAudits, roomTitleByRoomId, callLogBySessionId);",
  "return buildForceEndRecurrenceAnalysis(filteredAnalyticsAudits, roomTitleByRoomId, callLogBySessionId, t);"
);
s = s.replace(
  "return buildForceEndReasonRecurrenceStats(filteredAnalyticsAudits, roomTitleByRoomId, callLogBySessionId);",
  "return buildForceEndReasonRecurrenceStats(filteredAnalyticsAudits, roomTitleByRoomId, callLogBySessionId, t);"
);
s = s.replace(
  "return buildForceEndAdminEffectStats(filteredAnalyticsAudits, callLogBySessionId);",
  "return buildForceEndAdminEffectStats(filteredAnalyticsAudits, callLogBySessionId, t);"
);
s = s.replace(
  "return buildForceEndHeatmapStats(filteredAnalyticsAudits, callLogBySessionId);",
  "return buildForceEndHeatmapStats(filteredAnalyticsAudits, callLogBySessionId, t);"
);
s = s.replace(
  "return buildForceEndReasonHeatmapStats(filteredAnalyticsAudits, callLogBySessionId);",
  "return buildForceEndReasonHeatmapStats(filteredAnalyticsAudits, callLogBySessionId, t);"
);
s = s.replace(
  "return buildForceEndReasonAdminStats(filteredAnalyticsAudits);",
  "return buildForceEndReasonAdminStats(filteredAnalyticsAudits, t);"
);

// useMemo deps add t
s = s.replace(
  "[analyticsAuditsByReason, forceEndAnalysisPeriodFilter]",
  "[analyticsAuditsByReason, forceEndAnalysisPeriodFilter, t]"
);
s = s.replace("[filteredAnalyticsAudits]", "[filteredAnalyticsAudits, t]");
s = s.replace(
  "[callLogBySessionId, filteredAnalyticsAudits, roomTitleByRoomId]",
  "[callLogBySessionId, filteredAnalyticsAudits, roomTitleByRoomId, t]"
);
s = s.replace("[callLogBySessionId, filteredAnalyticsAudits]", "[callLogBySessionId, filteredAnalyticsAudits, t]");

// function signatures
s = s.replace(
  "function buildForceEndTrendStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  periodFilter: \"24h\" | \"7d\" | \"30d\" | \"\"\n)",
  "function buildForceEndTrendStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  periodFilter: \"24h\" | \"7d\" | \"30d\" | \"\",\n  t: CmAdminTranslate\n)"
);
s = s.replace(
  'label: period === "24h" ? "최근 24시간" : period === "7d" ? "최근 7일" : "최근 30일",',
  "label: t(`admin_cm_period_${period}` as \"admin_cm_period_24h\"),"
);
// fix period label - use periodLabel helper instead
s = s.replace(
  "label: t(`admin_cm_period_${period}` as \"admin_cm_period_24h\"),",
  "label: period === \"24h\" ? t(\"admin_cm_period_24h\") : period === \"7d\" ? t(\"admin_cm_period_7d\") : t(\"admin_cm_period_30d\"),"
);

s = s.replace(
  "function buildForceEndAdminStats(callAudits: AdminCommunityMessengerCallAuditLog[])",
  "function buildForceEndAdminStats(callAudits: AdminCommunityMessengerCallAuditLog[], t: CmAdminTranslate)"
);
s = s.replace(
  'const adminLabel = audit.actorLabel || "관리자 미상";',
  "const adminLabel = audit.actorLabel || t(\"admin_cm_admin_unknown\");"
);

s = s.replace(
  "function buildForceEndRoomTypeStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  roomTypeByRoomId: Map<string, \"direct\" | \"private_group\" | \"open_group\">\n)",
  "function buildForceEndRoomTypeStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  roomTypeByRoomId: Map<string, \"direct\" | \"private_group\" | \"open_group\">,\n  t: CmAdminTranslate\n)"
);
s = s.replace(
  '  return [\n    { key: "direct", label: "1:1", count: countMap.get("direct") ?? 0 },\n    { key: "private_group", label: "비공개 그룹", count: countMap.get("private_group") ?? 0 },\n    { key: "open_group", label: "공개 그룹", count: countMap.get("open_group") ?? 0 },\n    { key: "unknown", label: "미확인", count: countMap.get("unknown") ?? 0 },\n  ]',
  `  return [
    { key: "direct", label: t("admin_cm_room_type_direct"), count: countMap.get("direct") ?? 0 },
    { key: "private_group", label: t("admin_cm_room_type_private_group"), count: countMap.get("private_group") ?? 0 },
    { key: "open_group", label: t("admin_cm_room_type_open_group"), count: countMap.get("open_group") ?? 0 },
    { key: "unknown", label: t("admin_cm_room_type_unknown"), count: countMap.get("unknown") ?? 0 },
  ]`
);

s = s.replace(
  "function buildForceEndRecurrenceAnalysis(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  roomTitleByRoomId: Map<string, string>,\n  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>\n)",
  "function buildForceEndRecurrenceAnalysis(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  roomTitleByRoomId: Map<string, string>,\n  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>,\n  t: CmAdminTranslate\n)"
);
s = s.replace(
  'const roomLabel = roomTitleByRoomId.get(audit.roomId) || audit.roomTitle || "메신저 방";',
  "const roomLabel = roomTitleByRoomId.get(audit.roomId) || audit.roomTitle || t(\"admin_cm_default_room_title\");"
);

s = s.replace(
  "function buildForceEndReasonRecurrenceStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  roomTitleByRoomId: Map<string, string>,\n  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>\n)",
  "function buildForceEndReasonRecurrenceStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  roomTitleByRoomId: Map<string, string>,\n  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>,\n  t: CmAdminTranslate\n)"
);

s = s.replace(
  "function buildForceEndAdminEffectStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>\n)",
  "function buildForceEndAdminEffectStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>,\n  t: CmAdminTranslate\n)"
);

s = s.replace(
  "function buildForceEndHeatmapStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>\n)",
  "function buildForceEndHeatmapStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>,\n  t: CmAdminTranslate\n)"
);

s = s.replace(
  "function buildForceEndReasonHeatmapStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>\n)",
  "function buildForceEndReasonHeatmapStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  callLogBySessionId: Map<string, AdminCommunityMessengerCallLog>,\n  t: CmAdminTranslate\n)"
);

s = s.replace(
  "function buildForceEndReasonAdminStats(callAudits: AdminCommunityMessengerCallAuditLog[])",
  "function buildForceEndReasonAdminStats(callAudits: AdminCommunityMessengerCallAuditLog[], t: CmAdminTranslate)"
);

// heatmap - replace FORCE_END_HEATMAP_WEEKDAYS with weekdays param in components
s = s.replaceAll("FORCE_END_HEATMAP_WEEKDAYS", "weekdays");
s = s.replaceAll("FORCE_END_HEATMAP_HOURS", "heatmapHours");

// getTopHeatmapSlots - pass t and weekdays
s = s.replace(
  "function getTopHeatmapSlots(matrix: number[][]) {",
  "function getTopHeatmapSlots(matrix: number[][], weekdays: string[], t: CmAdminTranslate) {"
);
s = s.replace(
  'label: `${FORCE_END_HEATMAP_WEEKDAYS[weekday]} ${String(hour).padStart(2, "0")}:00`,',
  "label: t(\"admin_cm_heatmap_slot_label\", { weekday: weekdays[weekday], hour: String(hour).padStart(2, \"0\") }),"
);
s = s.replaceAll("getTopHeatmapSlots(totalMatrix)", "getTopHeatmapSlots(totalMatrix, weekdays, t)");
s = s.replaceAll("getTopHeatmapSlots(recurrenceMatrix)", "getTopHeatmapSlots(recurrenceMatrix, weekdays, t)");

// buildForceEndHeatmapStats internal calls
s = s.replace(
  "topForceEndSlots: getTopHeatmapSlots(totalMatrix),",
  "topForceEndSlots: getTopHeatmapSlots(totalMatrix, [], t),"
);

// Remove local formatDateTime at bottom
s = s.replace(
  /\nfunction formatDateTime\(value: string\) \{[\s\S]*?\n\}\n\nfunction matchesAuditPeriod/,
  "\n\nfunction matchesAuditPeriod"
);

// Subcomponents use useI18n - patch RoomRow etc via adding hook at start of each function
const subFns = [
  "StatCard",
  "ForceEndReasonKpiCard",
  "ForceEndTrendCard",
  "ForceEndAdminRow",
  "ForceEndRoomTypeCard",
  "ForceEndRecurrenceSummaryCard",
  "ForceEndRecurrenceRow",
  "ForceEndReasonRecurrenceCard",
  "ForceEndAdminEffectRow",
  "ForceEndHeatmapCard",
  "ForceEndReasonHeatmapCard",
  "ForceEndReasonAdminCard",
  "RoomRow",
  "RequestRow",
  "CallRow",
  "ActiveCallRow",
  "CallAuditRow",
  "ReportRow",
];

for (const fn of subFns) {
  const re = new RegExp(`function ${fn}\\([^)]*\\) \\{`);
  if (re.test(s) && !s.match(new RegExp(`function ${fn}[\\s\\S]{0,120}useCmAdminLabels`))) {
    s = s.replace(re, (m) => `${m}\n  const { t, formatDateTime, roomTypeLabel, heatmapHourHeader, heatmapCellTitle } = useCmAdminLabels();`);
  }
}

// ReportRow needs onRefresh - add t to run callback
s = s.replace(
  "function ReportRow({\n  report,\n  busy,\n  onRefresh,\n}: {\n  report: AdminCommunityMessengerReport;\n  busy: string | null;\n  onRefresh: () => Promise<void>;\n}) {\n  const run = async",
  "function ReportRow({\n  report,\n  busy,\n  onRefresh,\n}: {\n  report: AdminCommunityMessengerReport;\n  busy: string | null;\n  onRefresh: () => Promise<void>;\n}) {\n  const { t, formatDateTime } = useCmAdminLabels();\n  const run = async"
);

fs.writeFileSync(p, s);
console.log("miss", miss);
