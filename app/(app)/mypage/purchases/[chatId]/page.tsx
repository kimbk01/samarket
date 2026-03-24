import { AppBackButton } from "@/components/navigation/AppBackButton";
import { PurchaseDetailView } from "@/components/mypage/purchases/PurchaseDetailView";
import { parseRoomId } from "@/lib/validate-params";

interface PageProps {
  params: Promise<{ chatId: string }>;
}

export default async function PurchaseDetailPage({ params }: PageProps) {
  const { chatId: raw } = await params;
  const chatId = parseRoomId(raw);
  if (!chatId) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <p className="text-center text-[14px] text-gray-500">잘못된 경로입니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton backHref="/mypage/purchases" ariaLabel="뒤로" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">구매 상세</h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="mx-auto max-w-lg px-4 py-4">
        <PurchaseDetailView chatId={chatId} />
      </div>
    </div>
  );
}
