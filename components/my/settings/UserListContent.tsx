"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type ListType = "favorite" | "hidden" | "blocked";

interface UserListContentProps {
  type: ListType;
  emptyMessage: string;
}

type UserRelationItem = {
  id: string;
  targetId: string;
  nickname: string | null;
  username?: string | null;
  avatarUrl: string | null;
  regionName: string | null;
  createdAt: string;
};

export function UserListContent({ type, emptyMessage }: UserListContentProps) {
  const { t, language } = useI18n();
  const [items, setItems] = useState<UserRelationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const formatDate = (iso: string): string => {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "";
    return value.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US");
  };

  const load = useCallback(async () => {
    setLoading((prev) => (prev ? prev : true));
    setError((prev) => (prev === null ? prev : null));
    try {
      const res = await runSingleFlight(`me:relations:${type}:list`, () =>
        fetch(`/api/me/relations/${type}`, {
          credentials: "include",
          cache: "no-store",
        })
      );
      const json = (await res.clone().json().catch(() => ({}))) as {
        ok?: boolean;
        items?: UserRelationItem[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setItems((prev) => (prev.length === 0 ? prev : []));
        setError(typeof json.error === "string" ? json.error : t("settings_user_list_load_failed"));
        return;
      }
      const nextItems = Array.isArray(json.items) ? json.items : [];
      setItems((prev) => {
        if (
          prev.length === nextItems.length &&
          prev.every(
            (item, idx) =>
              item.id === nextItems[idx]?.id &&
              item.targetId === nextItems[idx]?.targetId &&
              item.createdAt === nextItems[idx]?.createdAt
          )
        ) {
          return prev;
        }
        return nextItems;
      });
    } catch {
      setItems((prev) => (prev.length === 0 ? prev : []));
      setError(t("settings_user_list_load_failed"));
    } finally {
      setLoading((prev) => (prev ? false : prev));
    }
  }, [type, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: string) => {
    setBusyId(id);
    setError((prev) => (prev === null ? prev : null));
    try {
      const res = await fetch(`/api/me/relations/${type}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(typeof json.error === "string" ? json.error : t("settings_user_list_delete_failed"));
        return;
      }
      setItems((current) => current.filter((item) => item.id !== id));
    } catch {
      setError(t("settings_user_list_delete_failed"));
    } finally {
      setBusyId((prev) => (prev === null ? prev : null));
    }
  };

  if (loading) {
    return <div className="py-12 text-center sam-text-body text-sam-muted">{t("settings_user_list_loading")}</div>;
  }

  if (error) {
    return <div className="py-12 text-center sam-text-body text-red-600">{error}</div>;
  }

  if (items.length === 0) {
    return <div className="py-12 text-center sam-text-body text-sam-muted">{emptyMessage}</div>;
  }

  return (
    <ul className="divide-y divide-sam-border-soft">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between py-3">
          <div className="min-w-0 pr-3">
            <p className="truncate sam-text-body font-medium text-sam-fg">
              {item.nickname?.trim() || item.targetId}
            </p>
            {item.username ? (
              <p className="mt-0.5 truncate font-mono sam-text-xxs text-sam-muted tabular-nums">
                @{item.username}
              </p>
            ) : null}
            <p className="mt-1 sam-text-helper text-sam-muted">
              {[item.regionName, formatDate(item.createdAt)].filter(Boolean).join(" · ") || item.targetId}
            </p>
          </div>
          <button
            type="button"
            disabled={busyId === item.id}
            className="sam-text-body-secondary text-red-600"
            onClick={() => void handleDelete(item.id)}
          >
            {busyId === item.id ? t("settings_user_list_deleting") : t("common_delete")}
          </button>
        </li>
      ))}
    </ul>
  );
}
