import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOwnerDrawerSectionsFromRegistry,
  buildOwnerManageHubSectionsFromRegistry,
  resolveOwnerNavTitleKey,
} from "@/lib/business/owner-nav-registry";

/**
 * 매장 사장님 재설계 (Owner 「권장안으로 진행」 2026-11-03)
 * `docs/audit/owner-store-full-redesign-2026-11-03.md` R1~R6 계약.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const APPROVED = {
  storeId: "s1",
  slug: "my-shop",
  approvalStatus: "approved",
  isVisible: true,
  canSell: true,
  orderAlertsBadge: 0,
};

describe("R2 메뉴 9그룹 — 드로어·PC 사이드바", () => {
  it("승인 매장 드로어 = 업무 순서 8그룹(지원 그룹은 메뉴 항목 없음) · 항목 1개짜리 그룹은 운영 홈만", () => {
    const sections = buildOwnerDrawerSectionsFromRegistry(APPROVED);
    expect(sections.map((s) => s.groupId)).toEqual([
      "home",
      "orders",
      "products",
      "store",
      "customers",
      "ads",
      "settlement",
      "notifications",
    ]);
    const singles = sections.filter((s) => s.items.length === 1).map((s) => s.groupId);
    expect(singles).toEqual(["home"]);
  });

  it("매장 관리(노출·영업) · 이벤트 프로모션이 드로어에 있음 · 미리보기는 메뉴·상품 그룹 끝", () => {
    const sections = buildOwnerDrawerSectionsFromRegistry(APPROVED);
    const ids = (g: string) => sections.find((s) => s.groupId === g)?.items.map((i) => i.id) ?? [];
    expect(ids("store")[0]).toBe("store_manage");
    expect(ids("ads")).toContain("ads_event");
    expect(ids("products").at(-1)).toBe("public_store");
    expect(ids("customers")).toEqual(["customer_care", "inquiries", "reviews", "customer_center"]);
    // 매출(일별·월별)이 정산 묶음 첫 줄 (Owner 2026-11-03 §6-3)
    // 입점 계약(2026-11-10)은 정산 묶음 끝
    expect(ids("settlement")).toEqual(["sales", "settlements", "finance", "partner_agreement"]);
  });

  it("관리 탭 메뉴(manage_hub)에도 이벤트 프로모션", () => {
    const ids = buildOwnerManageHubSectionsFromRegistry(APPROVED).flatMap((s) => s.items.map((i) => i.id));
    expect(ids).toContain("ads_event");
  });

  it("재무 화면 제목은 탭과 상관없이 Coin·캐시 하나 (D-6)", () => {
    for (const section of ["coin", "cash", "transactions", "outstanding"]) {
      expect(resolveOwnerNavTitleKey("/stores/owner/finance", `section=${section}`)).toBe("biz_nav_finance");
    }
  });

  it("메뉴 행 — 설명 줄·「상세」 글자 없음 · 눌림 표시 · 그룹 제목 uppercase 없음 · 내 정보 행 공통", () => {
    const src = read("components/business/admin/BusinessAdminSidebar.tsx");
    expect(src).not.toContain("item.description");
    expect(src).not.toContain('t("business_phase7_582")');
    expect(src).toContain("active:bg-[var(--biz-header-bg)]");
    expect(src).not.toMatch(/\buppercase\b/);
    expect(src).toContain("export function BusinessAdminSidebarMyLink");
    const shell = read("components/business/admin/BusinessAdminShell.tsx");
    expect(shell.match(/<BusinessAdminSidebarMyLink/g)?.length).toBe(2);
    // 메뉴 머리 「매장 운영 센터」 고정 문구 삭제 — 남은 1곳은 매장 없는 허브 헤더 부제(헤더 계약)
    expect(shell.match(/t\("business_phase7_079"\)/g)?.length).toBe(1);
    expect(shell).toContain('hubSubtitle={t("business_phase7_079")}');
  });
});

describe("R1 승인 매장 — 신청·심사 잔재", () => {
  it("신청 화면은 매장이 있으면(상태 무관) 운영 홈으로 보냄 — 보완 제출 모드만 예외 (매장 신청 v2)", () => {
    const src = read("app/(main)/stores/owner/apply/page.tsx");
    expect(src).toContain("router.replace(OwnerRoutes.hub((mine ?? stores[0])!.id))");
    expect(src).toContain('String(mine.approval_status) === "revision_requested"');
  });

  it("내정보 매장 관리 주소는 운영 홈으로 (운영 홈이 매장 없음·심사 중·승인을 나눔)", () => {
    const src = read("app/(main)/mypage/section/[section]/[item]/page.tsx");
    expect(src).toContain('redirect("/stores/owner")');
    expect(src).not.toContain('redirect("/stores/owner/apply")');
  });

  it("운영 상태 — 심사 줄은 승인 전에만 · 개발자 문구·겹치는 바로가기 없음", () => {
    const strip = read("components/business/BusinessOwnerOpsStrip.tsx");
    expect(strip).toContain('approval !== "approved"');
    const ops = read("components/business/owner/OwnerStoreOpsStatusBody.tsx");
    expect(ops).not.toContain("가짜 승인 요청");
    expect(ops).not.toContain("data-owner-ops-cta");
  });
});

describe("R3 운영 홈", () => {
  it("바로가기 카드 없음 · 긴급 주문 「미확인」 칸 없음(신규 칸에 합침)", () => {
    const dash = read("components/stores/owner/dashboard/OwnerOperationsDashboard.tsx");
    expect(dash).not.toContain("OwnerHomeQuickActionsCard");
    const urgent = read("components/stores/owner/dashboard/OwnerUrgentOrdersCard.tsx");
    expect(urgent).not.toContain('id: "unconfirmed"');
  });
});

describe("R4 불필요 설명·개발자 문구", () => {
  const banned: [string, string][] = [
    ["components/business/owner/OwnerStoreFinanceView.tsx", "Admin과 같은 재무 데이터"],
    ["components/business/owner/OwnerCustomerCareHubView.tsx", "없는 숫자는 만들지 않습니다"],
    ["components/business/owner/OwnerCustomerCareHubView.tsx", "실제 데이터로 표시합니다"],
    ["components/business/owner/OwnerStoreOrdersMobileBody.tsx", "시스템 TTL"],
    ["components/business/owner/OwnerStoreSettingsContent.tsx", "매장 정보 편집 위치"],
    ["components/business/owner/ads/OwnerBannerCreateView.tsx", "Admin Studio"],
    ["components/business/owner/ads/OwnerEventPromotionDetailClient.tsx", "최종 배포·푸시 발송은 관리자 권한"],
    ["components/business/owner/OwnerGiftMoneyOpsPanel.tsx", "단일 기준입니다"],
    ["components/business/owner/OwnerCoinWithdrawalPanel.tsx", "내부 Coin→Cash 전환과 다릅니다"],
  ];
  for (const [file, text] of banned) {
    it(`${file.split("/").pop()} — 「${text}」 없음`, () => {
      expect(read(file)).not.toContain(text);
    });
  }

  it("섹션 카드에 설명 슬롯(subtitle) 없음 (셸 규칙 §2)", () => {
    expect(read("components/business/owner/OwnerStoreAdminDashSection.tsx")).not.toContain("subtitle");
  });
});
