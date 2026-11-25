/**
 * Admin member creation — primary address seed result (ADDR bundle) i18n.
 * Separate top-level catalog: `adminMessages` is at the TS type-serialization limit (TS7056).
 */

export const adminUsersAddressMessages = {
  ko: {
    admin_users_address_seed_warning:
      "회원은 생성됐지만 대표 주소를 저장하지 못했습니다. 회원 상세에서 주소를 다시 등록해 주세요.",
    admin_users_go_to_member_detail: "회원 상세로 이동",
    admin_users_err_phone_required: "전화번호를 입력하세요. 가입에는 전화번호가 필요해요.",
    admin_users_err_phone_taken: "다른 회원이 쓰는 전화번호예요. 다른 번호를 입력하세요.",
    admin_users_err_username_taken: "이미 쓰는 로그인 아이디예요. 다른 아이디를 입력하세요.",
    admin_users_alert_reg_terms: "가입 단계: 약관 동의 전 (본인이 로그인 때 동의)",
    admin_users_alert_reg_phone: "가입 단계: 전화 인증 필요",
    admin_users_alert_reg_address: "가입 단계: 대표 주소 필요",
    admin_users_err_address_seed_failed: "대표 주소를 저장하지 못해 회원을 만들지 않았어요. 다시 시도해 주세요.",
  },
  en: {
    admin_users_address_seed_warning:
      "The member was created, but the primary address could not be saved. Add the address again from the member detail.",
    admin_users_go_to_member_detail: "Go to member detail",
    admin_users_err_phone_required: "Enter a phone number. Sign-up needs one.",
    admin_users_err_phone_taken: "Another member uses this phone number. Enter a different one.",
    admin_users_err_username_taken: "This login ID is taken. Enter a different one.",
    admin_users_alert_reg_terms: "Sign-up: terms not agreed (member agrees at login)",
    admin_users_alert_reg_phone: "Sign-up: phone verification needed",
    admin_users_alert_reg_address: "Sign-up: main address needed",
    admin_users_err_address_seed_failed: "The main address could not be saved, so no member was created. Try again.",
  },
} as const;
