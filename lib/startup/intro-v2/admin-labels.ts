/**
 * Intro V2 Admin display labels — Phase 1 enums stay the contract.
 * Operators never need DB enum names.
 */

import type {
  IntroAdvanceMode,
  IntroAudience,
  IntroCampaignStatus,
  IntroCtaDestinationType,
  IntroDeepLinkPolicy,
  IntroDeviceFamily,
  IntroFrequencyMode,
  IntroInteractionMode,
  IntroAspectPolicy,
  IntroDecorationKind,
  IntroLayerAnchor,
  IntroLayerType,
  IntroPlatform,
  IntroTransition,
} from "@/lib/startup/intro-v2/types";

export type IntroLang = "ko" | "en";

export const INTRO_ADMIN_DEFAULT_TIMEZONE = "Asia/Manila" as const;
export const INTRO_ADMIN_DEFAULT_MAX_HOLD_MS = 8000 as const;

export const INTRO_TEXT_STYLE_TOKENS = ["title", "body", "caption"] as const;
export type IntroTextStyleToken = (typeof INTRO_TEXT_STYLE_TOKENS)[number];

export const INTRO_TEXT_ALIGNMENTS = ["left", "center", "right"] as const;
export type IntroTextAlignment = (typeof INTRO_TEXT_ALIGNMENTS)[number];

/** Phase 2 UI interaction names mapped onto Phase 1 interaction_mode. */
export const INTRO_ADMIN_INTERACTION_UI = ["NONE", "BUTTON", "FULL_SCENE", "LAYER"] as const;
export type IntroAdminInteractionUi = (typeof INTRO_ADMIN_INTERACTION_UI)[number];

export const INTRO_INTERACTION_UI_TO_MODE: Record<IntroAdminInteractionUi, IntroInteractionMode> = {
  NONE: "none",
  FULL_SCENE: "tap_advance",
  BUTTON: "tap_cta",
  LAYER: "tap_layer",
};

export const INTRO_INTERACTION_MODE_TO_UI: Record<IntroInteractionMode, IntroAdminInteractionUi> = {
  none: "NONE",
  tap_advance: "FULL_SCENE",
  tap_cta: "BUTTON",
  tap_layer: "LAYER",
};

const STATUS: Record<IntroCampaignStatus, { ko: string; en: string }> = {
  draft: { ko: "초안", en: "Draft" },
  scheduled: { ko: "예약됨", en: "Scheduled" },
  active: { ko: "활성", en: "Active" },
  paused: { ko: "일시중지", en: "Paused" },
  expired: { ko: "만료", en: "Expired" },
  archived: { ko: "보관", en: "Archived" },
};

const FREQUENCY: Record<IntroFrequencyMode, { ko: string; en: string }> = {
  every_launch: { ko: "앱을 새로 실행할 때마다", en: "Every new app launch" },
  once_ever: { ko: "캠페인당 한 번", en: "Once per campaign" },
  once_per_day: { ko: "하루 한 번", en: "Once per day" },
  once_per_session: { ko: "세션당 한 번", en: "Once per session" },
};

const ADVANCE: Record<IntroAdvanceMode, { ko: string; en: string }> = {
  timer: { ko: "지정 시간 후 다음 화면", en: "Advance after a set time" },
  media_end: { ko: "미디어 재생 후 다음 화면", en: "Advance after media ends" },
  cta_only: { ko: "사용자가 선택할 때까지", en: "Wait until the user chooses" },
  manual: { ko: "직접 넘길 때까지", en: "Wait until the user advances" },
};

const INTERACTION: Record<IntroAdminInteractionUi, { ko: string; en: string }> = {
  NONE: { ko: "사용 안 함", en: "None" },
  BUTTON: { ko: "버튼 누르기", en: "Tap button" },
  FULL_SCENE: { ko: "화면 전체 누르기", en: "Tap full screen" },
  LAYER: { ko: "특정 요소 누르기", en: "Tap an element" },
};

const AUDIENCE: Record<IntroAudience, { ko: string; en: string }> = {
  guest: { ko: "게스트", en: "Guest" },
  authenticated: { ko: "로그인", en: "Authenticated" },
  new: { ko: "신규 사용자", en: "New user" },
  returning: { ko: "재방문 사용자", en: "Returning user" },
};

const PLATFORM: Record<IntroPlatform, { ko: string; en: string }> = {
  android: { ko: "Android", en: "Android" },
  ios: { ko: "iOS", en: "iOS" },
  web: { ko: "Web", en: "Web" },
};

const DEVICE_FAMILY: Record<IntroDeviceFamily, { ko: string; en: string }> = {
  PHONE: { ko: "휴대폰", en: "Phone" },
  TABLET: { ko: "태블릿", en: "Tablet" },
  DESKTOP: { ko: "데스크톱", en: "Desktop" },
};

const DEEP_LINK: Record<IntroDeepLinkPolicy, { ko: string; en: string }> = {
  honor: { ko: "딥링크 존중", en: "Honor deep link" },
  ignore: { ko: "딥링크 무시", en: "Ignore deep link" },
  defer: { ko: "딥링크 나중 처리", en: "Defer deep link" },
};

const LAYER: Record<IntroLayerType, { ko: string; en: string }> = {
  BACKGROUND: { ko: "배경", en: "Background" },
  IMAGE: { ko: "이미지", en: "Image" },
  LOGO: { ko: "로고", en: "Logo" },
  TEXT: { ko: "텍스트", en: "Text" },
  CTA: { ko: "버튼", en: "CTA" },
  DECORATION: { ko: "장식", en: "Decoration" },
};

const CTA: Record<IntroCtaDestinationType, { ko: string; en: string }> = {
  COMMUNITY: { ko: "커뮤니티", en: "Community" },
  TRADE: { ko: "거래", en: "Trade" },
  DELIVERY: { ko: "배달", en: "Delivery" },
  MESSENGER: { ko: "메신저", en: "Messenger" },
  MY_PAGE: { ko: "마이페이지", en: "My page" },
  STORE: { ko: "매장", en: "Store" },
  PRODUCT: { ko: "상품", en: "Product" },
  LISTING: { ko: "거래 글", en: "Listing" },
  POST: { ko: "게시글", en: "Post" },
  CHAT_ROOM: { ko: "채팅방", en: "Chat room" },
  EVENT: { ko: "이벤트", en: "Event" },
  INTERNAL_PATH: { ko: "앱 내부 경로", en: "Internal path" },
  EXTERNAL_URL: { ko: "외부 링크", en: "External URL" },
};

function pick(map: { ko: string; en: string }, lang: IntroLang): string {
  return lang === "en" ? map.en : map.ko;
}

export function introStatusLabel(status: IntroCampaignStatus, lang: IntroLang): string {
  return pick(STATUS[status], lang);
}

export function introFrequencyLabel(mode: IntroFrequencyMode, lang: IntroLang): string {
  return pick(FREQUENCY[mode], lang);
}

export function introAdvanceLabel(mode: IntroAdvanceMode, lang: IntroLang): string {
  return pick(ADVANCE[mode], lang);
}

export function introInteractionLabel(ui: IntroAdminInteractionUi, lang: IntroLang): string {
  return pick(INTERACTION[ui], lang);
}

export function introAudienceLabel(audience: IntroAudience, lang: IntroLang): string {
  return pick(AUDIENCE[audience], lang);
}

export function introPlatformLabel(platform: IntroPlatform, lang: IntroLang): string {
  return pick(PLATFORM[platform], lang);
}

export function introDeviceFamilyLabel(family: IntroDeviceFamily, lang: IntroLang): string {
  return pick(DEVICE_FAMILY[family], lang);
}

export function introDeepLinkLabel(policy: IntroDeepLinkPolicy, lang: IntroLang): string {
  return pick(DEEP_LINK[policy], lang);
}

export function introLayerTypeLabel(type: IntroLayerType, lang: IntroLang): string {
  return pick(LAYER[type], lang);
}

export function introCtaTypeLabel(type: IntroCtaDestinationType, lang: IntroLang): string {
  return pick(CTA[type], lang);
}

const TRANSITION: Record<IntroTransition, { ko: string; en: string }> = {
  none: { ko: "없음", en: "None" },
  fade: { ko: "페이드", en: "Fade" },
  fade_in_expand: { ko: "페이드 후 확대", en: "Fade then expand" },
  expand_fade_out: { ko: "확대 후 페이드", en: "Expand then fade" },
};

const ANCHOR: Record<IntroLayerAnchor, { ko: string; en: string }> = {
  top_left: { ko: "왼쪽 위", en: "Top left" },
  top_center: { ko: "위 가운데", en: "Top center" },
  top_right: { ko: "오른쪽 위", en: "Top right" },
  center_left: { ko: "왼쪽 가운데", en: "Center left" },
  center: { ko: "가운데", en: "Center" },
  center_right: { ko: "오른쪽 가운데", en: "Center right" },
  bottom_left: { ko: "왼쪽 아래", en: "Bottom left" },
  bottom_center: { ko: "아래 가운데", en: "Bottom center" },
  bottom_right: { ko: "오른쪽 아래", en: "Bottom right" },
};

const ASPECT: Record<IntroAspectPolicy, { ko: string; en: string }> = {
  contain: { ko: "비율 유지 (넣기)", en: "Contain" },
  cover: { ko: "화면 채우기", en: "Cover" },
  fill: { ko: "늘리기", en: "Stretch" },
  none: { ko: "원본 크기", en: "Original" },
};

const DECORATION: Record<IntroDecorationKind, { ko: string; en: string }> = {
  shape: { ko: "도형", en: "Shape" },
  sticker: { ko: "스티커/이미지", en: "Sticker" },
  divider: { ko: "구분선", en: "Divider" },
};

export function introTransitionLabel(value: string, lang: IntroLang): string {
  const known = TRANSITION[value as IntroTransition];
  if (known) return pick(known, lang);
  return value;
}

export function introAnchorLabel(anchor: IntroLayerAnchor, lang: IntroLang): string {
  return pick(ANCHOR[anchor], lang);
}

export function introAspectPolicyLabel(policy: IntroAspectPolicy, lang: IntroLang): string {
  return pick(ASPECT[policy], lang);
}

export function introDecorationKindLabel(kind: IntroDecorationKind, lang: IntroLang): string {
  return pick(DECORATION[kind], lang);
}

export function parseIntroTextStyleToken(animation: string | undefined): IntroTextStyleToken {
  const raw = String(animation ?? "");
  if (raw.includes("text:caption")) return "caption";
  if (raw.includes("text:title")) return "title";
  return "body";
}

export function parseIntroTextAlignment(animation: string | undefined): IntroTextAlignment {
  const raw = String(animation ?? "");
  if (raw.includes("align:right")) return "right";
  if (raw.includes("align:left")) return "left";
  return "center";
}

export function composeIntroTextAnimation(
  style: IntroTextStyleToken,
  align: IntroTextAlignment,
  motion: string | null
): string {
  const parts = [`text:${style}`, `align:${align}`];
  if (motion && motion !== "none") parts.push(motion);
  return parts.join("|");
}

export function introTextStyleLabel(token: IntroTextStyleToken, lang: IntroLang): string {
  if (token === "title") return lang === "en" ? "Title" : "제목";
  if (token === "caption") return lang === "en" ? "Caption" : "캡션";
  return lang === "en" ? "Body" : "본문";
}
