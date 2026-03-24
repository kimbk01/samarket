"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";

type ListType = "favorite" | "hidden" | "blocked";

interface UserListContentProps {
  type: ListType;
  emptyMessage: string;
}

const TABLE_COL: Record<ListType, { table: string; col: string }> = {
  favorite: { table: "user_favorites", col: "favorite_user_id" },
  hidden: { table: "user_hides", col: "hidden_user_id" },
  blocked: { table: "user_blocks", col: "blocked_user_id" },
};

/** user_favorites / user_hides / user_blocks 목록. Supabase 미연동 시 빈 상태 */
export function UserListContent({ type, emptyMessage }: UserListContentProps) {
  const [items, setItems] = useState<{ id: string; target_id: string }[]>([]);
  const userId = getCurrentUser()?.id;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) {
      setItems([]);
      return;
    }
    const { table, col } = TABLE_COL[type];
    // TODO: supabase.from(table).select('id,' + col).eq('user_id', userId).then(({ data }) => setItems((data ?? []).map(r => ({ id: r.id, target_id: r[col] }))))
    setItems([]);
  }, [type, userId]);

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-[14px] text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between py-3">
          <span className="text-[15px] text-gray-900">{item.target_id}</span>
          <button
            type="button"
            className="text-[13px] text-red-600"
            onClick={() => {
              // TODO: delete from supabase
            }}
          >
            삭제
          </button>
        </li>
      ))}
    </ul>
  );
}
