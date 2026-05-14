/**
 * 주소 관리 목록 — 직전 성공 응답을 sessionStorage 에 두어 화면 첫 페인트에 바로 채움(이후 fetch 로 정합).
 */

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

const KEY = "samarket:me-addresses-list-cache:v1";
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
  } catch {
    /* quota */
  }
}

/** `fetchMeAddressesListSingleFlight` 결과가 실패일 때 사용자 표시용 메시지 — 화면 간 문구 일치 */
export function describeMeAddressesListFailure(result: MeAddressesListFetchResult, fallback: string): string {
  if (result.status === 401 || result.error === "login_required") {
    return "로그인이 필요합니다. 현재 접속한 주소(도메인)에서 다시 로그인해 주세요.";
  }
  if (result.error === "invalid_response") {
    return "주소 목록 응답 형식이 올바르지 않습니다.";
  }
  if (result.error === "user_addresses_table_missing") {
    return "user_addresses_table_missing";
  }
  if (result.error === "network_error") {
    return "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return (typeof result.error === "string" && result.error ? result.error : fallback);
}

/** 주소 목록 단일 비행 무효화 — 주소 저장·삭제 직후 강제 재조회용 */
export function invalidateMeAddressesListClientCache(): void {
  forgetSingleFlight(ADDRESSES_SINGLE_FLIGHT_KEY);
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
