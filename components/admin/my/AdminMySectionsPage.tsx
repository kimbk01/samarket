"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MyPageSectionRow } from "@/lib/my/types";
import { getSupabaseClient } from "@/lib/supabase/client";

export function AdminMySectionsPage() {
  const [items, setItems] = useState<MyPageSectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (supabase) {
      // TODO: supabase.from('my_page_sections').select('*').order('sort_order').then(({ data }) => setItems(data ?? []))
    }
    setLoading(false);
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-[18px] font-semibold text-gray-900">나의 카마켓 섹션</h1>
      {loading ? (
        <p className="text-gray-500">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg bg-white p-4 text-[14px] text-gray-500">
          섹션이 없습니다. Supabase my_page_sections 연동 후 목록이 표시됩니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.section_key} className="flex items-center justify-between rounded-lg bg-white p-3">
              <div>
                <span className="font-medium">{s.title}</span>
                <span className="ml-2 text-[13px] text-gray-500">
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
