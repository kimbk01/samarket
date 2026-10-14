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
    admin_deploy_mark_verified: "검증 완료 표시",
    admin_deploy_promote_web: "운영 적용 (Web)",
    admin_deploy_confirm_sha: "SHA 재입력 (이중 확인)",
    admin_deploy_reauth: "재인증: PROMOTE 입력",
    admin_deploy_apply_cta: "운영 적용",
    admin_deploy_history: "최근 이력",
  },
  en: {
    admin_menu_system_deploy: "Deploy · Promote",
    admin_deploy_title: "Deploy · Promote to production",
    admin_deploy_subtitle: "Phase 1: Web SHA only. DB / Android / iOS need separate approval.",
    admin_deploy_runtime: "Current runtime",
    admin_deploy_status_label: "Verify status",
    admin_deploy_mark_verified: "Mark verified",
    admin_deploy_promote_web: "Promote Web to production",
    admin_deploy_confirm_sha: "Re-type SHA (double confirm)",
    admin_deploy_reauth: "Re-auth: type PROMOTE",
    admin_deploy_apply_cta: "Apply to production",
    admin_deploy_history: "Recent history",
  },
} as const;
