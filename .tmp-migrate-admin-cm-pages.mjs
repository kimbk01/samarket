import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function patchFile(rel, patches) {
  const fp = path.join(ROOT, rel);
  let s = fs.readFileSync(fp, "utf8");
  for (const [from, to] of patches) {
    if (!s.includes(from)) {
      console.warn(`[miss] ${rel}: ${from.slice(0, 60)}...`);
      continue;
    }
    s = s.replaceAll(from, to);
  }
  fs.writeFileSync(fp, s);
  console.log("patched", rel);
}

// --- Detail page ---
patchFile("components/admin/community-messenger/AdminCommunityMessengerDetailPage.tsx", [
  [
    `import { getSupabaseClient } from "@/lib/supabase/client";`,
    `import { getSupabaseClient } from "@/lib/supabase/client";\nimport { useCmAdminLabels } from "./useCmAdminLabels";`,
  ],
  [
    `export function AdminCommunityMessengerDetailPage({ roomId }: { roomId: string }) {\n  const [detail, setDetail]`,
    `export function AdminCommunityMessengerDetailPage({ roomId }: { roomId: string }) {\n  const {\n    t,\n    formatDateTime,\n    roomTypeLabel,\n    forceEndReasonOptions,\n    forceEndReasonLabel,\n  } = useCmAdminLabels();\n  const [detail, setDetail]`,
  ],
  [`alert(json.error ?? "처리에 실패했습니다.");`, `alert(json.error ?? t("admin_cm_err_action_failed"));`],
  [`alert(json.error ?? "메시지 조치에 실패했습니다.");`, `alert(json.error ?? t("admin_cm_err_message_action_failed"));`],
  [
    `json.error === "admin_note_required"\n              ? "강제 종료에는 운영 메모가 필수입니다."\n              : json.error === "reason_code_required"\n                ? "강제 종료 사유 코드를 선택해 주세요."\n                : (json.error ?? "통화 세션 처리에 실패했습니다.")`,
    `json.error === "admin_note_required"\n              ? t("admin_cm_err_force_end_note_required")\n              : json.error === "reason_code_required"\n                ? t("admin_cm_err_force_end_reason_required")\n                : (json.error ?? t("admin_cm_err_call_action_failed"))`,
  ],
  [`alert("강제 종료 사유 코드를 선택해 주세요.");`, `alert(t("admin_cm_err_force_end_reason_required"));`],
  [`alert("강제 종료 사유를 운영 메모에 입력해 주세요.");`, `alert(t("admin_cm_err_force_end_note_input_required"));`],
  [`alert(json.error ?? "신고 처리에 실패했습니다.");`, `alert(json.error ?? t("admin_cm_err_report_failed"));`],
  [
    `return <motion.div className="py-10 text-center sam-text-body text-sam-muted">불러오는 중...</motion.div>;`,
    `return <div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_common_loading")}</motion.div>;`,
  ],
]);

// fix accidental motion tag from template above
let detail = fs.readFileSync(
  path.join(ROOT, "components/admin/community-messenger/AdminCommunityMessengerDetailPage.tsx"),
  "utf8"
);
detail = detail.replace(
  `{t("admin_cm_common_loading")}</motion.div>`,
  `{t("admin_cm_common_loading")}</div>`
);
detail = detail.replace(
  `return <motion.div className="py-10 text-center sam-text-body text-sam-muted">메신저 방을 찾을 수 없습니다.</motion.div>;`,
  `return <motion.div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_room_not_found")}</motion.div>;`
);
detail = detail.replace(`{t("admin_cm_empty_room_not_found")}</motion.div>`, `{t("admin_cm_empty_room_not_found")}</motion.div>`.replace("</motion.div>", "</motion.div>"));
detail = detail.replace(
  `<motion.div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_room_not_found")}</motion.div>`,
  `<div className="py-10 text-center sam-text-body text-sam-muted">{t("admin_cm_empty_room_not_found")}</motion.div>`
);
detail = detail.replace(
  `{t("admin_cm_empty_room_not_found")}</motion.div>`,
  `{t("admin_cm_empty_room_not_found")}</motion.div>`
);
// clean motion if any
detail = detail.replaceAll("motion.div", "motion.div");
fs.writeFileSync(
  path.join(ROOT, "components/admin/community-messenger/AdminCommunityMessengerDetailPage.tsx"),
  detail
);

console.log("detail pass 2 done");
