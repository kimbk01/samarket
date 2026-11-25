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
    admin_users_phone_ops_off_blocks_registration:
      "끄면 전화 인증을 마치지 않은 회원은 가입을 마칠 수 없어 앱을 쓸 수 없어요.",
    admin_users_alert_reg_terms: "가입 단계: 약관 동의 전 (본인이 로그인 때 동의)",
    admin_users_alert_reg_phone: "가입 단계: 전화 인증 필요",
    admin_users_alert_reg_address: "가입 단계: 대표 주소 필요",
    admin_users_err_phone_taken: "다른 회원이 쓰는 전화번호예요. 다른 번호를 입력하세요.",
    admin_users_err_username_taken: "이미 쓰는 로그인 아이디예요. 다른 아이디를 입력하세요.",
    admin_users_err_address_seed_failed: "대표 주소를 저장하지 못해 회원을 만들지 않았어요. 다시 시도해 주세요.",
    admin_users_err_password_too_long: "비밀번호는 128자 이하로 입력하세요.",
    admin_users_err_password_staff_rule: "관리자 비밀번호는 8자 이상이며 영문과 숫자를 모두 넣어야 해요.",
    admin_users_password_hint_staff: "8자 이상 · 영문과 숫자 포함",
    admin_users_password_hint_member: "6자 이상 · 숫자만으로도 가능",
    admin_users_err_password_weak_pwned: "유출된 비밀번호 목록에 있어 쓸 수 없어요. 다른 비밀번호를 입력하세요.",
    admin_users_err_password_weak_length: "보안 설정의 최소 길이보다 짧아요. 더 길게 입력하세요.",
    admin_users_err_password_weak_characters: "보안 설정의 필수 문자(영문 대·소문자·숫자·기호)가 빠졌어요.",
    admin_users_err_password_weak_generic: "보안 설정이 이 비밀번호를 거절했어요. 다른 비밀번호를 입력하세요.",
    admin_users_err_duplicate_value: "다른 회원이 이미 쓰는 값이 있어 저장하지 못했어요. 입력값을 확인하세요.",
    admin_users_member_verify_status_pending: "인증 대기",
    admin_users_member_verify_status_rejected: "인증 반려",
    admin_users_member_verify_current_selection: "현재 선택: {status}",
    admin_auth_phone_settings_unavailable:
      "전화 인증 설정을 불러오지 못했어요. 기본값으로 저장되지 않도록 입력을 막았어요. 다시 불러오세요.",
  },
  en: {
    admin_users_address_seed_warning:
      "The member was created, but the primary address could not be saved. Add the address again from the member detail.",
    admin_users_go_to_member_detail: "Go to member detail",
    admin_users_err_phone_required: "Enter a phone number. Sign-up needs one.",
    admin_users_phone_ops_off_blocks_registration:
      "If off, members without a verified phone can't finish sign-up or use the app.",
    admin_users_alert_reg_terms: "Sign-up: terms not agreed (member agrees at login)",
    admin_users_alert_reg_phone: "Sign-up: phone verification needed",
    admin_users_alert_reg_address: "Sign-up: main address needed",
    admin_users_err_phone_taken: "Another member uses this phone number. Enter a different one.",
    admin_users_err_username_taken: "This login ID is taken. Enter a different one.",
    admin_users_err_address_seed_failed: "The main address could not be saved, so no member was created. Try again.",
    admin_users_err_password_too_long: "Password must be 128 characters or fewer.",
    admin_users_err_password_staff_rule: "Admin passwords need 8+ characters with letters and numbers.",
    admin_users_password_hint_staff: "8+ characters with letters and numbers",
    admin_users_password_hint_member: "6+ characters · numbers only is fine",
    admin_users_err_password_weak_pwned: "This password is on a leaked-password list. Enter a different one.",
    admin_users_err_password_weak_length: "Too short for the security settings. Enter a longer password.",
    admin_users_err_password_weak_characters: "Missing required characters (upper/lowercase letters, numbers, symbols).",
    admin_users_err_password_weak_generic: "The security settings rejected this password. Enter a different one.",
    admin_users_err_duplicate_value: "Another member already uses one of these values. Check your input.",
    admin_users_member_verify_status_pending: "Verification pending",
    admin_users_member_verify_status_rejected: "Verification rejected",
    admin_users_member_verify_current_selection: "Current choice: {status}",
    admin_auth_phone_settings_unavailable:
      "Couldn't load phone verification settings. Editing is off so defaults aren't saved. Try again.",
  },
} as const;
