"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BusinessOwnerOpsStrip } from "@/components/business/BusinessOwnerOpsStrip";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { dbStoreToBusinessProfile, type StoreRow } from "@/lib/stores/db-store-mapper";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";

type Phase =
  | { kind: "loading" }
  | { kind: "need_store_id" }
  | { kind: "unauth" }
  | { kind: "config" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "ok"; row: StoreRow };

export default function MyBusinessOpsStatusPage() {
  const router = useRouter();
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
      if (status === 401) {
        setPhase({ kind: "unauth" });
        return;
      }
      if (status === 503) {
        setPhase({ kind: "config" });
        return;
      }
      const json = raw as { ok?: boolean; stores?: StoreRow[]; error?: string };
      if (!json?.ok) {
        setPhase({
          kind: "error",
          message: typeof json?.error === "string" ? json.error : "load_failed",
        });
        return;
      }
      const stores = (json.stores ?? []) as StoreRow[];
      const row = stores.find((s) => s.id === storeIdParam);
      if (!row) {
        setPhase({ kind: "not_found" });
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

  const stripProps = useMemo(() => {
    if (phase.kind !== "ok") return null;
    const row = phase.row;
    const profile = dbStoreToBusinessProfile(row);
    const canSell =
      !!row.sales_permission &&
      row.sales_permission.allowed_to_sell === true &&
      row.sales_permission.sales_status === "approved";
    return { row, profile, canSell };
  }, [phase]);

  return (
    <div className="max-w-full overflow-x-hidden">
      <div className="mx-auto min-w-0 max-w-4xl overflow-x-hidden py-1">
        {phase.kind === "loading" ? (
          <p className="text-[14px] text-gray-500">불러오는 중…</p>
        ) : phase.kind === "need_store_id" ? (
          <div className={`${OWNER_STORE_STACK_Y_CLASS} text-[14px] text-gray-600`}>
            <p>매장을 지정할 수 없습니다.</p>
            <Link href="/my/business" className="font-medium text-signature underline">
              내 매장으로
            </Link>
          </div>
        ) : phase.kind === "unauth" ? (
          <p className="text-[14px] text-amber-900">로그인이 필요합니다.</p>
        ) : phase.kind === "config" ? (
          <p className="text-[14px] text-gray-600">Supabase 매장 설정을 확인해 주세요.</p>
        ) : phase.kind === "not_found" ? (
          <div className={`${OWNER_STORE_STACK_Y_CLASS} text-[14px] text-gray-600`}>
            <p>해당 매장을 찾을 수 없거나 내 매장이 아닙니다.</p>
            <Link href="/my/business" className="font-medium text-signature underline">
              내 매장으로
            </Link>
          </div>
        ) : phase.kind === "error" ? (
          <div className={OWNER_STORE_STACK_Y_CLASS}>
            <p className="text-[14px] text-red-600">{phase.message}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="text-[14px] font-medium text-signature underline"
            >
              다시 시도
            </button>
          </div>
        ) : stripProps ? (
          <div className={`max-w-full min-w-0 ${OWNER_STORE_STACK_Y_CLASS}`}>
            <p className="text-[12px] leading-relaxed text-gray-500">
              DB에 반영된 심사·노출·판매 권한입니다. 배달·픽업 등 서비스 형태는{" "}
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/my/business/profile?storeId=${encodeURIComponent(phase.row.id)}`
                  )
                }
                className="font-medium text-signature underline"
              >
                매장 설정
              </button>
              에서 바꿀 수 있습니다.
            </p>
            <BusinessOwnerOpsStrip
              row={stripProps.row}
              profile={stripProps.profile}
              canSell={stripProps.canSell}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
