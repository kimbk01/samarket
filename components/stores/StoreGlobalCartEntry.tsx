"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";

export function StoreGlobalCartEntry() {
  const router = useRouter();
  const cart = useStoreCommerceCartOptional();

  const target = useMemo(() => {
    const buckets = cart?.listCartBuckets?.() ?? [];
    const first = buckets.find((b) => (b.itemCount ?? 0) > 0) ?? null;
    const slug = first?.storeSlug?.trim() ?? "";
    if (!slug) return null;
    return `/stores/${encodeURIComponent(slug)}/cart`;
  }, [cart]);

  useEffect(() => {
    if (!target) return;
    router.replace(target, { scroll: false });
  }, [router, target]);

  if (target) {
    return <div className="min-h-[30vh] px-4 py-12 text-center sam-text-body text-sam-muted">이동 중…</div>;
  }

  return (
    <div className="min-h-[40vh] px-4 py-12 text-center">
      <p className="sam-text-body font-medium text-sam-fg">장바구니가 비어 있어요.</p>
      <p className="mt-1 sam-text-body text-sam-muted">매장 상세에서 메뉴를 담아 주세요.</p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <Link className="sam-btn primary" href="/stores" scroll={false}>
          배달 홈으로
        </Link>
      </div>
    </div>
  );
}

