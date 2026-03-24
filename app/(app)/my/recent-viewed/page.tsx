import { RecentViewedList } from "@/components/recent-viewed/RecentViewedList";

export default function RecentViewedPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4">
      <h1 className="mb-4 text-[18px] font-semibold text-gray-900">
        최근 본 상품
      </h1>
      <RecentViewedList />
    </div>
  );
}
