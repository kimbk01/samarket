import type { MyBusinessNavContext } from "@/lib/business/my-business-nav";

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

/**
 * 매장 어드민 좌측 네비 — `buildMyBusinessNavGroups`와 동일한 노출 조건을 유지합니다.
 */
export function buildBusinessAdminSidebar(ctx: MyBusinessNavContext): BusinessAdminSidebarSection[] {
  const { storeId, slug, approvalStatus, isVisible, canSell, orderAlertsBadge } = ctx;
  const sid = encodeURIComponent(storeId);
  const q = `storeId=${sid}`;
  const approved = approvalStatus === "approved";
  const showOps = approved && isVisible;

  const sections: BusinessAdminSidebarSection[] = [];

  const opsItems: BusinessAdminSidebarItem[] = [{ label: "대시보드", href: "/my/business" }];
  if (showOps && canSell) {
    opsItems.push({
      label: "주문 관리",
      href: `/my/business/store-orders?${q}`,
      badge: orderAlertsBadge > 0 ? orderAlertsBadge : undefined,
      description: "신규·환불 요청·상태 변경",
    });
  }
  if (showOps) {
    opsItems.push({
      label: "채팅 · 문의",
      href: `/my/business/inquiries?${q}`,
      description: "매장 문의 답변",
    });
  }
  sections.push({ title: "운영", items: opsItems });

  if (approved) {
    sections.push({
      title: "상품",
      items: [
        {
          label: "상품 등록",
          href: `/my/business/products?${q}`,
          description: "목록·노출·신규 등록",
        },
        {
          label: "카테고리",
          href: `/my/business/menu-categories?${q}`,
        },
      ],
    });
  }

  const storeItems: BusinessAdminSidebarItem[] = [
    { label: "기본 정보", href: `/my/business/basic-info?${q}` },
    { label: "매장 프로필", href: `/my/business/profile?${q}` },
    { label: "운영 · 심사", href: `/my/business/ops-status?${q}` },
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
      items: [{ label: "정산 내역", href: "/my/business/settlements" }],
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
        href: `/my/business/settings?${q}`,
        description: "배달 알림음 안내(관리자 전역 설정)",
      },
    ],
  });

  return sections.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.disabled),
  }));
}
