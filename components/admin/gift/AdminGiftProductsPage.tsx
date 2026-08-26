"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type ProductRow = {
  id: string;
  store_id: string;
  title: string;
  face_value: number;
  purchase_price: number;
  platform_fee_rate?: number;
  active: boolean;
  image_url: string | null;
  issued_count?: number;
  created_at?: string;
};

export function AdminGiftProductsPage() {
  const { safeT } = useI18n();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    const res = await fetch("/api/admin/gift-certificates/products", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; products?: ProductRow[] };
    setRows(json.ok ? json.products ?? [] : []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" data-admin-gift-products="1">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          {safeT("gift_admin_products_title", {
            fallbackKo: "상품권 상품",
            fallbackEn: "Gift products",
          })}
        </h1>
        <Link
          href="/admin/gift-certificates/applications"
          className="text-sm font-semibold text-signature underline"
        >
          {safeT("gift_admin_list_title", {
            fallbackKo: "상품권 판매 신청",
            fallbackEn: "Gift sale applications",
          })}
        </Link>
      </div>
      {!loaded ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">
          {safeT("gift_admin_empty_products", {
            fallbackKo: "등록된 상품권이 없습니다. 신청을 검토해 상품을 만드세요.",
            fallbackEn: "No gift products yet. Review an application to create one.",
          })}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => (
            <li key={p.id} className="flex gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_url} alt="" className="h-14 w-14 rounded-ui-rect object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-ui-rect bg-sam-app text-xs text-sam-muted">
                  Gift
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.title}</p>
                <p className="text-xs text-sam-muted">
                  {p.purchase_price.toLocaleString()} → {p.face_value.toLocaleString()} ·{" "}
                  {safeT("gift_u6_products_fee", {
                    fallbackKo: "플랫폼 수수료",
                    fallbackEn: "Platform fee",
                  })}{" "}
                  {Math.trunc(Number(p.platform_fee_rate) || 0)}% · {p.active ? "active" : "inactive"} · issued{" "}
                  {p.issued_count ?? 0}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
