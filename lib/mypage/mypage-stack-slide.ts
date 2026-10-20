/**
 * 내정보(`/mypage/**` · `/my/**`) 하위 화면 push/back 스택 깊이 SSOT.
 * 형태는 `lib/trade/marketplace/marketplace-seller-hub-slide.ts` 와 같다.
 *
 * 설계: `docs/mypage-v2/dibay-mypage-v3-final-integrated-spec.md` Part A §1.3 (X2).
 * - 홈 `/mypage`·`/my` = 0
 * - 나머지 = 접두 제거 후 세그먼트 수. 단 `section/<group>/<item>` 은 1단계로 센다.
 *   예) `/mypage/section/settings/notifications` = 1, `/mypage/store-orders/abc` = 2,
 *       `/mypage/store-orders/abc/review` = 3, `/mypage/points/charge` = 2
 */

function normalize(path: string | null | undefined): string {
  const p = String(path ?? "").split("?")[0]?.trim() ?? "";
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

export function isMypageStackPath(path: string | null | undefined): boolean {
  const p = normalize(path);
  return p === "/mypage" || p.startsWith("/mypage/") || p === "/my" || p.startsWith("/my/");
}

/** -1 = 내정보 스택 밖 */
export function mypageStackDepth(path: string | null | undefined): number {
  const p = normalize(path);
  if (!isMypageStackPath(p)) return -1;
  const rest = p.startsWith("/mypage") ? p.slice("/mypage".length) : p.slice("/my".length);
  const segs = rest.split("/").filter(Boolean);
  if (segs.length === 0) return 0;
  if (segs[0] === "section") {
    /** `section` · `section/<group>` · `section/<group>/<item>` = 1, 그 아래는 1단계씩 */
    return 1 + Math.max(0, segs.length - 3);
  }
  return segs.length;
}
