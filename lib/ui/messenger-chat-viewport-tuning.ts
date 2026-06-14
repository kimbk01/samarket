/**
 * 커뮤니티 메신저 방 모바일 뷰포트·입력·키보드 크롬 보정 상수 (단일 소스).
 *
 * 목표는 카카오/텔레그램과의 픽셀 동일이 아니라 **체감 안정성**이다.
 * 기기·브라우저 차이는 여기 숫자만 조정해 맞춘다 — 산재한 매직 넘버 금지.
 *
 * @see docs/community-messenger-mobile-room-viewport.md — 제품 수용 기준·플랫폼 테스트
 */

/** 셸 `layoutVisible` 하한(px). 너무 낮으면 flex 타임라인 붕괴 방지 */
export const MESSENGER_CHAT_SHELL_MIN_HEIGHT_PX = 120;

/**
 * 하단 근접 = stick-to-bottom 판정(px).
 * `useMessengerRoomReaderScrollBottom` 의 스크롤 보존 로직과 반드시 같은 값을 쓴다.
 */
export const MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX = 100;

/** Composer footer: 키보드 overlap 추정이 없을 때 기본 하단 패딩(px) — 홈 인디케이터 등 */
export const MESSENGER_COMPOSER_FOOTER_PADDING_DEFAULT_PX = 10;

/** 배달·주문 채팅 composer — 카톡/텔레그램급 홈 인디케이터 여유(잘림 방지) */
export const MESSENGER_DELIVERY_COMPOSER_FOOTER_EXTRA_PX = 14;

/** 배달·주문 채팅 입력 한 줄(+ / pill / 전송) 섹터 높이(px) — safe-area 제외 */
export const MESSENGER_DELIVERY_COMPOSER_SECTOR_HEIGHT_PX = 60;

export const MESSENGER_DELIVERY_COMPOSER_SECTOR_HEIGHT_CLASS =
  "box-border h-[60px] min-h-[60px] max-h-[60px]";

/** 60px 섹터 안 — + / pill / 전송 세로 중앙(`items-center`) */
export const MESSENGER_DELIVERY_COMPOSER_ROW_CLASS =
  "flex h-full w-full min-h-0 items-center gap-1.5";

/** 배달 composer 좌·우 고정 슬롯(+ / 전송) — 녹음 중에도 폭·위치 유지 */
export const MESSENGER_DELIVERY_COMPOSER_SIDE_SLOT_CLASS = "h-9 w-9 shrink-0 self-center";

/** 배달 composer pill 우측 마이크 슬롯 — off/on 동일 좌표 */
export const MESSENGER_DELIVERY_COMPOSER_MIC_SLOT_CLASS =
  "relative h-8 w-8 shrink-0 self-center overflow-hidden";

/**
 * iOS + vv 셸로 overlap 추정을 끈 상태에서, 키보드 크롬 UI가 켜졌을 때 추가 패딩(px).
 * vv·innerHeight 미세 어긋남 보정.
 */
export const MESSENGER_COMPOSER_FOOTER_PADDING_IOS_SLACK_PX = 14;

/** 키보드 inset(px)을 footer 에 더할 때 iOS 한정 추가 여유(px) */
export const MESSENGER_COMPOSER_KEYBOARD_INSET_IOS_EXTRA_PX = 2;

/* ----- useMessengerTradeKeyboardChrome: 키보드 “크롬” 열림 추정 히스테리시스 ----- */

export const MESSENGER_KEYBOARD_OVERLAP_OPEN_PX = 64;
export const MESSENGER_KEYBOARD_OVERLAP_CLOSE_PX = 36;

/** iOS Safari: vv 동기화 지연·값 편차 대비 낮은 임계 */
export const MESSENGER_KEYBOARD_OVERLAP_IOS_OPEN_PX = 36;
export const MESSENGER_KEYBOARD_OVERLAP_IOS_CLOSE_PX = 22;

/** iOS blur 직후 overlap 재측정 지연(ms) */
export const MESSENGER_KEYBOARD_IOS_BLUR_REMEASURE_MS = 280;

/** iOS 포커스 직후 추가 재측정(ms) */
export const MESSENGER_KEYBOARD_IOS_FOCUS_REMEASURE_EXTRA_MS = [100, 260] as const;

/**
 * 셸 keyboard overlay fallback — adjustResize·resizes-content 미동작 WebView.
 * composer 가 아닌 [data-cm-room].chat-viewport-shell padding-bottom 에만 적용.
 */
export const CHAT_SHELL_KEYBOARD_OVERLAY_MIN_PX = 24;
