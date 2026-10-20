/**
 * 내정보 라우트 대체 화면 계약 (설계서 §4 ③④⑤).
 * - 피드 스켈레톤(`MainFeedRouteLoading`·`CommunityFeedSkeleton`)·임의 `pt-16` 여백 금지
 *   → `MyRouteSkeleton`(본문 열과 같은 자리) 또는 화면 전용 구조 스켈레톤.
 * - 알림 화면: 읽음·삭제 실패는 토스트, 로드 오류는 목록과 동시 표시 금지.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function listTsx(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTsx(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("mypage route skeleton fallbacks", () => {
  it("no feed skeleton / pt-16 fallback under app/(main)/mypage or the CS bridge", () => {
    const files = [
      ...listTsx(join(ROOT, "app", "(main)", "mypage")),
      join(ROOT, "components/mypage/cs/MypageCsOwnerCareBridge.tsx"),
    ];
    const offenders = files
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        return /\b(MainFeedRouteLoading|CommunityFeedSkeleton)\b/.test(src) || /\bpt-16\b/.test(src);
      })
      .map((f) => relative(ROOT, f).split(sep).join("/"));
    expect(offenders).toEqual([]);
  });

  it("section menu / compose / support-history / CS bridge use MyRouteSkeleton", () => {
    expect(read("app/(main)/mypage/section/[section]/page.tsx")).toContain("<MyRouteSkeleton");
    expect(read("app/(main)/mypage/trade/chat/compose/page.tsx")).toContain("<MyRouteSkeleton");
    expect(read("app/(main)/mypage/support-history/page.tsx")).toContain("<MyRouteSkeleton");
    expect(read("components/mypage/cs/MypageCsOwnerCareBridge.tsx")).toContain("<MyRouteSkeleton");
  });

  it("redirect-only legacy pages redirect outside Suspense (no fallback flash)", () => {
    for (const rel of [
      "app/(main)/mypage/settings/[section]/page.tsx",
      "app/(main)/mypage/trade/chat/[roomId]/page.tsx",
    ]) {
      const src = read(rel);
      expect(src).not.toContain("<Suspense");
      expect(src).toMatch(/export default async function/);
    }
  });

  it("store-orders page fallback = the same order-card skeleton as the list body", () => {
    const page = read("app/(main)/mypage/store-orders/page.tsx");
    expect(page).toContain("<StoreOrdersListSkeleton showTabs />");
    expect(read("components/mypage/MyStoreOrdersView.tsx")).toContain("export function StoreOrdersListSkeleton");
  });

  it("points charge fallback renders inside the same shell as the body skeleton", () => {
    const src = read("app/(main)/mypage/points/charge/page.tsx");
    expect(src).toContain("<Suspense fallback={<PointChargeRouteFallback />}>");
    expect(src).not.toMatch(/point-charge-skeleton" className="[^"]*px-4/);
  });

  it("notifications: action failures → toast, load error exclusive with list", () => {
    const src = read("components/my/MyNotificationsView.tsx");
    /** 행동(읽음·삭제·제안) 핸들러는 로드 오류 자리(setError)를 쓰지 않는다 */
    const actionBodies = [
      /const markAllRead = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[/,
      /const runDeleteGroup = useCallback\([\s\S]*?\n  \);/,
      /const deleteSelected = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[/,
      /const actOnTradeOffer = useCallback\([\s\S]*?\n  \);/,
    ].map((re) => re.exec(src)?.[0] ?? "");
    for (const body of actionBodies) {
      expect(body.length).toBeGreaterThan(0);
      expect(body).not.toContain("setError(");
      expect(body).toContain("setActionErrorToast(");
    }
    expect(src).toContain('data-testid="notif-action-error-toast"');
    /** 로드 오류면 목록 대신 오류 본문 하나 */
    expect(src).toMatch(/\{error \? \([\s\S]*?\) : grouped\.length === 0 \? \(/);
  });
});
