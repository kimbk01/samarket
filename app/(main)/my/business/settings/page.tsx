"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";

type Phase =
  | { kind: "loading" }
  | { kind: "need_store_id" }
  | { kind: "error"; message: string }
  | { kind: "ok"; row: StoreRow };

function MyBusinessSettingsPageInner() {
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
    return <p className="sam-text-body text-sam-muted">불러오는 중…</p>;
  }
  if (phase.kind === "need_store_id") {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} sam-text-body text-sam-muted`}>
        <p>매장을 지정할 수 없습니다.</p>
        <Link href="/stores/owner" className="font-medium text-signature underline">
          대시보드로
        </Link>
      </div>
    );
  }
  if (phase.kind === "error") {
    return (
      <p className="sam-text-body text-red-600">
        설정을 불러오지 못했습니다. ({phase.message})
      </p>
    );
  }

  const row = phase.row;
  const q = `storeId=${encodeURIComponent(row.id)}`;
  const isApproved = row.approval_status === "approved";
  const visible = row.is_visible === true;

  const toggleVisible = useCallback(async () => {
    if (!isApproved) return;
    const next = !visible;
    try {
      const res = await fetch(`/api/me/stores/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_visible: next }),
      });
      const json = (await res.json()) as { ok?: boolean; store?: StoreRow; error?: string };
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? `http_${res.status}`);
      if (json.store?.id === row.id) {
        setPhase({ kind: "ok", row: json.store });
      } else {
        await load();
      }
    } catch {
      // fall back to refresh; keep UI simple
      await load();
    }
  }, [isApproved, load, row.id, visible]);

  return (
    <div className={`${OWNER_STORE_STACK_Y_CLASS}`}>
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">매장 노출</h2>
        <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
          동네 매장 목록·탭과 공개 매장 페이지(
          <code className="rounded bg-sam-surface-muted px-1 sam-text-helper">/stores/[slug]</code>)에 표시할지
          설정합니다. 승인이 완료되어도 <strong className="font-semibold text-sam-fg">처음에는 비노출</strong>로
          시작합니다. 운영 허브 상단의 「노출」스위치와 동일합니다.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2">
          <div className="min-w-0">
            <p className="sam-text-body font-medium text-sam-fg">
              {visible ? "노출됨 (Y)" : "비노출 (N)"}
            </p>
            <p className="sam-text-helper text-sam-muted">
              {isApproved ? "원할 때 언제든 변경할 수 있어요." : "승인 완료 후에만 변경할 수 있어요."}
            </p>
          </div>
          <button
            type="button"
            disabled={!isApproved}
            onClick={() => void toggleVisible()}
            className={[
              "shrink-0 rounded-ui-rect px-3 py-2 sam-text-body font-medium",
              isApproved
                ? visible
                  ? "border border-sam-border bg-sam-surface text-sam-fg"
                  : "bg-signature text-white"
                : "cursor-not-allowed border border-sam-border bg-sam-surface-muted text-sam-muted",
            ].join(" ")}
          >
            {visible ? "비노출로 전환" : "노출로 전환"}
          </button>
        </div>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">배달 신규 주문 알림음</h2>
        <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
          신규 배달 주문이 들어올 때 재생되는 소리는 <strong className="font-semibold text-sam-fg">모든 매장 공통</strong>
          으로, 서비스 관리자가{" "}
          <strong className="font-semibold text-sam-fg">관리자 → 매장 신청 설정</strong>
          (<code className="rounded bg-sam-surface-muted px-1 sam-text-helper">/admin/stores/application-settings</code>)의
          「매장 알림음 (배달 신규 주문)」에서 설정합니다. 매장별로 파일을 올리는 기능은 사용하지 않습니다.
        </p>
        <p className="mt-2 sam-text-helper text-sam-muted">
          관리자가 파일을 등록하지 않은 경우 브라우저에서 짧은 비프음이 재생됩니다.
        </p>
        <p className="mt-3 sam-text-body-secondary text-sam-muted">
          운영·심사 상태는{" "}
          <Link href={`/stores/owner/ops-status?${q}`} className="font-medium text-signature underline">
            운영 · 심사
          </Link>
          에서 확인할 수 있습니다.
        </p>
      </section>

      <section className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface p-4 sam-text-body-secondary text-sam-muted">
        주문 자동 처리·직원 권한 등은 준비 중입니다. 매장 프로필·영업 시간은{" "}
        <Link href={`/stores/owner/profile?${q}`} className="font-medium text-signature underline">
          매장 프로필
        </Link>
        에서 수정할 수 있습니다.
      </section>
    </div>
  );
}

export default function MyBusinessSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-full overflow-x-hidden py-4">
          <p className="sam-text-body text-sam-muted">불러오는 중…</p>
        </div>
      }
    >
      <MyBusinessSettingsPageInner />
    </Suspense>
  );
}
