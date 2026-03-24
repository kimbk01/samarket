"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { OwnerStoreProfileForm } from "@/components/business/OwnerStoreProfileForm";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

type Phase =
  | { kind: "loading" }
  | { kind: "need_store_id" }
  | { kind: "unauth" }
  | { kind: "config" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "ok"; row: StoreRow };

function MyBusinessProfilePageInner() {
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
      const res = await fetch("/api/me/stores", { credentials: "include" });
      if (res.status === 401) {
        setPhase({ kind: "unauth" });
        return;
      }
      if (res.status === 503) {
        setPhase({ kind: "config" });
        return;
      }
      const json = await res.json();
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
    <div className="min-h-screen max-w-full overflow-x-hidden bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-2 py-3">
        <AppBackButton backHref="/my/business" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">매장 설정</h1>
        <span className="w-11 shrink-0" />
      </header>

      <div className="min-w-0 max-w-full overflow-x-hidden px-4 py-4">
        {phase.kind === "loading" ? (
          <p className="text-[14px] text-gray-500">불러오는 중…</p>
        ) : phase.kind === "need_store_id" ? (
          <div className={`${OWNER_STORE_STACK_Y_CLASS} text-[14px] text-gray-600`}>
            <p>수정할 매장을 지정할 수 없습니다.</p>
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
        ) : (
          <div className={`max-w-full min-w-0 ${OWNER_STORE_STACK_Y_CLASS} pb-36 sm:pb-32`}>
            <OwnerStoreProfileForm
              storeId={phase.row.id}
              storeSlug={phase.row.slug}
              row={phase.row}
              onSaved={() => void load()}
              onCancel={() => router.push("/my/business")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function MyBusinessProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen max-w-full overflow-x-hidden bg-gray-50 px-4 py-4">
          <p className="text-[14px] text-gray-500">불러오는 중…</p>
        </div>
      }
    >
      <MyBusinessProfilePageInner />
    </Suspense>
  );
}
