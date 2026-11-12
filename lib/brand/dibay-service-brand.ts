/**
 * DIBAY 서비스 브랜드 SSOT — 공식 명칭 · 대표 아이콘 · 서비스 계층 (Owner 최종 승인 2026-11-13).
 * 설계: `docs/design/service-brand-icon-state-ssot-design-2026-11-13.md` · 시안: `docs/design/service-brand-icon-state-mockup-2026-11-13.html`.
 *
 * - 브랜드 표기는 ko·en 모두 영문 대문자(번역하지 않음). 카탈로그 값은 이 상수를 참조한다 — 화면에 직접 쓰지 않는다.
 * - 기능명(거래 신고·모임 가입·주문 취소 등)은 브랜드가 아니다 → 카탈로그 한국어 문구 그대로.
 * - API·DB·라우트·이벤트 키는 이 이름과 무관하다(`trade`·`community`·`stores`·`chat` 식별자 불변).
 * - 아이콘 = Phosphor Fill(MIT, react-icons 5.6.0 `pi` 와 같은 경로 데이터) 채움 단색 · viewBox 0 0 256 256.
 *   텔레그램형: 크기·모양은 선택과 무관, 색만 바뀐다(`app/app-bottom-nav.css`). 런타임에 react-icons 를 불러오지 않는다.
 */

export const DIBAY_SERVICE_BRAND_IDS = ["HOME", "LOUNGE", "FEED", "MARKET", "CREW", "DIPICK", "LETARING", "MY"] as const;
export type DibayServiceBrandId = (typeof DIBAY_SERVICE_BRAND_IDS)[number];

/** 공식 표시명 — 변경 불가 (Owner 2026-11-13) */
export const DIBAY_SERVICE_BRAND = {
  HOME: "HOME",
  LOUNGE: "LOUNGE",
  FEED: "FEED",
  MARKET: "MARKET",
  CREW: "CREW",
  DIPICK: "DIPICK",
  LETARING: "LETARING",
  MY: "MY",
} as const satisfies Record<DibayServiceBrandId, string>;

/** 서비스 계층 — 메인 메뉴 = HOME·LOUNGE·DIPICK·LETARING·MY, LOUNGE 안 = FEED·MARKET·CREW */
export const DIBAY_SERVICE_BRAND_PARENT: Record<DibayServiceBrandId, DibayServiceBrandId | null> = {
  HOME: null,
  LOUNGE: null,
  FEED: "LOUNGE",
  MARKET: "LOUNGE",
  CREW: "LOUNGE",
  DIPICK: null,
  LETARING: null,
  MY: null,
};

export const DIBAY_SERVICE_BRAND_ICON_VIEWBOX = "0 0 256 256" as const;

/** 대표 아이콘 이름(Phosphor) — 문서·Admin 표시용 */
export const DIBAY_SERVICE_BRAND_ICON_NAME: Record<DibayServiceBrandId, string> = {
  HOME: "PiHouseFill",
  LOUNGE: "PiUsersThreeFill",
  FEED: "PiNewspaperFill",
  MARKET: "PiShoppingBagFill",
  CREW: "PiFlagFill",
  DIPICK: "PiMopedFill",
  LETARING: "PiChatsCircleFill",
  MY: "PiUserCircleFill"
};

/** 대표 아이콘 경로 데이터 (fill="currentColor") — 같은 브랜드는 앱·Admin 어디서나 이 그림 하나 */
export const DIBAY_SERVICE_BRAND_ICON_PATH: Record<DibayServiceBrandId, string> = {
  HOME:
    "M224,120v96a8,8,0,0,1-8,8H160a8,8,0,0,1-8-8V164a4,4,0,0,0-4-4H108a4,4,0,0,0-4,4v52a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V120a16,16,0,0,1,4.69-11.31l80-80a16,16,0,0,1,22.62,0l80,80A16,16,0,0,1,224,120Z",
  LOUNGE:
    "M64.12,147.8a4,4,0,0,1-4,4.2H16a8,8,0,0,1-7.8-6.17,8.35,8.35,0,0,1,1.62-6.93A67.79,67.79,0,0,1,37,117.51a40,40,0,1,1,66.46-35.8,3.94,3.94,0,0,1-2.27,4.18A64.08,64.08,0,0,0,64,144C64,145.28,64,146.54,64.12,147.8Zm182-8.91A67.76,67.76,0,0,0,219,117.51a40,40,0,1,0-66.46-35.8,3.94,3.94,0,0,0,2.27,4.18A64.08,64.08,0,0,1,192,144c0,1.28,0,2.54-.12,3.8a4,4,0,0,0,4,4.2H240a8,8,0,0,0,7.8-6.17A8.33,8.33,0,0,0,246.17,138.89Zm-89,43.18a48,48,0,1,0-58.37,0A72.13,72.13,0,0,0,65.07,212,8,8,0,0,0,72,224H184a8,8,0,0,0,6.93-12A72.15,72.15,0,0,0,157.19,182.07Z",
  FEED:
    "M216,48H56A16,16,0,0,0,40,64V184a8,8,0,0,1-16,0V88A8,8,0,0,0,8,88v96.11A24,24,0,0,0,32,208H208a24,24,0,0,0,24-24V64A16,16,0,0,0,216,48ZM176,152H96a8,8,0,0,1,0-16h80a8,8,0,0,1,0,16Zm0-32H96a8,8,0,0,1,0-16h80a8,8,0,0,1,0,16Z",
  MARKET:
    "M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm-88,96A48.05,48.05,0,0,1,80,88a8,8,0,0,1,16,0,32,32,0,0,0,64,0,8,8,0,0,1,16,0A48.05,48.05,0,0,1,128,136Z",
  CREW:
    "M232,56V176a8,8,0,0,1-2.76,6c-15.28,13.23-29.89,18-43.82,18-18.91,0-36.57-8.74-53-16.85C105.87,170,82.79,158.61,56,179.77V224a8,8,0,0,1-16,0V56a8,8,0,0,1,2.77-6h0c36-31.18,68.31-15.21,96.79-1.12C167,62.46,190.79,74.2,218.76,50A8,8,0,0,1,232,56Z",
  DIPICK:
    "M216,128a39.3,39.3,0,0,0-6.27.5L175.49,37.19A8,8,0,0,0,168,32H136a8,8,0,0,0,0,16h26.46l32.3,86.13a40.13,40.13,0,0,0-18,25.87H136.54l-25-66.81A8,8,0,0,0,104,88H24a8,8,0,0,0,0,16h8v13.39A56.12,56.12,0,0,0,0,168a8,8,0,0,0,8,8h8.8a40,40,0,0,0,78.4,0h81.6A40,40,0,1,0,216,128ZM56,192a24,24,0,0,1-22.62-16H78.62A24,24,0,0,1,56,192Zm160,0a24,24,0,0,1-15.43-42.36l7.94,21.17a8,8,0,0,0,15-5.62L215.55,144H216a24,24,0,0,1,0,48Z",
  LETARING:
    "M232.07,186.76a80,80,0,0,0-62.5-114.17A80,80,0,1,0,23.93,138.76l-7.27,24.71a16,16,0,0,0,19.87,19.87l24.71-7.27a80.39,80.39,0,0,0,25.18,7.35,80,80,0,0,0,108.34,40.65l24.71,7.27a16,16,0,0,0,19.87-19.86Zm-16.25,1.47L224,216l-27.76-8.17a8,8,0,0,0-6,.63,64.05,64.05,0,0,1-85.87-24.88A79.93,79.93,0,0,0,174.7,89.71a64,64,0,0,1,41.75,92.48A8,8,0,0,0,215.82,188.23Z",
  MY:
    "M172,120a44,44,0,1,1-44-44A44.05,44.05,0,0,1,172,120Zm60,8A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88.09,88.09,0,0,0-91.47-87.93C77.43,41.89,39.87,81.12,40,128.25a87.65,87.65,0,0,0,22.24,58.16A79.71,79.71,0,0,1,84,165.1a4,4,0,0,1,4.83.32,59.83,59.83,0,0,0,78.28,0,4,4,0,0,1,4.83-.32,79.71,79.71,0,0,1,21.79,21.31A87.62,87.62,0,0,0,216,128Z",
};

/** 매장 사장님 하단 탭(운영) — 브랜드가 아닌 기능 아이콘이지만 같은 채움 계열로 맞춘다 (PiStorefrontFill) */
export const DIBAY_STOREFRONT_ICON_PATH =
  "M231.69,93.81,217.35,43.6A16.07,16.07,0,0,0,202,32H54A16.07,16.07,0,0,0,38.65,43.6L24.31,93.81A7.94,7.94,0,0,0,24,96v16a40,40,0,0,0,16,32v72a8,8,0,0,0,8,8H208a8,8,0,0,0,8-8V144a40,40,0,0,0,16-32V96A7.94,7.94,0,0,0,231.69,93.81ZM88,112a24,24,0,0,1-35.12,21.26,7.88,7.88,0,0,0-1.82-1.06A24,24,0,0,1,40,112v-8H88Zm64,0a24,24,0,0,1-48,0v-8h48Zm64,0a24,24,0,0,1-11.07,20.2,8.08,8.08,0,0,0-1.8,1.05A24,24,0,0,1,168,112v-8h48Z";

export function dibayServiceBrandIconSvgMarkup(
  id: DibayServiceBrandId,
  attrs: { className?: string; size?: number } = {}
): string {
  const cls = attrs.className ? ` class="${attrs.className}"` : "";
  const size = attrs.size ? ` width="${attrs.size}" height="${attrs.size}"` : "";
  return `<svg${cls}${size} viewBox="${DIBAY_SERVICE_BRAND_ICON_VIEWBOX}" fill="currentColor" aria-hidden="true"><path d="${DIBAY_SERVICE_BRAND_ICON_PATH[id]}"/></svg>`;
}
