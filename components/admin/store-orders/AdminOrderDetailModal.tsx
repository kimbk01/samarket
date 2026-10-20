"use client";

/**
 * 공통 주문 상세 모달 — every order-ops screen opens the same detail with `?order=<id>&section=<s>`.
 * - Opening pushes a history entry → browser Back closes the modal; the URL is shareable.
 * - The list behind it is not reloaded (screens key their list on the URL minus these params).
 * - Closing after an admin action asks the screen to refresh that row (`onChanged`).
 */
import { useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DibayOverlayRoot } from "@/components/ui/dibay-overlay/DibayOverlayRoot";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { AdminOrderDetailView } from "@/components/admin/store-orders/AdminOrderDetailView";
import {
  parseAdminOrderDetailSection,
  type AdminOrderDetailSection,
} from "@/lib/admin/store-orders/admin-store-order-detail-contract";

export const ADMIN_ORDER_MODAL_PARAMS = ["order", "section"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** List screens key their data on the URL without the modal params (opening a detail never reloads the list). */
export function withoutAdminOrderModalParams(search: string): string {
  const p = new URLSearchParams(search);
  for (const k of ADMIN_ORDER_MODAL_PARAMS) p.delete(k);
  return p.toString();
}

export function useAdminOrderDetailParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pushedRef = useRef(false);
  const raw = searchParams.get("order")?.trim() ?? "";
  const orderId = UUID_RE.test(raw) ? raw : null;
  const section = parseAdminOrderDetailSection(searchParams.get("section"));

  const openOrder = useCallback(
    (id: string, s?: AdminOrderDetailSection | null) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("order", id);
      if (s) p.set("section", s);
      else p.delete("section");
      pushedRef.current = true;
      router.push(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const closeOrder = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      router.back();
      return;
    }
    // Opened from a shared link / another screen → drop the params in place.
    const qs = withoutAdminOrderModalParams(searchParams.toString());
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return { orderId, section, openOrder, closeOrder };
}

export function AdminOrderDetailModal({
  orderId,
  section,
  onClose,
  onChanged,
}: {
  orderId: string | null;
  section: AdminOrderDetailSection | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { language } = useI18n();
  const ko = language === "ko";
  return (
    <DibayOverlayRoot
      open={Boolean(orderId)}
      onClose={onClose}
      placement="center"
      zRole="sheet"
      ariaLabel={ko ? "주문 상세" : "Order detail"}
    >
      {orderId ? (
        <div
          className="flex max-h-[90vh] w-[min(960px,calc(100vw-32px))] flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-xl"
          data-admin-order-modal="1"
        >
          <div className="flex items-center justify-between border-b border-sam-border px-4 py-2">
            <span className="sam-text-body font-semibold text-sam-fg">{ko ? "주문 상세" : "Order detail"}</span>
            <AdminActionButton variant="quiet" size="sm" onClick={onClose} aria-label={adminCta("close", ko)}>
              ✕
            </AdminActionButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <AdminOrderDetailView key={orderId} orderId={orderId} initialSection={section} onChanged={onChanged} />
          </div>
          {/* 표준 하단 배치 (수정 계획 2-2): 왼쪽 [닫기] · 오른쪽 [주 동작] 1개. 처리 동작은 본문 각 섹션에 있고, 처리 중에는 그 버튼이 비활성화된다. */}
          <div
            className="flex flex-wrap items-center justify-between gap-2 border-t border-sam-border px-4 py-2"
            data-admin-modal-footer="1"
          >
            <AdminActionButton variant="secondary" size="sm" onClick={onClose} data-cta="close">
              {adminCta("close", ko)}
            </AdminActionButton>
            <div className="flex flex-wrap items-center gap-2">
              <AdminActionLink
                variant="primary"
                size="sm"
                href={`/admin/stores/orders/${encodeURIComponent(orderId)}`}
                data-cta="open-full"
              >
                {ko ? "전체 화면으로 열기" : "Open full page"}
              </AdminActionLink>
            </div>
          </div>
        </div>
      ) : null}
    </DibayOverlayRoot>
  );
}
