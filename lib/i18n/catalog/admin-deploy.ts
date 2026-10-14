/**
 * Admin deploy / promote UI i18n.
 * Spread into runtime MESSAGES + MessageKey only — NOT into adminMessages
 * (avoids TS7056 declaration emit growth on the giant admin catalog).
 */

export const adminDeployMessages = {
  ko: {
    admin_menu_system_deploy: "배포 · 운영 적용",
    admin_deploy_title: "배포 · 운영 적용",
    admin_deploy_subtitle: "1차 범위: Web SHA만. DB·Android·iOS는 별도 승인.",
    admin_deploy_runtime: "현재 런타임",
    admin_deploy_status_label: "검증 상태",
    admin_deploy_mark_verified: "검증 완료",
    admin_deploy_cancel_verified: "검증 취소",
    admin_deploy_promote_web: "운영 적용 (Web)",
    admin_deploy_confirm_sha: "SHA 재입력 (이중 확인)",
    admin_deploy_reauth: "재인증: PROMOTE 입력",
    admin_deploy_apply_cta: "운영 적용",
    admin_deploy_rollback: "이전 버전 복구",
    admin_deploy_history: "최근 이력",
    admin_deploy_matrix: "기능 검증 매트릭스",
    admin_deploy_run_gates: "필수 게이트 실행",
    admin_deploy_matrix_note: "* 필수. PASS는 서버 실행 증거만 인정. 수동 PASS 불가.",
    admin_deploy_pipeline: "배포 진행 A/B/C/D",
    admin_deploy_mock_pipeline: "A/B/C/D 모의(TEST)",
    admin_deploy_execution: "운영 실행",
    admin_deploy_owner_only_hint: "지정 Owner만 검증·승인을 실행할 수 있습니다.",
    admin_deploy_owner_ids_missing:
      "DIBAY_DEPLOY_OWNER_IDS 미설정 — Owner 게이트 fail-closed",
    admin_deploy_promote_disabled_hint:
      "운영 적용·Rollback은 서버에서도 차단됩니다 (Area B BLOCKED).",
    admin_deploy_confirm_verify:
      "필수 게이트 PASS 증거를 확인했습니다. 검증 완료로 표시할까요?",
    admin_deploy_confirm_cancel: "검증 완료를 취소할까요?",
    admin_deploy_confirm_promote:
      "운영 main에 이 SHA를 적용할까요? (현재 BLOCKED면 실패합니다)",
    admin_deploy_confirm_rollback:
      "운영 Rollback을 요청할까요? (현재 BLOCKED면 실패합니다)",
    admin_deploy_dialog_cancel: "취소",
    admin_deploy_dialog_ok: "확인",
  },
  en: {
    admin_menu_system_deploy: "Deploy · Promote",
    admin_deploy_title: "Deploy · Promote to production",
    admin_deploy_subtitle: "Phase 1: Web SHA only. DB / Android / iOS need separate approval.",
    admin_deploy_runtime: "Current runtime",
    admin_deploy_status_label: "Verify status",
    admin_deploy_mark_verified: "Mark verified",
    admin_deploy_cancel_verified: "Cancel verified",
    admin_deploy_promote_web: "Promote Web to production",
    admin_deploy_confirm_sha: "Re-type SHA (double confirm)",
    admin_deploy_reauth: "Re-auth: type PROMOTE",
    admin_deploy_apply_cta: "Apply to production",
    admin_deploy_rollback: "Rollback previous",
    admin_deploy_history: "Recent history",
    admin_deploy_matrix: "Verification matrix",
    admin_deploy_run_gates: "Run required gates",
    admin_deploy_matrix_note: "* Required. PASS needs server evidence only. No manual PASS.",
    admin_deploy_pipeline: "Deploy pipeline A/B/C/D",
    admin_deploy_mock_pipeline: "Mock A/B/C/D (TEST)",
    admin_deploy_execution: "Prod execution",
    admin_deploy_owner_only_hint: "Only the designated Deploy Owner can verify/approve.",
    admin_deploy_owner_ids_missing:
      "DIBAY_DEPLOY_OWNER_IDS unset — Owner gate fail-closed",
    admin_deploy_promote_disabled_hint:
      "Promote/Rollback stay server-blocked (Area B BLOCKED).",
    admin_deploy_confirm_verify: "Required gates have PASS evidence. Mark verified?",
    admin_deploy_confirm_cancel: "Cancel verified status?",
    admin_deploy_confirm_promote:
      "Promote this SHA to production main? (fails if BLOCKED)",
    admin_deploy_confirm_rollback:
      "Request production rollback? (fails if BLOCKED)",
    admin_deploy_dialog_cancel: "Cancel",
    admin_deploy_dialog_ok: "Confirm",
  },
} as const;
