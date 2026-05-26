import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

/** 대표 → 생활 → 거래 → 배달 우선, 동점이면 최근 수정 — 어드민·신청 fallback 공통 */
export function pickMasterUserAddressRow(rows: UserAddressDTO[]): UserAddressDTO | null {
  if (rows.length === 0) return null;
  const score = (a: UserAddressDTO): number =>
    (a.isDefaultMaster ? 1000 : 0) +
    (a.isDefaultLife ? 100 : 0) +
    (a.isDefaultTrade ? 10 : 0) +
    (a.isDefaultDelivery ? 1 : 0);
  let best = rows[0];
  let bestScore = score(best);
  for (let i = 1; i < rows.length; i += 1) {
    const cur = rows[i];
    const s = score(cur);
    if (s > bestScore) {
      best = cur;
      bestScore = s;
      continue;
    }
    if (s === bestScore) {
      const tCur = new Date(cur.updatedAt).getTime();
      const tBest = new Date(best.updatedAt).getTime();
      if (Number.isFinite(tCur) && tCur > (Number.isFinite(tBest) ? tBest : 0)) {
        best = cur;
      }
    }
  }
  return best;
}
