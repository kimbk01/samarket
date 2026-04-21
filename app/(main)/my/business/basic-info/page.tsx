"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OwnerStoreBasicInfoForm } from "@/components/business/OwnerStoreBasicInfoForm";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";

type Phase =
  | { kind: "loading" }
  | { kind: "need_store_id" }
  | { kind: "unauth" }
  | { kind: "config" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "ok"; row: StoreRow };

export default function MyBusinessBasicInfoPage() {
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

  return (
    <div className="max-w-full overflow-x-hidden">
      <div className="mx-auto min-w-0 max-w-4xl overflow-x-hidden py-1">
        {phase.kind === "loading" ? (
          <p className="sam-text-body text-sam-muted">불러오는 중…</p>
        ) : phase.kind === "need_store_id" ? (
          <div className={`${OWNER_STORE_STACK_Y_CLASS} sam-text-body text-sam-muted`}>
            <p>매장을 지정할 수 없습니다.</p>
            <Link href="/my/business" className="font-medium text-signature underline">
              내 매장으로
            </Link>
          </div>
        ) : phase.kind === "unauth" ? (
          <p className="sam-text-body text-amber-900">로그인이 필요합니다.</p>
        ) : phase.kind === "config" ? (
          <p className="sam-text-body text-sam-muted">Supabase 매장 설정을 확인해 주세요.</p>
        ) : phase.kind === "not_found" ? (
          <div className={`${OWNER_STORE_STACK_Y_CLASS} sam-text-body text-sam-muted`}>
            <p>해당 매장을 찾을 수 없거나 내 매장이 아닙니다.</p>
            <Link href="/my/business" className="font-medium text-signature underline">
              내 매장으로
            </Link>
          </div>
        ) : phase.kind === "error" ? (
          <div className={OWNER_STORE_STACK_Y_CLASS}>
            <p className="sam-text-body text-red-600">{phase.message}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="sam-text-body font-medium text-signature underline"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <OwnerStoreBasicInfoForm
            storeId={phase.row.id}
            row={phase.row}
            onSaved={() => void load()}
            onCancel={() => router.push("/my/business")}
          />
        )}
      </div>
    </div>
  );
}
