/**
 * 연동 로그인 목록 — `GET /api/me/auth-providers` 단일 조회 (최종 설계 S03·S10·S53).
 * 계정 화면의 "n개 연결" 값과 기기 권한 화면의 연동 로그인 그룹이 **같은 응답**을 쓴다(별도 쿼리 금지).
 * 동시 호출은 `runSingleFlight("me:auth-providers")` 로 합친다. 실패는 실패로 돌려준다(빈 목록 금지).
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { LinkableAuthProvider } from "@/lib/auth/provider-identity/types";

export const ME_AUTH_PROVIDERS_FLIGHT_KEY = "me:auth-providers";

export type MeAuthProviderRow = {
  provider: LinkableAuthProvider;
  linked: boolean;
  linkedAt: string | null;
};

export type MeAuthProvidersResult =
  | { ok: true; providers: MeAuthProviderRow[] }
  | { ok: false; status: number };

export function fetchMeAuthProviders(): Promise<MeAuthProvidersResult> {
  return runSingleFlight(ME_AUTH_PROVIDERS_FLIGHT_KEY, async (): Promise<MeAuthProvidersResult> => {
    try {
      const res = await fetch("/api/me/auth-providers", { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; providers?: MeAuthProviderRow[] } | null;
      if (!res.ok || !json?.ok || !Array.isArray(json.providers)) {
        return { ok: false, status: res.status };
      }
      return { ok: true, providers: json.providers };
    } catch {
      return { ok: false, status: 0 };
    }
  });
}

export function countLinkedAuthProviders(rows: readonly MeAuthProviderRow[]): number {
  return rows.filter((r) => r.linked).length;
}

/** 해제 가능 — 연결됨 + 연결 2개 이상(서버 409 `last_provider_unlink_blocked` 와 같은 규칙을 화면에서 미리, S53) */
export function canUnlinkAuthProvider(row: Pick<MeAuthProviderRow, "linked">, linkedCount: number): boolean {
  return row.linked && linkedCount >= 2;
}

/** S03 → 기기 권한 화면 `#linked-login` 진입 시 연동 로그인 그룹으로 스크롤 (X14) */
export const LINKED_LOGIN_ANCHOR_ID = "linked-login";

export function shouldScrollToLinkedLogin(hash: string | null | undefined): boolean {
  return (hash ?? "").replace(/^#/, "") === LINKED_LOGIN_ANCHOR_ID;
}
