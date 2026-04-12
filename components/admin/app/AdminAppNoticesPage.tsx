"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AppNoticeRow } from "@/lib/types/settings-db";
import { getSupabaseClient } from "@/lib/supabase/client";

export function AdminAppNoticesPage() {
  const [items, setItems] = useState<AppNoticeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (supabase) {
      (supabase as any)
        .from("app_notices")
        .select("id, title, body, is_active, created_at")
        .order("created_at", { ascending: false })
        .then(({ data, error }: { data: AppNoticeRow[] | null; error: unknown }) => {
          if (!error && Array.isArray(data)) setItems(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[18px] font-semibold text-sam-fg">공지사항</h1>
        <Link
          href="/admin/app/notices/create"
          className="rounded-ui-rect bg-signature px-3 py-2 text-[14px] font-medium text-white"
        >
          추가
        </Link>
      </div>
      {loading ? (
        <p className="text-sam-muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 text-[14px] text-sam-muted">
          공지가 없습니다. Supabase app_notices 연동 후 목록이 표시됩니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-3">
              <div>
                <span className="font-medium">{n.title}</span>
                <span className="ml-2 text-[13px] text-sam-muted">
                  {n.is_active ? "노출" : "숨김"}
                </span>
              </div>
              <Link href={`/admin/app/notices/${n.id}/edit`} className="text-[14px] text-signature">
                수정
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
