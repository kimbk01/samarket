/**
 * 주소 관리 목록 — 직전 성공 응답을 sessionStorage 에 두어 화면 첫 페인트에 바로 채움(이후 fetch 로 정합).
 */

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

const KEY = "samarket:me-addresses-list-cache:v1";

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

/** 글쓰기 등에서 주소 화면으로 가기 전에 목록 API만 미리 호출 */
export function prefetchMeAddressListIntoCache(): void {
  if (typeof window === "undefined") return;
  void fetch("/api/me/addresses", { credentials: "include" })
    .then((r) => r.json() as Promise<{ ok?: boolean; addresses?: UserAddressDTO[] }>)
    .then((j) => {
      if (j?.ok === true && Array.isArray(j.addresses) && j.addresses.length > 0) {
        writeCachedMeAddressList(j.addresses);
      }
    })
    .catch(() => {});
}
