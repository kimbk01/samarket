import fs from "node:fs";
import path from "node:path";

const ROOT = "c:/samarket";
const DIRS = [
  "components/admin/points",
  "components/admin/point-policies",
  "components/admin/point-executions",
];

const SKIP = new Set(["admin-points-notifications-i18n.ts"]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (e.name.endsWith(".tsx") && !SKIP.has(e.name)) out.push(f);
  }
  return out;
}

function ensureUseI18n(src, isClient) {
  if (!isClient || src.includes("useI18n")) return src;
  if (!src.includes('"use client"')) return src;
  let s = src.replace(
    /(import .+ from "react";\n)/,
    `$1import { useI18n } from "@/components/i18n/AppLanguageProvider";\n`
  );
  if (!s.includes("useI18n")) {
    s = src.replace(
      /"use client";\n\n/,
      `"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n`
    );
  }
  s = s.replace(
    /export function (\w+)\([^)]*\) \{\n(?!\s*const \{ t \})/,
    (m) => `${m}  const { t } = useI18n();\n`
  );
  return s;
}

/** @type {[RegExp|string, string][]} */
const REPS = [
  ['title="포인트 충전 신청 관리"', 'titleKey="admin_points_charge_page_list"'],
  ['title="포인트 충전 상세"', 'titleKey="admin_points_charge_page_detail"'],
  ['title="포인트 만료"', 'titleKey="admin_points_expire_page"'],
  ['title="포인트 정책"', 'titleKey="admin_points_policy_page"'],
  ['title="포인트 지급/회수 실행"', 'titleKey="admin_points_exec_page"'],
  ['title="포인트 실행 상세"', 'titleKey="admin_points_exec_page_detail"'],
  ['title="신청 정보"', 'titleKey="admin_points_charge_card_request_info"'],
  ['title="관리자 메모 (placeholder)"', 'titleKey="admin_points_admin_memo_card"'],
  ['title="포인트 수동 조정 (placeholder)"', 'titleKey="admin_points_charge_card_manual_adjust"'],
  ['title="변경 이력"', 'titleKey="admin_points_card_change_history"'],
  ['title="적용 정책"', 'titleKey="admin_points_expire_card_policy"'],
  ['title="만료 실행"', 'titleKey="admin_points_expire_card_run"'],
  ['title="실행 결과 요약"', 'titleKey="admin_points_expire_card_summary"'],
  ['title="만료 실행 이력"', 'titleKey="admin_points_expire_card_history"'],
  ['title="만료 로그"', 'titleKey="admin_points_expire_card_logs"'],
  ['title="게시판별 포인트 정책"', 'titleKey="admin_points_policy_card_board"'],
  ['title="확률 구간 (확률형 정책용)"', 'titleKey="admin_points_policy_card_probability"'],
  ['title="이벤트 포인트 배율"', 'titleKey="admin_points_policy_card_event"'],
  ['title="포인트 지급 시뮬레이션"', 'titleKey="admin_points_policy_card_simulate"'],
  ['title="정책 변경 이력"', 'titleKey="admin_points_policy_card_logs"'],
  ['title="테스트 지급 실행"', 'titleKey="admin_points_exec_card_test"'],
  ['title="지급/차단 실행 이력"', 'titleKey="admin_points_exec_card_history"'],
  ['title="포인트 회수 정책"', 'titleKey="admin_points_exec_card_reclaim"'],
  ['title="지급·회수 로그"', 'titleKey="admin_points_exec_card_logs"'],
  ['title="실행 정보"', 'titleKey="admin_points_exec_card_info"'],
  ['title="관련 지급/회수 로그"', 'titleKey="admin_points_exec_card_related_logs"'],
  ['POINT_CHARGE_STATUS_LABELS[', 'pointChargeStatusLabel(t, '],
  ['POINT_PAYMENT_METHOD_LABELS[', 'pointPaymentMethodLabel(t, '],
  ['POINT_LEDGER_ENTRY_LABELS[', 'pointLedgerTypeLabel(t, '],
  ['POINT_EXPIRE_RUN_CYCLE_LABELS[', 'pointExpireCycleLabel(t, '],
  ['POINT_EXPIRE_EXECUTION_STATUS_LABELS[', 'pointExpireExecStatusLabel(t, '],
  ['REWARD_TYPE_LABELS[', 'pointRewardTypeLabel(t, '],
  ['TARGET_TYPE_LABELS[', 'pointActionTypeLabel(t, '],
  ['POINT_REWARD_ACTION_LABELS[', 'pointActionTypeLabel(t, '],
  ['POINT_EXECUTION_STATUS_LABELS[', 'pointExecStatusLabel(t, '],
  ['USER_TYPE_LABELS[', 'pointUserTypeLabel(t, '],
  ['getBoardName(', 'pointBoardLabel(t, '],
];

const IMPORT_HELPERS = `import {
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

let changed = 0;
for (const dir of DIRS) {
  const full = path.join(ROOT, dir);
  for (const file of walk(full)) {
    let src = fs.readFileSync(file, "utf8");
    const orig = src;
    const isClient = src.includes('"use client"');
    src = ensureUseI18n(src, isClient);
    if (
      isClient &&
      (src.includes("pointChargeStatusLabel") || src.includes("pointBoardLabel")) &&
      !src.includes("admin-points-notifications-i18n")
    ) {
      src = src.replace(
        /import { useI18n }[^\n]+\n/,
        `$&${IMPORT_HELPERS}`
      );
    }
    for (const [from, to] of REPS) {
      if (typeof from === "string") src = src.split(from).join(to);
      else src = src.replace(from, to);
    }
    // Remove old util imports when fully replaced
    src = src.replace(
      /import \{[^}]*POINT_CHARGE_STATUS_LABELS[^}]*\} from "@\/lib\/points\/point-utils";\n/g,
      ""
    );
    src = src.replace(
      /import \{[^}]*POINT_PAYMENT_METHOD_LABELS[^}]*\} from "@\/lib\/points\/point-utils";\n/g,
      ""
    );
    src = src.replace(
      /import \{[^}]*POINT_LEDGER_ENTRY_LABELS[^}]*\} from "@\/lib\/points\/point-utils";\n/g,
      ""
    );
    src = src.replace(
      /import \{[^}]*POINT_EXPIRE_RUN_CYCLE_LABELS[^}]*\} from "@\/lib\/points\/point-expire-utils";\n/g,
      ""
    );
    src = src.replace(
      /import \{[^}]*POINT_EXPIRE_EXECUTION_STATUS_LABELS[^}]*\} from "@\/lib\/points\/point-expire-utils";\n/g,
      ""
    );
    src = src.replace(
      /import \{[^}]*REWARD_TYPE_LABELS[^}]*\} from "@\/lib\/point-policies\/point-policy-utils";\n/g,
      ""
    );
    src = src.replace(
      /import \{[^}]*TARGET_TYPE_LABELS[^}]*\} from "@\/lib\/point-policies\/point-policy-utils";\n/g,
      ""
    );
    src = src.replace(
      /import \{[^}]*POINT_REWARD_ACTION_LABELS[^}]*\} from "@\/lib\/point-executions\/point-execution-utils";\n/g,
      ""
    );
    src = src.replace(
      /import \{[^}]*POINT_EXECUTION_STATUS_LABELS[^}]*\} from "@\/lib\/point-executions\/point-execution-utils";\n/g,
      ""
    );
    src = src.replace(
      /import \{[^}]*USER_TYPE_LABELS[^}]*\} from "@\/lib\/point-policies\/point-policy-utils";\n/g,
      ""
    );
    src = src.replace(
      /import \{ getBoardName \} from "@\/lib\/point-policies\/point-policy-utils";\n/g,
      ""
    );
    if (src !== orig) {
      fs.writeFileSync(file, src);
      changed++;
      console.log("patched", path.relative(ROOT, file));
    }
  }
}
console.log("files patched:", changed);
