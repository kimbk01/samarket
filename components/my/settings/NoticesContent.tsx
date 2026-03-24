"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/** app_notices 목록. Supabase 미연동 시 빈 목록 또는 fallback */
export function NoticesContent() {
  const [notices, setNotices] = useState<{ id: string; title: string; body: string }[]>([]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (supabase) {
      // TODO: supabase.from('app_notices').select('id,title,body').eq('is_active', true).order('created_at', { ascending: false })
    }
    setNotices([]);
  }, []);

  if (notices.length === 0) {
    return (
      <div className="py-12 text-center text-[14px] text-gray-500">
        공지사항이 없습니다.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100">
      {notices.map((n) => (
        <li key={n.id} className="py-3">
          <p className="font-medium text-gray-900">{n.title}</p>
          <p className="mt-1 text-[13px] text-gray-600">{n.body}</p>
        </li>
      ))}
    </ul>
  );
}
