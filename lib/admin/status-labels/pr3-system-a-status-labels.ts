/**
 * PR-3 시스템 A 화면 상태 라벨 (원시 코드 미노출).
 * 화면에서 import 만 하면 등록된다 (부수효과).
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";
import { catalogPair } from "@/lib/i18n/catalog-pair";

/** 배포 검증 이력 — 승격 기록 상태 + 작업 기록 action (`lib/admin/deploy-promotion/*`). */
registerAdminStatusLabels("pr3-system-a.deploy-history", {
  unverified: { ...catalogPair("admin_unverified"), tone: "neutral" },
  pending_verify: { ...catalogPair("admin_pending_verify"), tone: "neutral" },
  gates_running: { ...catalogPair("admin_checks_running"), tone: "info" },
  verified: { ...catalogPair("admin_verified"), tone: "success" },
  verify_cancelled: { ...catalogPair("admin_verify_cancelled"), tone: "warning" },
  promote_locked: { ...catalogPair("admin_promote_locked"), tone: "warning" },
  promoting: { ...catalogPair("admin_promoting"), tone: "info" },
  promoted: { ...catalogPair("admin_promoted"), tone: "success" },
  success: { ...catalogPair("admin_del_alert_th_success"), tone: "success" },
  failed: { ...catalogPair("admin_meeting_engine_err_generic"), tone: "danger" },
  rolled_back: { ...catalogPair("admin_rolled_back_2"), tone: "warning" },
  evidence: { ...catalogPair("admin_check_evidence"), tone: "info" },
  invalidate_sha_changed: { ...catalogPair("admin_invalidated_version_changed"), tone: "warning" },
  mark_verified: { ...catalogPair("admin_verified"), tone: "success" },
  cancel_verified: { ...catalogPair("admin_verify_cancelled"), tone: "warning" },
  pipeline_mock: { ...catalogPair("admin_mock_deploy"), tone: "neutral" },
});
