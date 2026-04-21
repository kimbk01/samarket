"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AppSupportedLanguageRow } from "@/lib/types/settings-db";
import { getSupabaseClient } from "@/lib/supabase/client";

export function AdminAppLanguagesPage() {
  const [items, setItems] = useState<AppSupportedLanguageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (supabase) {
      // TODO: supabase.from('app_supported_languages').select('*').order('sort_order').then(({ data }) => setItems(data ?? []))
    }
    setLoading(false);
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">언어 목록</h1>
        <Link
          href="/admin/app/languages/create"
          className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          추가
        </Link>
      </div>
      {loading ? (
        <p className="text-sam-muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-sam-muted">
          언어가 없습니다. Supabase app_supported_languages 연동 후 목록이 표시됩니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((l) => (
            <li key={l.code} className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-3">
              <div>
                <span className="font-medium">{l.name}</span>
                <span className="ml-2 sam-text-body-secondary text-sam-muted">
                  {l.code} · {l.is_active ? "노출" : "숨김"} · 순서 {l.sort_order}
                </span>
              </div>
              <Link href={`/admin/app/languages/${l.code}/edit`} className="sam-text-body text-signature">
                수정
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
