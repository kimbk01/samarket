/**
 * 주소 관리 목록 — 직전 성공 응답을 sessionStorage 에 두어 화면 첫 페인트에 바로 채움(이후 fetch 로 정합).
 *
 * CONTRACT — 저장/삭제 후에는 `commitUserAddressListAfterMutation()` (`user-addresses-sync.ts`) 만 사용.
 * DO NOT: invalidate + fetch + write + event 를 화면마다 따로 조합하지 말 것.
 */

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

const KEY = "samarket:me-addresses-list-cache:v1";
const META_KEY = "samarket:me-addresses-list-cache:updated-at:v1";
const ADDRESSES_SINGLE_FLIGHT_KEY = "me:addresses:list";

export type MeAddressesListFetchResult = {
  ok: boolean;
  status: number;
  rows: UserAddressDTO[];
  error: string | null;
};

function isRow(x: unknown): x is UserAddressDTO {
  return typeof x === "object" && x != null && typeof (x as UserAddressDTO).id === "string";
}

export function readCachedMeAddressList(): UserAddressDTO[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!isRow(parsed[0])) return null;
    return parsed as UserAddressDTO[];
  } catch {
    return null;
  }
}

export function writeCachedMeAddressList(rows: UserAddressDTO[]): void {
  if (typeof window === "undefined" || !Array.isArray(rows) || rows.length === 0) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(rows));
    sessionStorage.setItem(META_KEY, String(Date.now()));
  } catch {
    /* quota */
  }
}

/** `commitUserAddressListAfterMutation` 직후 등 — 같은 탭 이벤트 중복 fetch skip 판정 */
export function isMeAddressListCacheFresh(maxAgeMs = 8000): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(META_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts <= maxAgeMs;
  } catch {
    return false;
  }
}

export {
  describeMeAddressesListFailure,
  shouldShowMeAddressesListMigrationHint,
} from "@/lib/addresses/user-address-api-error-i18n";

/** 주소 목록 단일 비행 무효화 — 주소 저장·삭제 직후 강제 재조회용 */
export function invalidateMeAddressesListClientCache(): void {
  forgetSingleFlight(ADDRESSES_SINGLE_FLIGHT_KEY);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(META_KEY);
  } catch {
    /* quota */
  }
}

/** 저장·삭제 직후 — 단일 비행·sessionStorage 무효화 후 최신 목록 반환·캐시 갱신 */
export async function refreshMeAddressesListAfterMutation(): Promise<UserAddressDTO[]> {
  invalidateMeAddressesListClientCache();
  const result = await fetchMeAddressesListSingleFlight();
  if (result.ok) {
    if (result.rows.length > 0) writeCachedMeAddressList(result.rows);
    return result.rows;
  }
  return [];
}

export function fetchMeAddressesListSingleFlight(): Promise<MeAddressesListFetchResult> {
  return runSingleFlight(ADDRESSES_SINGLE_FLIGHT_KEY, async () => {
    try {
      const res = await fetch("/api/me/addresses", { credentials: "include", cache: "no-store" });
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        return {
          ok: false,
          status: res.status || 0,
          rows: [],
          error: res.redirected || res.url.includes("/login") ? "login_required" : "invalid_response",
        } satisfies MeAddressesListFetchResult;
      }
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        addresses?: UserAddressDTO[];
        error?: string;
      };
      if (res.ok && j.ok && Array.isArray(j.addresses)) {
        return {
          ok: true,
          status: res.status,
          rows: j.addresses,
          error: null,
        } satisfies MeAddressesListFetchResult;
      }
      return {
        ok: false,
        status: res.status,
        rows: [],
        error: typeof j.error === "string" && j.error ? j.error : "load_failed",
      } satisfies MeAddressesListFetchResult;
    } catch {
      return {
        ok: false,
        status: 0,
        rows: [],
        error: "network_error",
      } satisfies MeAddressesListFetchResult;
    }
  });
}

/** 글쓰기 등에서 주소 화면으로 가기 전에 목록 API만 미리 호출 */
export function prefetchMeAddressListIntoCache(): void {
  if (typeof window === "undefined") return;
  void fetchMeAddressesListSingleFlight()
    .then((result) => {
      if (result.ok && result.rows.length > 0) {
        writeCachedMeAddressList(result.rows);
      }
    })
    .catch(() => {});
}
