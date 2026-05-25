/**
 * DIBAY i18n E2E — 경로·프로브·카탈로그 키 단일 계약.
 * Playwright는 이 파일과 `phase3-my-e2e-contract` 만 참조한다.
 */
import { MESSAGES, type MessageKey } from "@/lib/i18n/messages";

export const I18N_E2E_LANGUAGE_SETTINGS_PATH = "/mypage?tab=settings&section=region-language" as const;
export const I18N_E2E_LOGOUT_PATH = "/mypage/logout" as const;

export const I18N_E2E_NAV_KEYS = [
  "nav.trade",
  "nav.community",
  "nav.delivery",
  "nav.chat",
  "nav.my",
] as const satisfies readonly MessageKey[];

export type I18nE2eNavKey = (typeof I18N_E2E_NAV_KEYS)[number];

export type I18nE2eDomainProbe =
  | {
      id: string;
      path: string;
      kind: "bottomNav";
    }
  | {
      id: string;
      path: string;
      kind: "aria";
      labelKey: MessageKey;
    }
  | {
      id: string;
      path: string;
      kind: "heading";
      labelKey: MessageKey;
    }
  | {
      id: string;
      path: string;
      kind: "adminSurface";
      quicklinksKey: MessageKey;
      deniedKey: MessageKey;
    };

/** community = /philife ( /community 는 redirect ) */
export const I18N_E2E_DOMAIN_PROBES: readonly I18nE2eDomainProbe[] = [
  { id: "trade", path: "/market", kind: "bottomNav" },
  { id: "community", path: "/philife", kind: "bottomNav" },
  { id: "delivery", path: "/stores", kind: "bottomNav" },
  {
    id: "messenger",
    path: "/community-messenger",
    kind: "aria",
    labelKey: "cm_ui_messenger_search",
  },
  { id: "myinfo", path: "/mypage", kind: "bottomNav" },
  {
    id: "admin",
    path: "/admin",
    kind: "adminSurface",
    quicklinksKey: "admin_quicklinks_title",
    deniedKey: "admin_access_denied_title",
  },
] as const;

export const I18N_E2E_LOGIN_PROBE_KEY = "auth_login_identifier" as const satisfies MessageKey;

export function i18nE2eExpectedText(lang: "ko" | "en", key: MessageKey): string {
  const row = MESSAGES[lang] as Record<string, string>;
  const text = row[key];
  if (typeof text !== "string" || !text.trim()) {
    throw new Error(`[i18n-e2e] missing ${lang} text for key: ${key}`);
  }
  return text;
}

export const I18N_E2E_HANGUL_UI = /[\u3131-\u318E\uAC00-\uD7A3]/;
