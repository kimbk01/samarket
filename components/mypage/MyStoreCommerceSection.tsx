"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasApprovedOwnerStore } from "@/lib/stores/store-admin-access";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

type CommercePhase =
  | { kind: "loading" }
  | { kind: "unauth" }
  | { kind: "ready"; approved: boolean; primaryStoreId: string | null };

async function resolveCommercePhase(): Promise<Exclude<CommercePhase, { kind: "loading" }>> {
  try {
    const { status, json: raw } = await fetchMeStoresListDeduped();
    if (status === 401) {
      return { kind: "unauth" };
    }
    const json = raw as {
      ok?: boolean;
      stores?: { id?: string; approval_status: string }[];
    };
    if (!json?.ok) {
      return { kind: "ready", approved: false, primaryStoreId: null };
    }
    const stores = json.stores ?? [];
    const approved = hasApprovedOwnerStore(stores);
    const approvedRow = stores.find((s) => String(s.approval_status ?? "") === "approved");
    const primaryStoreId =
      approved && approvedRow?.id?.trim() ? approvedRow.id.trim() : null;
    return { kind: "ready", approved, primaryStoreId };
  } catch {
    return { kind: "ready", approved: false, primaryStoreId: null };
  }
}

export function MyStoreCommerceSection() {
  const [phase, setPhase] = useState<CommercePhase>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void resolveCommercePhase().then((p) => {
      if (!cancelled) setPhase(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase.kind === "loading") {
    return (
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">동네 매장</h2>
        <div className="mt-3 h-20 animate-pulse rounded-ui-rect bg-sam-surface-muted" />
      </section>
    );
  }

  if (phase.kind === "unauth") {
    return null;
  }

  const { approved, primaryStoreId } = phase;

  if (!approved) {
    return (
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">동네 매장 (사장님)</h2>
        <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
          승인된 매장이 있으면 주문·문의·정산을 여기서 관리할 수 있습니다. 매장 등록은 누구나 신청할 수 있습니다.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Link
            href="/my/business/apply"
            className="rounded-ui-rect border border-sam-border bg-sam-surface-muted py-3 text-center sam-text-body-secondary font-medium text-sam-fg"
          >
            매장 등록 신청
          </Link>
          <Link href="/my/store-orders" className="text-center sam-text-helper text-sam-muted underline">
            내가 주문한 배달 주문 보기
          </Link>
        </div>
      </section>
    );
  }

  const enc = primaryStoreId ? encodeURIComponent(primaryStoreId) : "";
  const ordersHref = primaryStoreId
    ? buildStoreOrdersHref({ storeId: primaryStoreId, tab: "new" })
    : "/my/business/store-orders";
  const inquiriesHref = primaryStoreId
    ? `/my/business/inquiries?storeId=${enc}`
    : "/my/business/inquiries";
  const hubHref = primaryStoreId ? `/my/business?storeId=${enc}` : "/my/business";
  const productsHref = primaryStoreId
    ? `/my/business/products?storeId=${enc}`
    : "/my/business/products";

  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h2 className="sam-text-body font-semibold text-sam-fg">동네 매장 (사장님)</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href={ordersHref}
          className="rounded-ui-rect border border-amber-200 bg-amber-50 py-3 text-center sam-text-body-secondary font-semibold text-amber-950"
        >
          신규·접수 주문
        </Link>
        <Link
          href={inquiriesHref}
          className="rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted py-3 text-center sam-text-body-secondary font-medium text-sam-fg"
        >
          받은 문의
        </Link>
        <Link
          href={hubHref}
          className="rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted py-3 text-center sam-text-body-secondary font-medium text-sam-fg"
        >
          운영 허브
        </Link>
        <Link
          href={productsHref}
          className="rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted py-3 text-center sam-text-body-secondary font-medium text-sam-fg"
        >
          상품 관리
        </Link>
        <Link
          href={
            primaryStoreId
              ? `/my/business/settlements?storeId=${encodeURIComponent(primaryStoreId)}`
              : "/my/business/settlements"
          }
          className="col-span-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted py-3 text-center sam-text-body-secondary font-medium text-sam-fg"
        >
          정산 내역
        </Link>
      </div>
      <Link href="/my/store-orders" className="mt-3 block text-center sam-text-helper text-sam-muted underline">
        내가 주문한 배달 주문 보기
      </Link>
    </section>
  );
}
