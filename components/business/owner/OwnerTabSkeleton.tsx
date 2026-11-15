"use client";

/**
 * 매장 사장님 하단 탭 이동 중 뼈대 — 하단 탭 계약 v2 (Owner 2026-11-15 「사장님 뼈대 신설」).
 * 누른 프레임에 목적 화면(주문·상품·고객·관리)의 첫 화면 모양을 회색 블록으로 먼저 보인다 — 이전 화면을 남기지 않는다.
 * Next 경로가 확정되면 실제 화면으로 바뀐다(`OwnerStackPageSlideShell`). 정지 화면, 글자 없음(언어 무관).
 */
export type OwnerTabSkeletonKind = "orders" | "products" | "customers" | "manage";

const BLOCK = "rounded-ui-rect bg-sam-surface-muted";
const CARD = "rounded-ui-rect bg-sam-surface";

/** 경로 → 뼈대 종류 (사장님 하단 탭 4개 목적지만) */
export function resolveOwnerTabSkeletonKind(path: string): OwnerTabSkeletonKind | null {
  const p = (path.split("?")[0] ?? "").replace(/\/+$/, "");
  if (p === "/stores/owner/orders") return "orders";
  if (p === "/stores/owner/products") return "products";
  if (p === "/stores/owner/customer-care") return "customers";
  if (p === "/stores/owner/settings") return "manage";
  return null;
}

function ListRow({ trailing = true }: { trailing?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-8 w-8 shrink-0 rounded-full bg-sam-surface-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className={`h-4 w-1/2 ${BLOCK}`} />
        <div className={`h-3 w-2/3 ${BLOCK}`} />
      </div>
      {trailing ? <div className={`h-8 w-14 shrink-0 ${BLOCK}`} /> : null}
    </div>
  );
}

function OrdersSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex gap-2">
        {[56, 64, 64, 72].map((w) => (
          <div key={w} className={`h-9 shrink-0 ${BLOCK}`} style={{ width: w }} />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`flex flex-col gap-2 p-4 ${CARD}`}>
          <div className={`h-4 w-1/3 ${BLOCK}`} />
          <div className={`h-3 w-3/4 ${BLOCK}`} />
          <div className={`h-3 w-1/2 ${BLOCK}`} />
        </div>
      ))}
    </div>
  );
}

function ProductsSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="grid grid-cols-2 gap-2">
        <div className={`h-11 ${BLOCK}`} />
        <div className={`h-11 ${BLOCK}`} />
      </div>
      <div className="flex gap-2">
        {[44, 56, 56, 52, 56].map((w, i) => (
          <div key={i} className={`h-8 shrink-0 ${BLOCK}`} style={{ width: w }} />
        ))}
      </div>
      <div className={`h-10 w-full ${BLOCK}`} />
      {[0, 1, 2].map((i) => (
        <div key={i} className={`flex gap-3 p-3 ${CARD}`}>
          <div className={`h-16 w-16 shrink-0 ${BLOCK}`} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className={`h-4 w-1/2 ${BLOCK}`} />
            <div className={`h-3 w-1/3 ${BLOCK}`} />
            <div className={`h-3 w-1/4 ${BLOCK}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CustomersSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-3">
      <div className={`mx-4 h-5 w-24 ${BLOCK}`} />
      <div className={`mx-4 flex flex-col ${CARD}`}>
        <ListRow />
        <ListRow />
        <ListRow />
      </div>
      <div className={`mx-4 h-5 w-28 ${BLOCK}`} />
      <div className={`mx-4 flex flex-col ${CARD}`}>
        <ListRow />
      </div>
    </div>
  );
}

function ManageSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className={`flex flex-col gap-3 p-4 ${CARD}`}>
        <div className={`h-4 w-24 ${BLOCK}`} />
        <div className={`h-3 w-5/6 ${BLOCK}`} />
        <div className={`h-8 w-40 ${BLOCK}`} />
      </div>
      <div className={`h-4 w-20 ${BLOCK}`} />
      <div className={`flex flex-col ${CARD}`}>
        <ListRow trailing={false} />
        <ListRow trailing={false} />
        <ListRow trailing={false} />
      </div>
      <div className={`h-4 w-20 ${BLOCK}`} />
      <div className={`flex flex-col ${CARD}`}>
        <ListRow trailing={false} />
        <ListRow trailing={false} />
      </div>
    </div>
  );
}

export function OwnerTabSkeleton({ kind }: { kind: OwnerTabSkeletonKind }) {
  return (
    <div
      className="min-h-[70dvh] w-full min-w-0 bg-[var(--biz-app-bg)]"
      aria-busy="true"
      data-owner-tab-skeleton={kind}
    >
      {kind === "orders" ? (
        <OrdersSkeleton />
      ) : kind === "products" ? (
        <ProductsSkeleton />
      ) : kind === "customers" ? (
        <CustomersSkeleton />
      ) : (
        <ManageSkeleton />
      )}
    </div>
  );
}
