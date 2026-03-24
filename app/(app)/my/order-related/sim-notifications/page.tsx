import Link from "next/link";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { MemberNotificationList } from "@/components/member-orders/MemberNotificationList";

export default function MyOrderSimNotificationsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton preferHistoryBack backHref="/mypage" />
        <h1 className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold text-gray-900">
          식당·배달 주문 알림
        </h1>
        <div className="w-11 shrink-0" />
      </header>
      <div className="mx-auto max-w-[480px] space-y-3 px-4 py-4">
        <p className="text-[12px] leading-relaxed text-gray-500">
          공유 주문 스토어와 연동된 데모 알림입니다. 앱 상단 알림함의「전체 알림」과는 별도로 여기서만
          모아 봅니다.
        </p>
        <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm ring-1 ring-violet-50">
          <MemberNotificationList />
        </section>
        <p className="text-center text-[12px] text-gray-500">
          <Link href="/my/notifications" className="text-violet-700 underline">
            전체 알림 화면
          </Link>
          으로 이동
        </p>
      </div>
    </div>
  );
}
