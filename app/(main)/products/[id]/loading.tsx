export default function ProductDetailLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="h-8 w-8 animate-pulse rounded-full bg-sam-border-soft" />
      <p className="mt-3 sam-text-body text-sam-muted">로딩 중...</p>
    </div>
  );
}
