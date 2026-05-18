/**
 * Phase 3 — components/my e2e·검증 단일 계약.
 * Playwright·verify 스크립트는 이 파일의 경로·키·기대 문구만 참조한다.
 */
import { MESSAGES, type MessageKey } from "@/lib/i18n/messages";

export const PHASE3_MY_PROFILE_EDIT_PATH = "/mypage/section/account/profile/edit" as const;
export const PHASE3_MY_ACCOUNT_PATH = "/my/account" as const;
export const PHASE3_MY_HUB_PATH = "/my" as const;

/** en UI 스모크에서 반드시 보여야 하는 카탈로그 키 */
export const PHASE3_MY_E2E_ASSERT_KEYS = {
  profileEditTitle: "profile_edit_title",
  profileEditSectionBasic: "profile_edit_section_basic",
  profileEditNicknameLabel: "profile_edit_nickname_label",
  accountInfoTitle: "account_info_title",
  myQuickFavorites: "my_quick_favorites",
  myOrdersSectionTitle: "my_orders_section_title",
} as const satisfies Record<string, MessageKey>;

export type Phase3MyE2eAssertKey = (typeof PHASE3_MY_E2E_ASSERT_KEYS)[keyof typeof PHASE3_MY_E2E_ASSERT_KEYS];

export function phase3MyExpectedText(lang: "ko" | "en", key: MessageKey): string {
  const row = MESSAGES[lang] as Record<string, string>;
  const text = row[key];
  if (typeof text !== "string" || !text.trim()) {
    throw new Error(`[phase3-my-e2e] missing ${lang} text for key: ${key}`);
  }
  return text;
}

/** English UI 본문에 한글이 남지 않았는지 (동적 닉네임·숫자 제외용 보조) */
export const PHASE3_MY_HANGUL_UI = /[\u3131-\u318E\uAC00-\uD7A3]/;
