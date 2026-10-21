/**
 * Admin member creation — primary address seed result (ADDR bundle) i18n.
 * Separate top-level catalog: `adminMessages` is at the TS type-serialization limit (TS7056).
 */

export const adminUsersAddressMessages = {
  ko: {
    admin_users_address_seed_warning:
      "회원은 생성됐지만 대표 주소를 저장하지 못했습니다. 회원 상세에서 주소를 다시 등록해 주세요.",
    admin_users_go_to_member_detail: "회원 상세로 이동",
  },
  en: {
    admin_users_address_seed_warning:
      "The member was created, but the primary address could not be saved. Add the address again from the member detail.",
    admin_users_go_to_member_detail: "Go to member detail",
  },
} as const;
