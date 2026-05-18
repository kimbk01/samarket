import fs from "node:fs";
import path from "node:path";

const ROOT = "c:/samarket";
const DIRS = [
  "components/admin/points",
  "components/admin/point-policies",
  "components/admin/point-executions",
];
const SKIP = new Set(["admin-points-notifications-i18n.ts"]);

/** exact string -> t key or JSX expr */
const QMAP = {
  "충전 신청을 찾을 수 없습니다.": 't("admin_points_charge_not_found")',
  "충전 신청 내역이 없습니다.": 't("admin_points_charge_empty_list")',
  "처리 실패": 't("admin_points_err_action_failed")',
  "승인": 't("admin_points_action_approve")',
  "반려": 't("admin_points_action_reject")',
  "보류": 't("admin_points_action_hold")',
  "처리완료": 't("admin_points_done")',
  "저장": 't("common_save")',
  "취소": 't("common_cancel")',
  "편집": 't("common_edit")',
  "삭제": 't("common_delete")',
  "이력 없음": 't("admin_points_history_empty")',
  "메모 입력": 't("admin_points_admin_memo_ph")',
  "관리자 메모": 't("admin_points_admin_memo_inline_ph")',
  "특정 사용자 포인트 증감은 원장 화면에서 연결 예정": 't("admin_points_charge_manual_adjust_hint")',
  "포인트 원장": 't("admin_points_ledger_page")',
  "원장 내역이 없습니다.": 't("admin_points_ledger_empty")',
  "활성화된 만료 정책이 없습니다.": 't("admin_points_expire_no_policy")',
  "만료 시뮬레이션 / 실행": 't("admin_points_expire_run_title")',
  "기준일": 't("admin_points_expire_label_as_of")',
  "시뮬레이션": 't("admin_points_btn_simulate")',
  "만료 실행": 't("admin_points_expire_btn_run")',
  "처리 중…": 't("admin_points_processing")',
  "실행 완료": 't("admin_points_expire_run_done")',
  "만료 실행 이력이 없습니다.": 't("admin_points_expire_history_empty")',
  "만료 로그가 없습니다.": 't("admin_points_expire_logs_empty")',
  "전체": 't("common_all")',
  "입금확인대기": 't("admin_points_charge_summary_waiting")',
  "대기중": 't("admin_points_charge_summary_pending")',
  "승인완료": 't("admin_points_charge_summary_approved")',
  "정책 추가": 't("admin_points_policy_btn_add")',
  "정책 선택": 't("admin_points_policy_label_select_policy")',
  "선택": 't("admin_points_select")',
  "이벤트 추가": 't("admin_points_policy_btn_add_event")',
  "결과": 't("admin_points_policy_sim_result")',
  "등록된 게시판 포인트 정책이 없습니다.": 't("admin_points_policy_board_empty")',
  "등록된 이벤트 포인트 정책이 없습니다.": 't("admin_points_policy_event_empty")',
  "이벤트명": 't("admin_points_policy_event_title_ph")',
  "변경 이력이 없습니다.": 't("admin_points_policy_log_empty")',
  "위에서 확률형 정책을 선택하면 구간을 설정할 수 있습니다.": 't("admin_points_policy_prob_hint_select")',
  "구간 추가": 't("admin_points_policy_prob_btn_add_band")',
  "새 확률 구간": 't("admin_points_policy_prob_new_band")',
  "확률 구간이 없습니다. 게시판 정책에서 확률형을 사용할 때 여기에서 구간을 설정합니다.": 't("admin_points_policy_prob_empty")',
  "(100% 권장)": 't("admin_points_policy_prob_total_hint")',
  "추가": 't("admin_points_btn_add")',
  "해당 실행을 찾을 수 없습니다.": 't("admin_points_exec_not_found")',
  "지급/차단 실행 이력이 없습니다.": 't("admin_points_exec_history_empty")',
  "지급/회수 로그가 없습니다.": 't("admin_points_exec_logs_empty")',
  "회수 정책이 없습니다.": 't("admin_points_exec_reclaim_empty")',
  "전체 게시판": 't("admin_points_filter_all_boards")',
  "전체 행동": 't("admin_points_filter_all_actions")',
  "사용자 ID": 't("admin_points_ph_user_id")',
  "실행": 't("admin_points_btn_run")',
  "테스트": 't("admin_points_test_nickname")',
  "고정": 't("admin_points_reward_short_fixed")',
  "확률형": 't("admin_points_reward_short_random")',
  "활성": 't("admin_points_status_active")',
  "비활성": 't("admin_points_status_inactive")',
  "허용": 't("admin_points_allowed")',
  "비허용": 't("admin_points_denied")',
  "자유게시판": 't("admin_points_board_general")',
  "게시판 정책": 't("admin_points_policy_tab_board")',
  "확률 구간": 't("admin_points_policy_tab_probability")',
  "이벤트 배율": 't("admin_points_policy_tab_event")',
  "변경 이력": 't("admin_points_policy_tab_logs")',
  "지급/실행 이력": 't("admin_points_exec_tab_executions")',
  "회수 정책": 't("admin_points_exec_tab_reclaim")',
  "지급·회수 로그": 't("admin_points_exec_tab_logs")',
  "무상 한도로 인해 상한 적용됨": 't("admin_points_policy_sim_cap_applied")',
  "쿨다운으로 차단됨": 't("admin_points_policy_sim_cooldown_blocked")',
  "상한 도달 ": 't("admin_points_exec_block_cap") + " "',
  "쿨다운 ": 't("admin_points_exec_block_cooldown") + " "',
  "중복 ": 't("admin_points_exec_block_duplicate") + " "',
};

const TITLE_MAP = {
  "포인트 충전 신청 관리": "admin_points_charge_page_list",
  "포인트 충전 상세": "admin_points_charge_page_detail",
  "포인트 만료": "admin_points_expire_page",
  "포인트 정책": "admin_points_policy_page",
  "포인트 지급/회수 실행": "admin_points_exec_page",
  "포인트 실행 상세": "admin_points_exec_page_detail",
  "신청 정보": "admin_points_charge_card_request_info",
  "관리자 메모 (placeholder)": "admin_points_admin_memo_card",
  "포인트 수동 조정 (placeholder)": "admin_points_charge_card_manual_adjust",
  "변경 이력": "admin_points_card_change_history",
  "적용 정책": "admin_points_expire_card_policy",
  "만료 실행": "admin_points_expire_card_run",
  "실행 결과 요약": "admin_points_expire_card_summary",
  "만료 실행 이력": "admin_points_expire_card_history",
  "만료 로그": "admin_points_expire_card_logs",
  "게시판별 포인트 정책": "admin_points_policy_card_board",
  "확률 구간 (확률형 정책용)": "admin_points_policy_card_probability",
  "이벤트 포인트 배율": "admin_points_policy_card_event",
  "포인트 지급 시뮬레이션": "admin_points_policy_card_simulate",
  "정책 변경 이력": "admin_points_policy_card_logs",
  "테스트 지급 실행": "admin_points_exec_card_test",
  "지급/차단 실행 이력": "admin_points_exec_card_history",
  "포인트 회수 정책": "admin_points_exec_card_reclaim",
  "실행 정보": "admin_points_exec_card_info",
  "관련 지급/회수 로그": "admin_points_exec_card_related_logs",
};

const TH_MAP = {
  신청자: "admin_points_charge_label_applicant",
  상품: "admin_points_charge_label_product",
  "결제 금액 / 지급 포인트": "admin_points_charge_label_payment_points",
  "결제 방식": "admin_points_charge_label_payment_method",
  상태: "admin_points_th_status",
  입금자명: "admin_points_charge_label_depositor",
  "신청일 / 수정일": "admin_points_charge_label_dates",
  "신청자 메모": "admin_points_charge_label_user_memo",
  사용자: "admin_points_th_user",
  유형: "admin_points_th_type",
  금액: "admin_points_th_amount",
  잔액: "admin_points_th_balance",
  설명: "admin_points_th_description",
  일시: "admin_points_th_datetime",
  "실행 건수": "admin_points_expire_label_run_count",
  "총 만료 P": "admin_points_expire_label_total_expired_p",
  "만료 일수": "admin_points_expire_label_days",
  "제외 유형": "admin_points_expire_label_exclude_types",
  "실행 주기": "admin_points_expire_label_run_cycle",
  "자동 실행": "admin_points_expire_label_auto_run",
  "사용자 조회": "admin_points_expire_label_user_view",
  실행일: "admin_points_expire_th_run_date",
  "대상 사용자": "admin_points_expire_th_target_user",
  "만료 P": "admin_points_expire_th_expired_p",
  만료일: "admin_points_expire_th_expire_date",
  "플랜/포인트": "admin_points_charge_th_plan_points",
  결제방식: "admin_points_charge_th_payment",
  신청일: "admin_points_charge_th_requested_at",
  메모: "admin_points_charge_th_memo",
  액션: "admin_points_th_action",
  "상품/금액": "admin_points_charge_th_product_amount",
  게시판: "admin_points_th_board",
  행동: "admin_points_th_action",
  글쓰기: "admin_points_action_write",
  댓글: "admin_points_action_comment",
  쿨다운: "admin_points_policy_th_cooldown",
  무상한도: "admin_points_policy_th_free_cap",
  작업: "admin_points_th_work",
  제목: "admin_points_policy_event_title",
  기간: "admin_points_policy_th_period",
  "글/댓글 배율": "admin_points_policy_th_multipliers",
  "대상 게시판": "admin_points_policy_th_target_boards",
  "시작일시": "admin_points_policy_event_start",
  "종료일시": "admin_points_policy_event_end",
  "글쓰기 배율": "admin_points_policy_event_write_mult",
  "댓글 배율": "admin_points_policy_event_comment_mult",
  비고: "admin_points_policy_event_note",
  대상: "admin_points_th_target",
  "최소 P": "admin_points_policy_prob_label_min_p",
  "최대 P": "admin_points_policy_prob_label_max_p",
  "확률(%)": "admin_points_policy_prob_label_percent",
  순서: "admin_points_policy_prob_label_order",
  "구간(최소~최대)P": "admin_points_policy_prob_th_range",
  "실행 키": "admin_points_exec_label_exec_key",
  "보상 유형": "admin_points_exec_label_reward_type",
  "기본 P / 배율 / 최종 P": "admin_points_exec_label_points_formula",
  "차단 사유": "admin_points_exec_label_block_reason",
  "실행 일시": "admin_points_exec_label_run_at",
  "회수 일시": "admin_points_exec_label_reversed_at",
  "발동 조건": "admin_points_exec_th_trigger",
  "회수 방식": "admin_points_exec_th_reclaim_mode",
  비율: "admin_points_exec_th_ratio",
  포인트: "admin_points_th_points",
  "대상 ID": "admin_points_exec_label_target_id",
  "대상 유형": "admin_points_exec_label_target_type",
  닉네임: "admin_points_exec_label_nickname",
  "회원 유형": "admin_points_th_type",
  "현재 포인트 잔액": "admin_points_policy_sim_label_balance",
  "지급 포인트": "admin_points_policy_sim_reward_points",
  "적용 배율": "admin_points_policy_sim_multiplier",
};

const HELPERS = `import {
  pointActionTypeLabel,
  pointBoardLabel,
  pointChargeStatusLabel,
  pointExecStatusLabel,
  pointExpireCycleLabel,
  pointExpireExecStatusLabel,
  pointLedgerTypeLabel,
  pointPaymentMethodLabel,
  pointRewardTypeLabel,
  pointUserTypeLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";
`;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (e.name.endsWith(".tsx") && !SKIP.has(e.name)) out.push(f);
  }
  return out;
}

function migrate(src) {
  if (!src.includes('"use client"')) return src;
  if (!src.includes("useI18n")) {
    src = src.replace(
      /"use client";\n\n/,
      `"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n${HELPERS}\n`
    );
    src = src.replace(/export function (\w+)\([^)]*\) \{\n/, (m) => `${m}  const { t } = useI18n();\n`);
  }
  for (const [ko, key] of Object.entries(TITLE_MAP)) {
    src = src.replaceAll(`title="${ko}"`, `titleKey="${key}"`);
    src = src.replaceAll(`title="${ko}"`, `titleKey="${key}"`);
  }
  for (const [ko, expr] of Object.entries(QMAP)) {
    src = src.replaceAll(`"${ko}"`, `{${expr}}`);
    src = src.replaceAll(`'${ko}'`, `{${expr}}`);
  }
  for (const [ko, key] of Object.entries(TH_MAP)) {
    src = src.replaceAll(`>${ko}<`, `>{t("${key}")}<`);
    src = src.replaceAll(`>${ko}</th>`, `>{t("${key}")}</th>`);
    src = src.replaceAll(`>${ko}</dt>`, `>{t("${key}")}</dt>`);
    src = src.replaceAll(`>${ko}</label>`, `>{t("${key}")}</label>`);
    src = src.replaceAll(`>${ko}</span>`, `>{t("${key}")}</span>`);
    src = src.replaceAll(`>${ko}</h3>`, `>{t("${key}")}</h3>`);
    src = src.replaceAll(`>${ko}</h2>`, `>{t("${key}")}</h2>`);
    src = src.replaceAll(`>${ko}</h1>`, `>{t("${key}")}</h1>`);
    src = src.replaceAll(`placeholder="${ko}"`, `placeholder={t("${key}")}`);
    src = src.replaceAll(`label: "${ko}"`, `label: t("${key}")`);
  }
  src = src.replaceAll("POINT_CHARGE_STATUS_LABELS[", "pointChargeStatusLabel(t, ");
  src = src.replaceAll("POINT_PAYMENT_METHOD_LABELS[", "pointPaymentMethodLabel(t, ");
  src = src.replaceAll("POINT_LEDGER_ENTRY_LABELS[", "pointLedgerTypeLabel(t, ");
  src = src.replaceAll("POINT_EXPIRE_RUN_CYCLE_LABELS[", "pointExpireCycleLabel(t, ");
  src = src.replaceAll("POINT_EXPIRE_EXECUTION_STATUS_LABELS[", "pointExpireExecStatusLabel(t, ");
  src = src.replaceAll("REWARD_TYPE_LABELS[", "pointRewardTypeLabel(t, ");
  src = src.replaceAll("TARGET_TYPE_LABELS[", "pointActionTypeLabel(t, ");
  src = src.replaceAll("POINT_REWARD_ACTION_LABELS[", "pointActionTypeLabel(t, ");
  src = src.replaceAll("POINT_EXECUTION_STATUS_LABELS[", "pointExecStatusLabel(t, ");
  src = src.replaceAll("USER_TYPE_LABELS[", "pointUserTypeLabel(t, ");
  src = src.replaceAll("getBoardName(", "pointBoardLabel(t, ");
  return src;
}

let n = 0;
for (const dir of DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const orig = fs.readFileSync(file, "utf8");
    const next = migrate(orig);
    if (next !== orig) {
      fs.writeFileSync(file, next);
      n++;
      console.log(path.relative(ROOT, file));
    }
  }
}
console.log("updated", n);
