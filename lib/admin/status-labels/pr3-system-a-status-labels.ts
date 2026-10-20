/**
 * PR-3 시스템 A 화면 상태 라벨 (원시 코드 미노출).
 * 화면에서 import 만 하면 등록된다 (부수효과).
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";

/** 배포 검증 이력 — 승격 기록 상태 + 작업 기록 action (`lib/admin/deploy-promotion/*`). */
registerAdminStatusLabels("pr3-system-a.deploy-history", {
  unverified: { ko: "미검증", en: "Unverified", tone: "neutral" },
  pending_verify: { ko: "검증 대기", en: "Pending verify", tone: "neutral" },
  gates_running: { ko: "점검 중", en: "Checks running", tone: "info" },
  verified: { ko: "검증 완료", en: "Verified", tone: "success" },
  verify_cancelled: { ko: "검증 취소", en: "Verify cancelled", tone: "warning" },
  promote_locked: { ko: "적용 잠김", en: "Promote locked", tone: "warning" },
  promoting: { ko: "적용 중", en: "Promoting", tone: "info" },
  promoted: { ko: "적용됨", en: "Promoted", tone: "success" },
  success: { ko: "성공", en: "Success", tone: "success" },
  failed: { ko: "실패", en: "Failed", tone: "danger" },
  rolled_back: { ko: "복구됨", en: "Rolled back", tone: "warning" },
  evidence: { ko: "점검 기록", en: "Check evidence", tone: "info" },
  invalidate_sha_changed: { ko: "버전 변경으로 검증 무효", en: "Invalidated (version changed)", tone: "warning" },
  mark_verified: { ko: "검증 완료", en: "Verified", tone: "success" },
  cancel_verified: { ko: "검증 취소", en: "Verify cancelled", tone: "warning" },
  pipeline_mock: { ko: "모의 배포", en: "Mock deploy", tone: "neutral" },
});
