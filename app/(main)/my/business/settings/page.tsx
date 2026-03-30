"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";

type Phase =
  | { kind: "loading" }
  | { kind: "need_store_id" }
  | { kind: "error"; message: string }
  | { kind: "ok"; row: StoreRow };

export default function MyBusinessSettingsPage() {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get("storeId")?.trim() ?? "";
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const load = useCallback(async () => {
    if (!storeIdParam) {
      setPhase({ kind: "need_store_id" });
      return;
    }
    setPhase({ kind: "loading" });
    try {
      const { status, json: raw } = await fetchMeStoresListDeduped();
      const json = raw as { ok?: boolean; stores?: StoreRow[] };
      if (status === 401) {
        setPhase({ kind: "error", message: "unauthorized" });
        return;
      }
      if (!json?.ok || !Array.isArray(json.stores)) {
        setPhase({ kind: "error", message: "load_failed" });
        return;
      }
      const row = json.stores.find((s) => s.id === storeIdParam);
      if (!row) {
        setPhase({ kind: "error", message: "not_found" });
        return;
      }
      setPhase({ kind: "ok", row });
    } catch {
      setPhase({ kind: "error", message: "network_error" });
    }
  }, [storeIdParam]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase.kind === "loading") {
    return <p className="text-[14px] text-gray-500">불러오는 중…</p>;
  }
  if (phase.kind === "need_store_id") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} text-[14px] text-gray-600`}>
        <p>매장을 지정할 수 없습니다.</p>
        <Link href="/my/business" className="font-medium text-signature underline">
          대시보드로
        </Link>
      </div>
    );
  }
  if (phase.kind === "error") {
    return (
      <p className="text-[14px] text-red-600">
        설정을 불러오지 못했습니다. ({phase.message})
      </p>
    );
  }

  const row = phase.row;
  const q = `storeId=${encodeURIComponent(row.id)}`;

  return (
    <div className={`${OWNER_STORE_STACK_Y_CLASS}`}>
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-[15px] font-semibold text-gray-900">배달 신규 주문 알림음</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
          신규 배달 주문이 들어올 때 재생되는 소리는 <strong className="font-semibold text-gray-800">모든 매장 공통</strong>
          으로, 서비스 관리자가{" "}
          <strong className="font-semibold text-gray-800">관리자 → 매장 신청 설정</strong>
          (<code className="rounded bg-gray-100 px-1 text-[12px]">/admin/stores/application-settings</code>)의
          「매장 알림음 (배달 신규 주문)」에서 설정합니다. 매장별로 파일을 올리는 기능은 사용하지 않습니다.
        </p>
        <p className="mt-2 text-[12px] text-gray-500">
          관리자가 파일을 등록하지 않은 경우 브라우저에서 짧은 비프음이 재생됩니다.
        </p>
        <p className="mt-3 text-[13px] text-gray-600">
          운영·심사 상태는{" "}
          <Link href={`/my/business/ops-status?${q}`} className="font-medium text-signature underline">
            운영 · 심사
          </Link>
          에서 확인할 수 있습니다.
        </p>
      </section>

      <section className="rounded-xl border border-dashed border-gray-200 bg-white p-4 text-[13px] text-gray-600">
        주문 자동 처리·직원 권한 등은 준비 중입니다. 매장 프로필·영업 시간은{" "}
        <Link href={`/my/business/profile?${q}`} className="font-medium text-signature underline">
          매장 프로필
        </Link>
        에서 수정할 수 있습니다.
      </section>
    </div>
  );
}
