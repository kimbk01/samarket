"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MyPageSectionRow } from "@/lib/my/types";
import { getSupabaseClient } from "@/lib/supabase/client";

export function AdminMySectionsPage() {
  const [items, setItems] = useState<MyPageSectionRow[]>([]);
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
        .from("my_page_sections")
        .select("*")
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setItems([]);
      } else {
        setError(null);
        setItems((data ?? []) as MyPageSectionRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-[18px] font-semibold text-sam-fg">나의 카마켓 섹션</h1>
      {loading ? (
        <p className="text-sam-muted">불러오는 중…</p>
      ) : error ? (
        <p className="rounded-ui-rect bg-red-50 p-4 text-[14px] text-red-700">{error}</p>
      ) : items.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 text-[14px] text-sam-muted">
          섹션이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.section_key} className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-3">
              <div>
                <span className="font-medium">{s.title}</span>
                <span className="ml-2 text-[13px] text-sam-muted">
                  {s.is_active ? "노출" : "숨김"} · 순서 {s.sort_order}
                </span>
              </div>
              <Link href={`/admin/my/sections/${s.section_key}/edit`} className="text-[14px] text-signature">
                수정
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
