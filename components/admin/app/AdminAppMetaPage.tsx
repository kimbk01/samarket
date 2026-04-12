"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AppMetaRow } from "@/lib/types/settings-db";
import { getSupabaseClient } from "@/lib/supabase/client";

export function AdminAppMetaPage() {
  const [items, setItems] = useState<AppMetaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (supabase) {
      // TODO: supabase.from('app_meta').select('*').then(({ data }) => setItems(data ?? []))
    }
    setLoading(false);
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-[18px] font-semibold text-sam-fg">앱 메타 (버전 등)</h1>
      {loading ? (
        <p className="text-sam-muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 text-[14px] text-sam-muted">
          app_version, app_build 등 키를 Supabase app_meta에 등록하면 여기서 수정할 수 있습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.key} className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-3">
              <div>
                <span className="font-medium">{m.key}</span>
                <span className="ml-2 text-[13px] text-sam-muted">{m.value}</span>
              </div>
              <Link href={`/admin/app/meta/${encodeURIComponent(m.key)}/edit`} className="text-[14px] text-signature">
                수정
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
