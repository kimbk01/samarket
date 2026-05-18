import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function write(rel, content) {
  fs.writeFileSync(path.join(ROOT, rel), content);
}

function ensureImport(content) {
  if (content.includes("useCmAdminLabels")) return content;
  return content.replace(
    'import { getSupabaseClient } from "@/lib/supabase/client";',
    'import { getSupabaseClient } from "@/lib/supabase/client";\nimport { useCmAdminLabels } from "./useCmAdminLabels";\nimport type { CmAdminTranslate } from "./useCmAdminLabels";'
  );
}

function addMainHook(content, fnName) {
  const needle = `export function ${fnName}(`;
  const i = content.indexOf(needle);
  if (i < 0) return content;
  const brace = content.indexOf(") {", i);
  if (brace < 0) return content;
  const insertAt = brace + 4;
  if (content.slice(insertAt, insertAt + 200).includes("useCmAdminLabels")) return content;
  return `${content.slice(0, insertAt)}
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
${content.slice(insertAt)}`;
}

function addDetailHook(content) {
  const needle = "export function AdminCommunityMessengerDetailPage";
  const i = content.indexOf(needle);
  const brace = content.indexOf(") {", i);
  const insertAt = brace + 4;
  if (content.slice(insertAt, insertAt + 200).includes("useCmAdminLabels")) return content;
  return `${content.slice(0, insertAt)}
  const { t, formatDateTime, roomTypeLabel, forceEndReasonOptions, forceEndReasonLabel } = useCmAdminLabels();
${content.slice(insertAt)}`;
}

const replacements = [
  // common alerts/errors detail
  ['alert(json.error ?? "처리에 실패했습니다.");', 'alert(json.error ?? t("admin_cm_err_action_failed"));'],
  ['alert(json.error ?? "메시지 조치에 실패했습니다.");', 'alert(json.error ?? t("admin_cm_err_message_action_failed"));'],
  [
    `json.error === "admin_note_required"
              ? "강제 종료에는 운영 메모가 필수입니다."
              : json.error === "reason_code_required"
                ? "강제 종료 사유 코드를 선택해 주세요."
                : (json.error ?? "통화 세션 처리에 실패했습니다.")`,
    `json.error === "admin_note_required"
              ? t("admin_cm_err_force_end_note_required")
              : json.error === "reason_code_required"
                ? t("admin_cm_err_force_end_reason_required")
                : (json.error ?? t("admin_cm_err_call_action_failed"))`,
  ],
  ['alert("강제 종료 사유 코드를 선택해 주세요.");', 'alert(t("admin_cm_err_force_end_reason_required"));'],
  ['alert("강제 종료 사유를 운영 메모에 입력해 주세요.");', 'alert(t("admin_cm_err_force_end_note_input_required"));'],
  ['alert(json.error ?? "신고 처리에 실패했습니다.");', 'alert(json.error ?? t("admin_cm_err_report_failed"));'],
  ['alert(json.error ?? "신고 처리 실패");', 'alert(json.error ?? t("admin_cm_err_report_action_failed"));'],
  [
    'return <div className="py-10 text-center sam-text-body text-sam-muted">불러오는 중...</motion.div>;',
    'return <div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_common_loading")}</motion.div>;',
  ],
  [
    'return <div className="py-10 text-center sam-text-body text-sam-muted">불러오는 중...</div>;',
    'return <motion.div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_common_loading")}</motion.div>;',
  ],
];

// fix loading/not found for detail - use div not motion
const detailLoading = [
  [
    'return <div className="py-10 text-center sam-text-body text-sam-muted">불러오는 중...</div>;',
    'return <div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_common_loading")}</motion.div>;',
  ],
];

const overviewReplacements = [
  ['const FORCE_END_HEATMAP_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;', "// weekdays from useCmAdminLabels"],
  [
    'const FORCE_END_HEATMAP_HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}시`);',
    "// heatmapHours from useCmAdminLabels",
  ],
  ['title="커뮤니티 메신저 운영"', 'titleKey="admin_cm_page_overview_title"'],
  [
    'description="친구 요청, 1:1·그룹 채팅방, 통화 기록을 관리자에서 통합 관리합니다."',
    'descriptionKey="admin_cm_page_overview_desc"',
  ],
  ['title="메신저 방 상세"', 'titleKey="admin_cm_page_detail_title"'],
  ['description="방 상태 조치, 참여자 확인, 메시지 흐름 점검"', 'descriptionKey="admin_cm_page_detail_desc"'],
  ['<AdminCard title="', '<AdminCard titleKey="'],
  ['titleKey="강제 종료 분석"', 'titleKey="admin_cm_card_force_end_analysis"'],
  ['titleKey="강제 종료 사유 KPI"', 'titleKey="admin_cm_card_force_end_kpi"'],
  ['titleKey="강제 종료 추이"', 'titleKey="admin_cm_card_force_end_trend"'],
  ['titleKey="관리자별 강제 종료 집계"', 'titleKey="admin_cm_card_force_end_by_admin"'],
  ['titleKey="방 유형별 강제 종료 분석"', 'titleKey="admin_cm_card_force_end_by_room_type"'],
  ['titleKey="강제 종료 재발 분석"', 'titleKey="admin_cm_card_force_end_recurrence"'],
  ['titleKey="사유 코드 x 재발 여부"', 'titleKey="admin_cm_card_force_end_reason_recurrence"'],
  ['titleKey="관리자별 재발 억제 효과"', 'titleKey="admin_cm_card_force_end_admin_effect"'],
  ['titleKey="시간대별 강제 종료/재발 히트맵"', 'titleKey="admin_cm_card_force_end_heatmap"'],
  ['titleKey="사유 코드 x 시간대 히트맵"', 'titleKey="admin_cm_card_force_end_reason_heatmap"'],
  ['titleKey="사유 코드 x 관리자"', 'titleKey="admin_cm_card_force_end_reason_admin"'],
  ['titleKey="메신저 방 목록"', 'titleKey="admin_cm_card_room_list"'],
  ['titleKey="활성 통화 세션"', 'titleKey="admin_cm_card_active_calls"'],
  ['titleKey="친구 요청 관리"', 'titleKey="admin_cm_card_friend_requests"'],
  ['titleKey="최근 통화 기록"', 'titleKey="admin_cm_card_recent_calls"'],
  ['titleKey="강제 종료 감사 로그"', 'titleKey="admin_cm_card_force_end_audit"'],
  ['titleKey="최근 메신저 신고"', 'titleKey="admin_cm_card_recent_reports"'],
  ['titleKey="방 정보"', 'titleKey="admin_cm_card_room_info"'],
  ['titleKey="운영 조치"', 'titleKey="admin_cm_card_ops_actions"'],
  ['titleKey="참여자"', 'titleKey="admin_cm_card_participants"'],
  ['titleKey="최근 통화"', 'titleKey="admin_cm_card_recent_calls_detail"'],
  ['titleKey="메시지 타임라인"', 'titleKey="admin_cm_card_message_timeline"'],
  ['titleKey="방 신고 내역"', 'titleKey="admin_cm_card_room_reports"'],
  ['<option value="">모든 사유 코드</option>', '<option value="">{t("admin_cm_filter_all_reason_codes")}</option>'],
  ['<option value="">전체 기간</option>', '<option value="">{t("admin_cm_period_all")}</option>'],
  ['<option value="24h">최근 24시간</option>', '<option value="24h">{t("admin_cm_period_24h")}</option>'],
  ['<option value="7d">최근 7일</option>', '<option value="7d">{t("admin_cm_period_7d")}</option>'],
  ['<option value="30d">최근 30일</option>', '<option value="30d">{t("admin_cm_period_30d")}</option>'],
  ['필터 초기화', '{t("admin_cm_filter_reset")}'],
  [
    '<motion.div className="flex items-center sam-text-helper text-sam-muted">분석 대상 {filteredAnalyticsAudits.length}건</motion.div>',
    '<div className="flex items-center sam-text-helper text-sam-muted">{t("admin_cm_common_analysis_target", { count: filteredAnalyticsAudits.length })}</motion.div>',
  ],
];

function applyReplacements(content, list) {
  let s = content;
  for (const [from, to] of list) {
    if (!s.includes(from)) continue;
    s = s.replaceAll(from, to);
  }
  return s;
}

// Detail
let detail = read("components/admin/community-messenger/AdminCommunityMessengerDetailPage.tsx");
detail = ensureImport(detail);
detail = addDetailHook(detail);
detail = applyReplacements(detail, replacements);
detail = detail.replace(
  'return <motion.div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_common_loading")}</motion.div>;',
  'return <div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_common_loading")}</motion.div>;'
);
detail = detail.replace(
  'return <div className="py-10 text-center sam-text-body text-sam-muted">메신저 방을 찾을 수 없습니다.</div>;',
  'return <div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_room_not_found")}</motion.div>;'
);
detail = detail.replace(
  '{t("admin_cm_empty_room_not_found")}</motion.div>',
  '{t("admin_cm_empty_room_not_found")}</motion.div>'
);
write("components/admin/community-messenger/AdminCommunityMessengerDetailPage.tsx", detail);

// Overview
let overview = read("components/admin/community-messenger/AdminCommunityMessengerPage.tsx");
overview = ensureImport(overview);
overview = addMainHook(overview, "AdminCommunityMessengerPage");
overview = applyReplacements(overview, [...replacements, ...overviewReplacements]);
write("components/admin/community-messenger/AdminCommunityMessengerPage.tsx", overview);

console.log("done");
