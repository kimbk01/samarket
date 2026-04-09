import { getAllAdProductsForAdmin } from "@/lib/ads/mock-ad-data";
import { AdProductTable } from "@/components/admin/ad-products/AdProductTable";

export default function AdminAdProductsPage() {
  const products = getAllAdProductsForAdmin();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">광고 상품 관리</h1>
        <p className="mt-1 text-[13px] text-gray-500">
          광고 상품을 추가하거나 수정합니다. 상품은 게시판·유형·기간·포인트로 구성됩니다.
        </p>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "전체 상품", value: products.length },
          { label: "활성", value: products.filter((p) => p.isActive).length },
          { label: "비활성", value: products.filter((p) => !p.isActive).length },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-ui-rect border border-gray-200 bg-white px-4 py-3 text-center shadow-sm">
            <p className="text-[24px] font-bold text-gray-900">{value}</p>
            <p className="text-[12px] text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* 상품 목록 */}
      <div className="rounded-ui-rect border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-[15px] font-semibold text-gray-900">광고 상품 목록</h2>
        </div>
        <div className="p-4">
          <AdProductTable products={products} />
        </div>
      </div>
    </div>
  );
}
