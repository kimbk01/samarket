"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasApprovedOwnerStore } from "@/lib/stores/store-admin-access";

type CommercePhase =
  | { kind: "loading" }
  | { kind: "unauth" }
  | { kind: "ready"; approved: boolean };

async function resolveCommercePhase(): Promise<Exclude<CommercePhase, { kind: "loading" }>> {
  try {
    const res = await fetch("/api/me/stores", { credentials: "include" });
    if (res.status === 401) {
      return { kind: "unauth" };
    }
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      stores?: { approval_status: string }[];
    };
    if (!json?.ok) {
      return { kind: "ready", approved: false };
    }
    const stores = json.stores ?? [];
    return { kind: "ready", approved: hasApprovedOwnerStore(stores) };
  } catch {
    return { kind: "ready", approved: false };
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
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-[14px] font-semibold text-gray-900">동네 매장</h2>
        <div className="mt-3 h-20 animate-pulse rounded-lg bg-gray-100" />
      </section>
    );
  }

  if (phase.kind === "unauth") {
    return null;
  }

  const { approved } = phase;

  if (!approved) {
    return (
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-[14px] font-semibold text-gray-900">동네 매장 (사장님)</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
          승인된 매장이 있으면 주문·문의·정산을 여기서 관리할 수 있습니다. 매장 등록은 누구나 신청할 수 있습니다.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Link
            href="/my/business/apply"
            className="rounded-lg border border-gray-200 bg-[#F7F7F7] py-3 text-center text-[13px] font-medium text-gray-800"
          >
            매장 등록 신청
          </Link>
          <Link href="/mypage/store-orders" className="text-center text-[12px] text-gray-500 underline">
            내가 주문한 매장 주문 보기
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="text-[14px] font-semibold text-gray-900">동네 매장 (사장님)</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href="/my/business/store-orders"
          className="rounded-lg border border-gray-100 bg-[#F7F7F7] py-3 text-center text-[13px] font-medium text-gray-800"
        >
          주문 관리
        </Link>
        <Link
          href="/my/business/inquiries"
          className="rounded-lg border border-gray-100 bg-[#F7F7F7] py-3 text-center text-[13px] font-medium text-gray-800"
        >
          받은 문의
        </Link>
        <Link
          href="/my/business/settlements"
          className="col-span-2 rounded-lg border border-gray-100 bg-[#F7F7F7] py-3 text-center text-[13px] font-medium text-gray-800"
        >
          정산 내역
        </Link>
      </div>
      <Link href="/mypage/store-orders" className="mt-3 block text-center text-[12px] text-gray-500 underline">
        내가 주문한 매장 주문 보기
      </Link>
    </section>
  );
}
