"use client";

import { useCallback, useEffect, useState } from "react";

type ListType = "favorite" | "hidden" | "blocked";

interface UserListContentProps {
  type: ListType;
  emptyMessage: string;
}

type UserRelationItem = {
  id: string;
  targetId: string;
  nickname: string | null;
  avatarUrl: string | null;
  regionName: string | null;
  createdAt: string;
};

function formatDate(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return value.toLocaleDateString("ko-KR");
}

export function UserListContent({ type, emptyMessage }: UserListContentProps) {
  const [items, setItems] = useState<UserRelationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/relations/${type}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: UserRelationItem[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setItems([]);
        setError(typeof json.error === "string" ? json.error : "목록을 불러오지 못했습니다.");
        return;
      }
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch {
      setItems([]);
      setError("목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/me/relations/${type}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(typeof json.error === "string" ? json.error : "삭제하지 못했습니다.");
        return;
      }
      setItems((current) => current.filter((item) => item.id !== id));
    } catch {
      setError("삭제하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-[14px] text-sam-muted">불러오는 중입니다.</div>;
  }

  if (error) {
    return <div className="py-12 text-center text-[14px] text-red-600">{error}</div>;
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-[14px] text-sam-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-sam-border-soft">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between py-3">
          <div className="min-w-0 pr-3">
            <p className="truncate text-[15px] font-medium text-sam-fg">
              {item.nickname?.trim() || item.targetId}
            </p>
            <p className="mt-1 text-[12px] text-sam-muted">
              {[item.regionName, formatDate(item.createdAt)].filter(Boolean).join(" · ") || item.targetId}
            </p>
          </div>
          <button
            type="button"
            disabled={busyId === item.id}
            className="text-[13px] text-red-600"
            onClick={() => void handleDelete(item.id)}
          >
            {busyId === item.id ? "삭제 중" : "삭제"}
          </button>
        </li>
      ))}
    </ul>
  );
}
