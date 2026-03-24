import Link from "next/link";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { MyNotificationsView } from "@/components/my/MyNotificationsView";
import { MemberNotificationBell } from "@/components/member-orders/MemberNotificationBell";

export default function MyNotificationsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton backHref="/my" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">알림</h1>
        <div className="w-11 shrink-0 flex justify-end">
          <MemberNotificationBell />
        </div>
      </header>
      <div className="mx-auto max-w-[480px] px-4 py-4">
        <section className="mb-6 rounded-xl border border-violet-100 bg-violet-50/40 p-3 text-[13px] leading-relaxed text-gray-700 ring-1 ring-violet-100/80">
          <p className="font-medium text-gray-900">식당·배달 주문 알림 (시뮬)</p>
          <p className="mt-1 text-[12px] text-gray-600">
            주문 단계·취소 등 데모 알림은{" "}
            <span className="font-medium text-gray-800">내정보 → 주문 관련 항목</span>에서 모아 볼 수
            있어요.
          </p>
          <Link
            href="/my/order-related/sim-notifications"
            className="mt-2 inline-block text-[12px] font-semibold text-violet-700 underline"
          >
            주문 알림 화면으로 이동
          </Link>
        </section>
        <h2 className="mb-2 text-[14px] font-bold text-gray-800">전체 알림</h2>
        <MyNotificationsView />
      </div>
    </div>
  );
}
