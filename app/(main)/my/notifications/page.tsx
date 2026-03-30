import { MyNotificationsView } from "@/components/my/MyNotificationsView";
import { MemberNotificationList } from "@/components/member-orders/MemberNotificationList";
import { MemberNotificationBell } from "@/components/member-orders/MemberNotificationBell";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MyNotificationsPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="알림"
        subtitle="거래·주문·서비스"
        backHref="/mypage"
        section="account"
        rightSlot={<MemberNotificationBell />}
      />
      <div className="mx-auto max-w-lg px-4 py-4">
        <section className="mb-6 rounded-xl border border-gray-200 bg-signature/5 p-3 text-[13px] leading-relaxed text-gray-700 ring-1 ring-gray-200/80">
          <p className="font-medium text-gray-900">주문 알림 모아보기</p>
          <p className="mt-1 text-[12px] text-gray-600">
            배달 주문의 단계 변화와 데모 알림도 이 화면 아래에서 함께 확인할 수 있어요.
          </p>
        </section>
        <section
          id="order-sim"
          className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm ring-1 ring-gray-100"
        >
          <div className="mb-3">
            <h2 className="text-[14px] font-bold text-gray-900">주문 알림</h2>
            <p className="mt-1 text-[12px] text-gray-500">
              이전 주문 알림 화면에서 보던 내용도 여기서 이어서 확인합니다.
            </p>
          </div>
          <MemberNotificationList />
        </section>
        <h2 className="mb-2 text-[14px] font-bold text-gray-800">전체 알림</h2>
        <MyNotificationsView />
      </div>
    </div>
  );
}
