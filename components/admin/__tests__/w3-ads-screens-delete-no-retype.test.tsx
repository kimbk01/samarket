/**
 * 어드민 SSOT §3-1 · §3-2 (Owner 2026-11-07) — W3 화면: 대상 재입력(retype) 없음 · 공용 삭제(`AdminAdDeleteAction`) 배치 ·
 * D-03 배달 상세에 「강제 종료」 없음 · D-10 정지·재개·종료 공개 사유/내부 메모 두 칸.
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 쓰는 코드를 실행한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ language: "ko", t: (k: string) => k, safeT: (k: string) => k, tt: (x: string) => x }),
}));
vi.mock("@/components/admin/ads/AdminAdDeleteAction", () => ({
  AdminAdDeleteAction: (p: { kind: string; id: string }) => <span data-test-ad-delete-action={p.kind} data-id={p.id} />,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { AdminMyBannersView } from "@/components/admin/my/AdminMyBannersPage";
import type { AdminBanner } from "@/lib/types/admin-banner";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

const SCREENS: Array<[string, string[]]> = [
  ["components/admin/trade/promotions/TradePromotionsPage.tsx", ['kind="trade_promotion"']],
  ["components/admin/community/promotions/AdminCommunityPromotionsPage.tsx", ['kind="community_promotion"']],
  ["components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx", ['"delivery_banner"', '"delivery_sponsored"']],
  ["components/admin/my/AdminMyBannersPage.tsx", ['kind="my_banner"']],
  ["components/admin/launch-intro/LaunchIntroAdminPage.tsx", ['kind="intro"']],
];

describe("W3 화면 — 재입력 없음 · 공용 삭제", () => {
  it.each(SCREENS)("%s: retypeValue 0 · AdminAdDeleteAction 배치", (file, kinds) => {
    const src = read(file);
    expect(src).not.toMatch(/retypeValue\s*[:=]/);
    expect(src).toContain('from "@/components/admin/ads/AdminAdDeleteAction"');
    for (const k of kinds) expect(src).toContain(k);
  });

  it("D-03 배달 상세 조치 목록에 terminate 없음 · D-10 정지·재개·종료 splitReason", () => {
    const src = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
    const actions = src.slice(src.indexOf("const ACTIONS: AdminDeliveryAdAction[] = ["), src.indexOf("];", src.indexOf("const ACTIONS")));
    expect(actions).not.toContain('"terminate"');
    expect(src).toContain("splitReason: deliveryOpsSplitsReason(action)");
    expect(src).toContain('splitReason: deliveryOpsSplitsReason("end")');
    expect(src).toContain("internalReason:");
  });

  it("마이 배너 표: 쓰기 가능하면 행마다 공용 삭제(my_banner) · 권한 없으면 꺼진 버튼", () => {
    const banner = {
      id: "b1",
      title: "배너 1",
      priority: 1,
      isActive: true,
      startAt: null,
      endAt: null,
    } as unknown as AdminBanner;
    const html = renderToStaticMarkup(
      <AdminMyBannersView title="배너" loadingLabel="로딩" loading={false} error={null} items={[banner]} onRemove={() => {}} />
    );
    expect(html).toContain('data-test-ad-delete-action="my_banner"');
    expect(html).toContain('data-id="b1"');
    const denied = renderToStaticMarkup(
      <AdminMyBannersView
        title="배너"
        loadingLabel="로딩"
        loading={false}
        error={null}
        items={[banner]}
        onRemove={() => {}}
        writeDeniedReason="권한 없음"
      />
    );
    expect(denied).not.toContain("data-test-ad-delete-action");
    expect(denied).toContain("disabled");
  });
});
