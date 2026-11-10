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

