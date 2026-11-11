import { DIBAY_PRODUCTION_SITE_ORIGIN } from "@/lib/platform/capacitor-server-url";

/**
 * 스테이징(회원 미공개) 화면 판정 — Owner 2026-11-10 「개발 서버 · 운영 서버 구분」.
 *
 * main 반영 = Vercel 「대기(Staged)」 배포 → 배포 고유 주소(`*.vercel.app`, Vercel 로그인 필요)에서만 열림.
 * Promote 하면 같은 빌드가 운영 주소(samarket.vercel.app)에 붙으므로, 빌드 값이 아니라
 * **지금 열린 주소(host)** 로만 판정한다. 운영 주소·로컬·그 밖의 주소는 표시하지 않는다.
 */
const PRODUCTION_HOST = new URL(DIBAY_PRODUCTION_SITE_ORIGIN).hostname.toLowerCase();

export function isStagingDeployHost(hostname: string | null | undefined): boolean {
  const host = (hostname ?? "").trim().toLowerCase();
  if (!host || host === PRODUCTION_HOST) return false;
  return host.endsWith(".vercel.app");
}
