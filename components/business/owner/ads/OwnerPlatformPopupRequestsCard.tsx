"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { withStoreId } from "@/lib/business/owner-routes";
import { PLATFORM_POPUP_OWNER_ROUTES } from "@/lib/platform-popup/platform-popup-owner-routes";
import { platformPopupOwnerRequestStatusLabel } from "@/lib/platform-popup/popup-product-labels";
import type { PlatformPopupOwnerRequestRow } from "@/lib/platform-popup/owner-request-types";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";

/**
 * D-5 (Owner 재설계안 승인 2026-11-03) — 팝업 광고 신규 판매는 꺼져 있어(`OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED`)
 * 신청 상세(`/ads/popup/[requestId]`)로 들어갈 길이 없던 고아 화면 → 기존 신청이 있을 때만 목록을 보여 준다.
 * 신청이 없으면 아무것도 그리지 않는다(새 신청 진입점은 만들지 않음).
 */
export function OwnerPlatformPopupRequestsCard({ storeId }: { storeId: string | null }) {
  const { t, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [items, setItems] = useState<PlatformPopupOwnerRequestRow[]>([]);

  useEffect(() => {
    const sid = storeId?.trim();
    if (!sid) {
      setItems([]);
      return;
    }
    const ac = new AbortController();
    void fetch(`/api/me/platform-popup-requests?storeId=${encodeURIComponent(sid)}`, {
      credentials: "include",
      cache: "no-store",
      signal: ac.signal,
    })
      .then((res) => res.json().catch(() => null))
      .then((json: { ok?: boolean; items?: PlatformPopupOwnerRequestRow[] } | null) => {
        if (ac.signal.aborted) return;
        setItems(json?.ok && Array.isArray(json.items) ? json.items : []);
      })
      .catch(() => {
        /* 목록을 못 읽으면 카드를 그리지 않음 — 광고 허브 나머지는 그대로 */
      });
    return () => ac.abort();
  }, [storeId]);

  if (items.length === 0) return null;

  return (
    <section
      className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
      data-owner-ads-popup-requests="1"
    >
      <p className="text-[15px] font-bold text-sam-fg">{t("owner_platform_popup_requests_title")}</p>
      <ul className="mt-2 divide-y divide-sam-border-soft">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={withStoreId(PLATFORM_POPUP_OWNER_ROUTES.popupRequestDetail(item.id), storeId)}
              className="flex min-w-0 items-center justify-between gap-3 py-2.5 active:bg-sam-surface-muted"
            >
              <span className="min-w-0 truncate text-[14px] text-sam-fg">
                {platformPopupOwnerRequestStatusLabel(item.requestStatus, lang)}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-sam-muted">
                {formatMypageDate(item.createdAt, { style: "date", lang })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
