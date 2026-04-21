"use client";

import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type HubCard = {
  href: string;
  title: string;
  description: string;
  note?: string;
};

const SECTIONS: { title: string; items: HubCard[] }[] = [
  {
    title: "메뉴 · 홈 칩",
    items: [
      {
        href: "/admin/trade/settings",
        title: "거래 설정",
        description: "상세 하단 추천 규칙·지역 fallback·광고/유사상품 개수",
      },
      {
        href: "/admin/menus/trade",
        title: "메뉴 (거래)",
        description: "홈 상단 칩·거래 종류(일반·중고차 등)·글쓰기 런처 노출",
      },
    ],
  },
  {
    title: "피드 · 주제",
    items: [
      {
        href: "/admin/trade/feed-topics",
        title: "거래 피드 주제",
        description: "마켓 2행 주제·세부 칩(현대·기아 등)",
      },
    ],
  },
  {
    title: "게시 · 상품",
    items: [
      {
        href: "/admin/products",
        title: "상품관리",
        description: "등록된 거래 상품(게시) 목록",
      },
      {
        href: "/admin/posts-management",
        title: "게시물 관리",
        description: "전체 게시물(거래·기타 탭 포함)",
      },
    ],
  },
  {
    title: "찜 · 제안 · 상태",
    items: [
      {
        href: "/admin/favorites",
        title: "찜/관심관리",
        description: "사용자 찜 목록",
      },
      {
        href: "/admin/price-offers",
        title: "가격제안관리",
        description: "가격 제안 흐름(페이지 연결 시)",
        note: "라우트 미연결 시 404일 수 있음",
      },
      {
        href: "/admin/trade-status",
        title: "거래상태관리",
        description: "거래 단계·상태 운영",
        note: "페이지 준비 중일 수 있음",
      },
    ],
  },
  {
    title: "채팅 · 거래 흐름",
    items: [
      {
        href: "/admin/chats/trade",
        title: "거래채팅",
        description: "중고 거래 관련 채팅방",
      },
      {
        href: "/admin/trade-flow",
        title: "거래흐름·온도",
        description: "거래 단계·온도/알림 운영",
      },
    ],
  },
  {
    title: "후기 · 광고(연동)",
    items: [
      {
        href: "/admin/reviews",
        title: "거래후기",
        description: "거래 완료 후 리뷰",
      },
      {
        href: "/admin/post-ads",
        title: "게시글광고",
        description: "거래 게시 노출·광고",
      },
      {
        href: "/admin/trade-post-ads",
        title: "거래 광고 신청",
        description: "거래 상세/목록 광고 신청 심사·활성 운영",
      },
      {
        href: "/admin/trade-ad-policies",
        title: "거래 광고 정책",
        description: "광고 상품(기간·포인트·슬롯) 정책 운영",
      },
      {
        href: "/admin/home-feed",
        title: "홈피드",
        description: "홈 노출·피드 운영",
      },
    ],
  },
];

export function AdminTradeHub() {
  return (
    <div className="space-y-6" data-admin>
      <AdminPageHeader
        title="거래 통합"
        description="홈 거래·마켓과 연결된 관리 화면을 한곳에서 이동합니다. (채팅·리뷰 등은 기존 메뉴 그룹에도 그대로 있습니다.)"
      />
      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-2 sam-text-body-secondary font-semibold uppercase tracking-wide text-sam-muted">{section.title}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {section.items.map((card) => (
                <li key={card.href}>
                  <Link
                    href={card.href}
                    className="block h-full rounded-ui-rect border border-sam-border bg-sam-surface p-4 sam-text-body shadow-sm transition hover:border-signature/40 hover:bg-sam-app/80"
                  >
                    <span className="font-medium text-sam-fg">{card.title}</span>
                    <p className="mt-1 sam-text-body-secondary text-sam-muted">{card.description}</p>
                    {card.note ? <p className="mt-1 sam-text-xxs text-amber-800/90">{card.note}</p> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
