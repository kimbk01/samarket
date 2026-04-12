"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AppSupportedCountryRow } from "@/lib/types/settings-db";
import { getSupabaseClient } from "@/lib/supabase/client";

export function AdminAppCountriesPage() {
  const [items, setItems] = useState<AppSupportedCountryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (supabase) {
      // TODO: supabase.from('app_supported_countries').select('*').order('sort_order').then(({ data }) => setItems(data ?? []))
    }
    setLoading(false);
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[18px] font-semibold text-sam-fg">국가 목록</h1>
        <Link
          href="/admin/app/countries/create"
          className="rounded-ui-rect bg-signature px-3 py-2 text-[14px] font-medium text-white"
        >
          추가
        </Link>
      </div>
      {loading ? (
        <p className="text-sam-muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 text-[14px] text-sam-muted">
          국가가 없습니다. Supabase app_supported_countries 연동 후 목록이 표시됩니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.code} className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-3">
              <div>
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-[13px] text-sam-muted">
                  {c.code} · {c.is_active ? "노출" : "숨김"} · 순서 {c.sort_order}
                </span>
              </div>
              <Link href={`/admin/app/countries/${c.code}/edit`} className="text-[14px] text-signature">
                수정
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
