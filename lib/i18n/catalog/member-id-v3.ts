/**
 * 회원 아이디 v3 · 친구 찾기 (Owner 「2단계 시작」 2026-11-11) — 화면·CTA 문구.
 * 키 사용처는 `lib/auth/member-public-id-ui-contract.ts` 단일 계약을 따른다.
 */
export const memberIdV3Messages = {
  ko: {
    member_id_badge_can_change: "1회 변경 가능",
    member_id_hint_auto: "친구가 숫자 5자리({digits})를 입력하면 나를 찾을 수 있어요.",
    member_id_hint_legacy: "친구가 아이디 전체를 입력하면 나를 찾을 수 있어요.",
    member_id_hint_custom: "친구가 아이디를 4자 이상 입력하면 나를 찾을 수 있어요.",
    member_id_cta_change: "아이디 변경",
    member_id_change_confirm_note:
      "바꾸면 지금 아이디(@{current})로는 더 이상 찾을 수 없어요. 바꾼 아이디는 다시 바꿀 수 없어요. 친구 목록은 그대로예요.",
    member_id_err_reserved_pattern: "이 모양의 아이디는 쓸 수 없어요. 다른 아이디를 입력하세요.",
    member_id_err_reserved_prefix: "dibay 로 시작하는 아이디는 쓸 수 없어요.",
    cm_friend_find_by_id_rule_hint: "아이디 4자 이상 또는 숫자 5자리를 입력하세요",
    member_discovery_title: "친구 찾기",
    member_discovery_allow_id_search: "아이디로 나를 찾을 수 있게 하기",
    member_discovery_allow_id_search_desc: "끄면 아이디 검색에 내가 나오지 않아요. QR 친구 추가에는 영향이 없어요.",
    member_discovery_allow_qr_add: "QR로 친구 추가 허용",
    member_discovery_allow_qr_add_desc: "끄면 내 QR을 스캔해도 친구가 되지 않아요.",
    member_discovery_load_failed: "친구 찾기 설정을 불러오지 못했어요.",
  },
  en: {
    member_id_badge_can_change: "Can change once",
    member_id_hint_auto: "Friends can find you with the 5 digits ({digits}).",
    member_id_hint_legacy: "Friends can find you with your full ID.",
    member_id_hint_custom: "Friends can find you with 4 or more letters of your ID.",
    member_id_cta_change: "Change ID",
    member_id_change_confirm_note:
      "After the change, no one can find you with @{current}. You can't change it again. Your friends stay.",
    member_id_err_reserved_pattern: "This ID style is reserved. Try another ID.",
    member_id_err_reserved_prefix: "IDs can't start with dibay.",
    cm_friend_find_by_id_rule_hint: "Enter 4+ letters of an ID or 5 digits",
    member_discovery_title: "Finding friends",
    member_discovery_allow_id_search: "Let people find me by ID",
    member_discovery_allow_id_search_desc: "When off, you won't show up in ID search. QR adding still works.",
    member_discovery_allow_qr_add: "Allow adding by QR",
    member_discovery_allow_qr_add_desc: "When off, scanning your QR won't add you as a friend.",
    member_discovery_load_failed: "Couldn't load these settings.",
  },
} as const;
