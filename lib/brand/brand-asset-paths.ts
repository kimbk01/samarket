/** dibaY 브랜드 정적 에셋(public/) — 로고·파비콘 단일 경로. 교체 시 VERSION 만 올린다. */
export const DIBAY_BRAND_ASSET_VERSION = "20260612";

export const DIBAY_AUTH_LOGO_PATH = "/images/brand/dibay-auth-logo.png";
export const DIBAY_APP_ICON_512_PATH = "/images/brand/dibay-app-icon.png";
export const DIBAY_APP_ICON_180_PATH = "/images/brand/dibay-app-icon-180.png";
export const DIBAY_FAVICON_PATH = "/favicon.ico";

export function dibayBrandAssetUrl(path: string): string {
  return `${path}?v=${DIBAY_BRAND_ASSET_VERSION}`;
}
