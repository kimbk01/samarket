"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MyPageBannerRow } from "@/lib/my/types";
import { getSupabaseClient } from "@/lib/supabase/client";

export function AdminMyBannersPage() {
  const [items, setItems] = useState<MyPageBannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;
    void (async () => {
      if (!supabase) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("my_page_banners")
        .select("*")
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setItems([]);
      } else {
        setError(null);
        setItems((data ?? []) as MyPageBannerRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[18px] font-semibold text-sam-fg">나의 카마켓 배너</h1>
        <Link
          href="/admin/my/banners/create"
          className="rounded-ui-rect bg-signature px-3 py-2 text-[14px] font-medium text-white"
        >
          추가
        </Link>
      </div>
      {loading ? (
        <p className="text-sam-muted">불러오는 중…</p>
      ) : error ? (
        <p className="rounded-ui-rect bg-red-50 p-4 text-[14px] text-red-700">{error}</p>
      ) : items.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 text-[14px] text-sam-muted">
          등록된 배너가 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-3">
              <div>
                <span className="font-medium">{b.title}</span>
                <span className="ml-2 text-[13px] text-sam-muted">
                  {b.is_active ? "노출" : "숨김"} · 순서 {b.sort_order}
                </span>
              </div>
              <Link href={`/admin/my/banners/${b.id}/edit`} className="text-[14px] text-signature">
                수정
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
