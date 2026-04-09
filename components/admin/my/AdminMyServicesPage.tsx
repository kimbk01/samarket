"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MyServiceRow } from "@/lib/my/types";
import { getSupabaseClient } from "@/lib/supabase/client";

export function AdminMyServicesPage() {
  const [items, setItems] = useState<MyServiceRow[]>([]);
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
        .from("my_services")
        .select("*")
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setItems([]);
      } else {
        setError(null);
        setItems((data ?? []) as MyServiceRow[]);
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
        <h1 className="text-[18px] font-semibold text-gray-900">서비스 아이콘</h1>
        <Link
          href="/admin/my/services/create"
          className="rounded-ui-rect bg-signature px-3 py-2 text-[14px] font-medium text-white"
        >
          추가
        </Link>
      </div>
      {loading ? (
        <p className="text-gray-500">불러오는 중…</p>
      ) : error ? (
        <p className="rounded-ui-rect bg-red-50 p-4 text-[14px] text-red-700">{error}</p>
      ) : items.length === 0 ? (
        <p className="rounded-ui-rect bg-white p-4 text-[14px] text-gray-500">
          등록된 서비스가 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.code} className="flex items-center justify-between rounded-ui-rect bg-white p-3">
              <div>
                <span className="font-medium">{s.label}</span>
                <span className="ml-2 text-[13px] text-gray-500">
                  {s.is_active ? "노출" : "숨김"} · {s.sort_order}
                </span>
              </div>
              <Link href={`/admin/my/services/${s.code}/edit`} className="text-[14px] text-signature">
                수정
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
