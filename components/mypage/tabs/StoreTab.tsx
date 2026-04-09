import type { ReactNode } from "react";
import { AddressManagementClient } from "@/components/addresses/AddressManagementClient";
import { MyStoreOrdersView } from "@/components/mypage/MyStoreOrdersView";
import { MyPageQuickActions } from "@/components/mypage/MyPageQuickActions";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";
import type { MyPageConsoleProps } from "@/components/mypage/types";

type Props = Pick<MyPageConsoleProps, "hasOwnerStore" | "ownerHubStoreId" | "storeAttentionSummary">;

export function StoreTab({
  section,
  hasOwnerStore,
  ownerHubStoreId,
  storeAttentionSummary,
}: Props & { section: string }) {
  const businessHref = ownerHubStoreId?.trim()
    ? `/mypage/business?storeId=${encodeURIComponent(ownerHubStoreId.trim())}`
    : "/mypage/business";
  const businessOrdersHref = ownerHubStoreId?.trim()
    ? `/my/business/store-orders?storeId=${encodeURIComponent(ownerHubStoreId.trim())}`
    : "/my/business/store-orders";

  if (section === "orders") {
    return (
      <TabShell title="주문 내역" description="내 주문 상태와 주문 채팅, 리뷰 작성 흐름을 한곳에서 확인합니다.">
        <MyStoreOrdersView embedded />
      </TabShell>
    );
  }

  if (section === "order-chat") {
    return (
      <TabShell
        title="주문 채팅"
        description="주문 채팅은 주문 상세와 함께 관리됩니다. 현재 주문 목록에서 바로 주문 채팅으로 이어집니다."
      >
        <MyPageQuickActions
          items={[
            { label: "주문 내역 열기", href: "/mypage?tab=store&section=orders", caption: "주문 카드에서 채팅 바로 이동" },
            { label: "기존 주문 페이지", href: "/mypage/store-orders", caption: "하위 상세 경로 유지" },
          ]}
        />
      </TabShell>
    );
  }

  if (section === "payment") {
    return (
      <TabShell
        title="결제 정보"
        description="포인트, 결제된 주문 확인, 충전 신청 흐름을 이 영역에서 함께 관리합니다."
      >
        <MyPageQuickActions
          items={[
            { label: "포인트", href: "/mypage/points", caption: "보유 포인트와 변동 내역" },
            { label: "주문 내역", href: "/mypage?tab=store&section=orders", caption: "결제된 주문 확인" },
          ]}
        />
      </TabShell>
    );
  }

  if (section === "address") {
    return (
      <TabShell
        title="배송지 / 주소"
        description="거래, 생활, 배달 주소를 주소 관리 한 곳에서 통합 관리합니다."
      >
        <AddressManagementClient embedded />
      </TabShell>
    );
  }

  if (section === "member") {
    return (
      <TabShell
        title="매장회원 진입"
        description="일반 사용자 주문 관리와 사장님 운영 진입을 구분합니다."
      >
        <MyPageQuickActions
          items={[
            { label: "내 주문", href: "/mypage?tab=store&section=orders", caption: "구매자 기준 주문 관리" },
            {
              label: hasOwnerStore ? "사장님 주문 관리" : "매장 신청",
              href: hasOwnerStore ? businessOrdersHref : "/mypage/business/apply",
              caption: hasOwnerStore ? storeAttentionSummary ?? "매장 주문 처리" : "입점 신청으로 이동",
            },
          ]}
        />
      </TabShell>
    );
  }

  if (section === "manage") {
    return (
      <TabShell
        title="내 상점 등록 / 관리"
        description="매장 등록, 운영, 주문 처리, 상품과 문의 관리를 한 축으로 모읍니다."
      >
        <MyPageQuickActions
          items={[
            {
              label: hasOwnerStore ? "매장 운영" : "매장 신청",
              href: hasOwnerStore ? businessHref : "/mypage/business/apply",
              caption: hasOwnerStore ? "내 상점 운영 콘솔" : "입점 신청으로 이동",
            },
            {
              label: hasOwnerStore ? "사장님 주문 관리" : "사업자 안내",
              href: hasOwnerStore ? businessOrdersHref : "/mypage/business/apply",
              caption: hasOwnerStore ? "매장 주문 처리" : "사업자 진입 안내",
            },
          ]}
        />
      </TabShell>
    );
  }

  if (section === "rider") {
    return (
      <TabShell
        title="라이더 진입"
        description="라이더 전용 권한과 화면은 별도 운영 흐름이 필요해 현재는 기존 배송 / 주문 흐름을 유지합니다."
      >
        <MyPageQuickActions
          items={[{ label: "주문 내역", href: "/mypage?tab=store&section=orders", caption: "현재 배송 관련 주문 확인" }]}
        />
      </TabShell>
    );
  }

  return (
    <TabShell
      title="주문 내역"
      description="내 주문 상태와 주문 채팅, 리뷰 작성 흐름을 한곳에서 확인합니다."
    >
      <MyStoreOrdersView embedded />
    </TabShell>
  );
}

function TabShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <MyPageSectionHeader title={title} description={description} />
      <div className="rounded-[4px] border border-gray-200 bg-white p-3">{children}</div>
    </div>
  );
}
