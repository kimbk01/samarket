export default function MainLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="h-10 animate-pulse rounded-2xl bg-gray-200/80" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-[28px] bg-white shadow-sm" />
          <div className="h-28 animate-pulse rounded-[28px] bg-white shadow-sm" />
          <div className="h-28 animate-pulse rounded-[28px] bg-white shadow-sm" />
        </div>
        <div className="hidden space-y-4 lg:block">
          <div className="h-36 animate-pulse rounded-[28px] bg-white shadow-sm" />
          <div className="h-52 animate-pulse rounded-[28px] bg-white shadow-sm" />
        </div>
      </div>
    </div>
  );
}
