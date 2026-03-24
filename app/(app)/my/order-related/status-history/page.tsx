import Link from "next/link";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { MemberOrderStatusHistoryContent } from "@/components/member-orders/MemberOrderStatusHistoryContent";

export default function MyOrderStatusHistoryPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton preferHistoryBack backHref="/mypage" />
        <h1 className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold text-gray-900">
          주문 상태 이력
        </h1>
        <div className="w-11 shrink-0" />
      </header>
      <div className="mx-auto max-w-[480px] space-y-3 px-4 py-4">
        <p className="text-[12px] leading-relaxed text-gray-500">
          개발용 샘플 주문의 단계 기록입니다. 실제 매장 주문 단계는 주문 상세에서 확인할 수 있어요.
        </p>
        <MemberOrderStatusHistoryContent />
        <p className="text-center text-[12px] text-gray-500">
          <Link href="/mypage/store-orders" className="text-violet-700 underline">
            매장 주문 내역
          </Link>
        </p>
      </div>
    </div>
  );
}
