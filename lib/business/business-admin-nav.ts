import type { MyBusinessNavContext } from "@/lib/business/my-business-nav";
import { OwnerRoutes } from "@/lib/business/owner-routes";

export type BusinessAdminSidebarItem = {
  label: string;
  href: string;
  badge?: number;
  disabled?: boolean;
  hint?: string;
  /** 모바일·접근성용 짧은 설명 */
  description?: string;
};

export type BusinessAdminSidebarSection = {
  title: string;
  items: BusinessAdminSidebarItem[];
};

/** 허브 메뉴·사이드바 공통 — 활성 행 판별 */
export function isBusinessAdminNavHrefActive(
  href: string,
  pathname: string,
  searchParams: URLSearchParams,
): boolean {
  const [path, rawQ = ""] = href.split("?");
  const norm = (v: string) => v.replace(/\/+$/, "") || "/";
  const targetPath = norm(path);
  const currentPath = norm(pathname);

  const isHubPath = (p: string) =>
    p === "/stores/owner" || p === "/my/business" || p === "/mypage/business";
  const pathsMatch =
    targetPath === currentPath || (isHubPath(targetPath) && isHubPath(currentPath));

  if (!pathsMatch) return false;

  const tq = new URLSearchParams(rawQ);
  const tSid = tq.get("storeId");
  if (tSid) {
    return searchParams.get("storeId") === tSid;
  }
  return true;
}

/**
 * 매장 어드민 좌측 네비 — `buildMyBusinessNavGroups`와 동일한 노출 조건을 유지합니다.
 */
export function buildBusinessAdminSidebar(ctx: MyBusinessNavContext): BusinessAdminSidebarSection[] {
  const { storeId, slug, approvalStatus, isVisible, canSell, orderAlertsBadge } = ctx;
  const approved = approvalStatus === "approved";
  const showOps = approved && isVisible;

  const sections: BusinessAdminSidebarSection[] = [];

  const opsItems: BusinessAdminSidebarItem[] = [
    { label: "대시보드", href: OwnerRoutes.hub(storeId), description: "지표·주문·문의 요약" },
    {
      label: "매장 설정",
      href: OwnerRoutes.profile(storeId),
      description: "영업시간·배달·갤러리·서비스 형태",
    },
  ];
  if (showOps) {
    opsItems.push({
      label: "채팅 · 문의",
      href: OwnerRoutes.inquiries(storeId),
      description: "매장 문의 답변",
    });
  }
  sections.push({ title: "운영", items: opsItems });

  // 배달 운영(주문 중심) 섹션
  if (approved) {
    const deliveryItems: BusinessAdminSidebarItem[] = [];
    if (showOps && canSell) {
      deliveryItems.push({
        label: "배달 주문",
        href: OwnerRoutes.orders(storeId),
        badge: orderAlertsBadge > 0 ? orderAlertsBadge : undefined,
        description: "신규·환불 요청·상태 변경",
      });
    }
    deliveryItems.push({
      label: "배달 운영 설정",
      href: OwnerRoutes.opsStatus(storeId),
      description: "영업·배달·노출",
    });
    sections.push({ title: "배달", items: deliveryItems });
  }

  if (approved) {
    sections.push({
      title: "상품",
      items: [
        {
          label: "상품 등록",
          href: OwnerRoutes.products(storeId),
          description: "목록·노출·신규 등록",
        },
        {
          label: "카테고리",
          href: OwnerRoutes.menuCategories(storeId),
        },
        {
          label: "배너 관리",
          href: OwnerRoutes.banners(storeId),
          description: "매장 상단 배너",
        },
        {
          label: "공지 관리",
          href: OwnerRoutes.notices(storeId),
          description: "위치별 공지",
        },
      ],
    });
  }

  const storeItems: BusinessAdminSidebarItem[] = [
    { label: "기본 정보", href: OwnerRoutes.basicInfo(storeId) },
    { label: "매장 프로필", href: OwnerRoutes.profile(storeId) },
    { label: "운영 · 심사", href: OwnerRoutes.opsStatus(storeId) },
  ];
  if (approved && isVisible && slug) {
    storeItems.push({
      label: "공개 매장 페이지",
      href: `/stores/${encodeURIComponent(slug)}`,
      description: "고객 화면 미리보기",
    });
  }
  sections.push({ title: "매장", items: storeItems });

  if (showOps) {
    sections.push({
      title: "정산",
      items: [{ label: "정산 내역", href: OwnerRoutes.settlements(storeId) }],
    });
  }

  sections.push({
    title: "성장",
    items: [
      {
        label: "광고 · 프로모션",
        href: "/my/ads",
        description: "노출·광고 신청",
      },
    ],
  });

  sections.push({
    title: "설정",
    items: [
      {
        label: "알림 · 운영",
        href: OwnerRoutes.settings(storeId),
        description: "배달 알림음 안내(관리자 전역 설정)",
      },
    ],
  });

  return sections.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.disabled),
  }));
}
