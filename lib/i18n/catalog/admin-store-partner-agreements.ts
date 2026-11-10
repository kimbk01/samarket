/** 어드민 — 매장 입점 계약 목록·입점 심사 「입점 계약」 칸·법률 문서 화면 (2026-11-10) */
export const adminStorePartnerAgreementsMessages = {
  ko: {
    admin_menu_store_partner_agreements: "입점 계약",
    admin_app_store_partner_terms_publish_line: "매장 입점 신청서와 사장님 「입점 계약」 화면에 이 버전이 쓰입니다. 회원 재동의는 생기지 않으며, 이미 입점한 매장에는 새 버전 동의를 안내합니다.",
    admin_app_store_partner_terms_unpublish_current: "신청서·사장님 화면에 쓰이는 현재 입점 약관입니다. 다른 게시본이 없으면 새 신청은 서약 없이 접수되고 입점 승인 때 동의 검사도 건너뜁니다.",
    admin_app_store_partner_terms_hint: "매장 사장님이 입점 신청 때 동의하는 약관입니다 (회원 동의와 무관).",
    admin_app_store_partner_terms_version_hint: "새 버전을 게시하면 이미 입점한 매장에 새 버전 동의를 안내합니다(기능은 막지 않음). 게시한 뒤에는 문구를 바꿀 수 없습니다.",
  },
  en: {
    admin_menu_store_partner_agreements: "Partnership agreements",
    admin_app_store_partner_terms_publish_line: "This version is used on the store application form and the owner Partnership agreement screen. Members are not asked to agree again; stores already open are asked to agree to the new version.",
    admin_app_store_partner_terms_unpublish_current: "This is the current partnership terms used on the application form and owner screens. If no other version is published, new applications need no pledge and approval skips the agreement check.",
    admin_app_store_partner_terms_hint: "Terms store owners agree to when applying (not a member consent).",
    admin_app_store_partner_terms_version_hint: "Publishing a new version asks stores already open to agree to it (features stay available). Text cannot be changed after publishing.",
  },
} as const;
