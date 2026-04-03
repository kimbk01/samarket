"use client";

import Link from "next/link";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { pickPreferredOwnerStore } from "@/lib/stores/owner-lite-external-store";
import {
  formatStoreApprovalStatusKo,
  isStorePubliclyListed,
} from "@/lib/stores/store-approval-label-ko";
import { FB } from "@/components/stores/store-facebook-feed-tokens";

function pickPrimaryStore(stores: StoreRow[]): StoreRow | null {
  return pickPreferredOwnerStore(stores);
}

/**
 * `/stores` 허브 — 로그인·소유 매장이 있을 때 심사 상태와 운영 센터 진입
 */
export function StoreMyBusinessHubBanner({
  loading,
  ownerStores,
}: {
  loading: boolean;
  ownerStores: StoreRow[];
}) {
  if (loading && ownerStores.length === 0) {
    return (
      <div className={`rounded-2xl border border-[#E4E6EB] bg-white/90 px-4 py-3 dark:border-[#3E4042] dark:bg-[#242526]`}>
        <p className={`text-[12px] ${FB.metaSm}`}>내 매장 상태 확인 중…</p>
      </div>
    );
  }

  if (ownerStores.length === 0) return null;

  const primary = pickPrimaryStore(ownerStores);
  if (!primary) return null;

  const q = `storeId=${encodeURIComponent(primary.id)}`;
  const statusKo = formatStoreApprovalStatusKo(primary.approval_status);
  const listed = isStorePubliclyListed(primary);
  const extraCount = ownerStores.length - 1;

  const statusTone =
    String(primary.approval_status) === "approved" ?
      "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100"
    : String(primary.approval_status) === "rejected" ?
      "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100"
    : "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100";

  return (
    <section
      className={`rounded-2xl border border-[#E4E6EB] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-[#3E4042] dark:bg-[#242526] dark:shadow-none`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${FB.metaSm}`}>내 매장</p>
          <p className="mt-0.5 truncate text-[15px] font-bold text-[#050505] dark:text-[#E4E6EB]">
            {primary.store_name?.trim() || "이름 없음"}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone}`}>{statusKo}</span>
            {listed ?
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">/stores 노출</span>
            : (
              <span className={`text-[11px] ${FB.metaSm}`}>
                승인·노출 전까지 고객용 목록에는 나오지 않습니다.
              </span>
            )}
          </div>
          {extraCount > 0 ?
            <p className={`mt-1 text-[11px] ${FB.metaSm}`}>다른 소유 매장 {extraCount}건 — 운영 센터에서 전환할 수 있어요.</p>
          : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Link
            href={`/my/business?${q}`}
            className="inline-flex items-center justify-center rounded-full bg-[#1877F2] px-4 py-2 text-[12px] font-bold text-white active:opacity-90"
          >
            운영 센터
          </Link>
          {listed && primary.slug ?
            <Link
              href={`/stores/${encodeURIComponent(primary.slug)}`}
              className={`inline-flex items-center justify-center rounded-full border border-[#E4E6EB] bg-[#F0F2F5] px-4 py-2 text-[12px] font-semibold text-[#050505] dark:border-[#3E4042] dark:bg-[#3A3B3C] dark:text-[#E4E6EB]`}
            >
              공개 페이지
            </Link>
          : null}
        </div>
      </div>
    </section>
  );
}
