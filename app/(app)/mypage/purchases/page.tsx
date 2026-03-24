import { AppBackButton } from "@/components/navigation/AppBackButton";
import { PurchasesView } from "@/components/mypage/PurchasesView";

export default function MypagePurchasesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton backHref="/mypage" ariaLabel="뒤로" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
          구매내역
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="mx-auto max-w-lg px-4 py-4 pb-24">
        <PurchasesView />
      </div>
    </div>
  );
}
