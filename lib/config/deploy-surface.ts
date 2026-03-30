/**
 * 배포 구간(local / staging / production) — mock·테스트 계정·데모 노출 통제.
 *
 * 우선순위:
 * 1) `NEXT_PUBLIC_APP_DEPLOY_TIER` (명시 시 최우선)
 * 2) `NEXT_PUBLIC_VERCEL_ENV` — `next.config.js` 가 Vercel 의 `VERCEL_ENV` 를 빌드 시 주입
 *    - production → production / preview → staging / development → local
 * 3) `NODE_ENV !== "production"` → local, 그 외 production (자체 호스팅 안전 기본값)
 */
export type AppDeployTier = "local" | "staging" | "production";

export function getPublicDeployTier(): AppDeployTier {
  const t = (process.env.NEXT_PUBLIC_APP_DEPLOY_TIER ?? "").trim().toLowerCase();
  if (t === "local" || t === "staging" || t === "production") return t;

  const vercel = (process.env.NEXT_PUBLIC_VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercel === "production") return "production";
  if (vercel === "preview") return "staging";
  if (vercel === "development") return "local";

  if (process.env.NODE_ENV !== "production") return "local";
  return "production";
}

export function isProductionDeploy(): boolean {
  return getPublicDeployTier() === "production";
}

/** test_users·test-login·test-signup UI/API — production 에서는 항상 false */
export function allowTestUsersSurface(): boolean {
  if (isProductionDeploy()) return false;
  if (getPublicDeployTier() === "local") return true;
  const v = (process.env.NEXT_PUBLIC_ENABLE_TEST_USERS_UI ?? "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes";
}

const truthy = (raw: string | undefined) => {
  const v = (raw ?? "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes";
};

/**
 * `kasama_dev_uid` 등 테스트 로그인 쿠키를 실제 세션처럼 인정할지.
 * - 로컬(`local`)은 `allowTestUsersSurface()` 때문에 기본 true → 쿠키만 있으면 프록시가 /login 으로 안 보냄.
 * - Supabase 로그인만 검증하려면 `.env.local` 에
 *   `NEXT_PUBLIC_DISABLE_KASAMA_SESSION=1` (또는 `DISABLE_KASAMA_SESSION=1` — 서버·프록시 번들)
 */
export function allowKasamaDevSession(): boolean {
  if (truthy(process.env.NEXT_PUBLIC_DISABLE_KASAMA_SESSION)) return false;
  if (truthy(process.env.DISABLE_KASAMA_SESSION)) return false;
  return allowTestUsersSurface();
}

/** 채팅 메시지 mock 폴백 — production 금지 */
export function allowMockChatMessageFallback(): boolean {
  return !isProductionDeploy();
}

/** @deprecated 샘플 배달 플로 제거됨 — 항상 false */
export function allowSampleRestaurantDeliveryFlow(): boolean {
  return false;
}
