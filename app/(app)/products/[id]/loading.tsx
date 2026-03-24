export default function ProductDetailLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
      <p className="mt-3 text-[14px] text-gray-500">로딩 중...</p>
    </div>
  );
}
