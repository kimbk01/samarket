"use client";

import Link from "next/link";
import type { Product } from "@/lib/types/product";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { formatMoneyPhp } from "@/lib/utils/format";

interface AdminProductTableProps {
  products: Product[];
}

function adminProductLocale(language: string): string {
  if (language === "en") return "en-US";
  if (language === "zh-CN") return "zh-CN";
  return "ko-KR";
}

export function AdminProductTable({ products }: AdminProductTableProps) {
  const { t, language } = useI18n();
  const locale = adminProductLocale(language);

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">ID</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_products_th_name")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_products_th_seller")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_products_th_status")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_products_th_price")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_products_th_region")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_products_th_likes_chat")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_products_th_created")}</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/products/${p.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {p.id}
                </Link>
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-sam-fg">
                {p.title}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                <div className="min-w-0">
                  <p className="truncate">{p.seller?.nickname ?? p.sellerId ?? "-"}</p>
                  {p.seller?.username ? (
                    <p className="mt-0.5 truncate font-mono sam-text-xxs text-sam-muted tabular-nums">
                      @{p.seller.username}
                    </p>
                  ) : null}
                </div>
              </td>
              <td className="px-3 py-2.5">
                <AdminStatusBadge status={p.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-sam-fg">
                {formatMoneyPhp(p.price)}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-sam-muted">
                {p.location}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-sam-muted">
                {p.likesCount ?? 0} / {p.chatCount ?? 0}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(p.createdAt).toLocaleDateString(locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
