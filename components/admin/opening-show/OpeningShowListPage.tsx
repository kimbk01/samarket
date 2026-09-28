"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OpeningShowListItem } from "@/lib/opening-show/types";

export function OpeningShowListPage() {
  const { safeT } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<OpeningShowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/opening-shows", { credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: OpeningShowListItem[];
    };
    if (!res.ok || !json.ok) {
      setError(
        safeT("admin_opening_load_error", {
          fallbackKo: "인트로 목록을 불러오지 못했습니다.",
          fallbackEn: "Could not load intros.",
        })
      );
      setLoading(false);
      return;
    }
    setItems(json.items ?? []);
    setLoading(false);
  }, [safeT]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError(
        safeT("admin_opening_title_required", {
          fallbackKo: "이름을 입력해 주세요.",
          fallbackEn: "Enter a name.",
        })
      );
      return;
    }
    setCreating(true);
    setError(null);
    const res = await fetch("/api/admin/opening-shows", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string };
    setCreating(false);
    if (!res.ok || !json.ok || !json.id) {
      setError(
        safeT("admin_opening_create_error", {
          fallbackKo: "인트로를 만들지 못했습니다.",
          fallbackEn: "Could not create the intro.",
        })
      );
      return;
    }
    router.push(`/admin/intro/${json.id}`);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6" data-opening-list="1">
      <AdminPageHeader
        titleKey="admin_opening_list_title"
        descriptionKey="admin_opening_list_desc"
      />
      <div className="mb-4 flex justify-end">
        <AdminActionButton variant="primary" onClick={() => setShowForm(true)}>
          {safeT("admin_opening_create", { fallbackKo: "새 인트로", fallbackEn: "New intro" })}
        </AdminActionButton>
      </div>

      {showForm ? (
        <AdminCard className="mb-4">
          <label className="mb-2 block text-sm font-medium text-sam-fg">
            {safeT("admin_opening_title_label", { fallbackKo: "이름", fallbackEn: "Name" })}
          </label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={safeT("admin_opening_title_placeholder", {
              fallbackKo: "인트로 이름",
              fallbackEn: "Intro name",
            })}
            className="mb-3 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg"
          />
          <div className="flex gap-2">
            <AdminActionButton variant="primary" disabled={creating} onClick={() => void onCreate()}>
              {safeT("admin_opening_create_confirm", { fallbackKo: "생성", fallbackEn: "Create" })}
            </AdminActionButton>
            <AdminActionButton
              variant="secondary"
              disabled={creating}
              onClick={() => {
                setShowForm(false);
                setTitle("");
              }}
            >
              {safeT("admin_opening_create_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
            </AdminActionButton>
          </div>
        </AdminCard>
      ) : null}

      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-sam-muted">
          {safeT("admin_opening_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        </p>
      ) : items.length === 0 ? (
        <AdminCard>
          <p className="text-sm text-sam-muted">
            {safeT("admin_opening_empty", {
              fallbackKo: "아직 인트로가 없습니다. 새 인트로로 시작하세요.",
              fallbackEn: "No intros yet. Start with a new intro.",
            })}
          </p>
        </AdminCard>
      ) : (
        <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-sam-surface-muted"
                onClick={() => router.push(`/admin/intro/${item.id}`)}
              >
                <span className="font-medium text-sam-fg">{item.title}</span>
                <span className="flex items-center gap-2 text-xs text-sam-muted">
                  {item.isLive
                    ? safeT("admin_opening_badge_live", {
                        fallbackKo: "앱 적용 중",
                        fallbackEn: "Live",
                      })
                    : item.latestRevisionNumber
                      ? `${safeT("admin_opening_published", {
                          fallbackKo: "게시됨",
                          fallbackEn: "Published",
                        })} v${item.latestRevisionNumber}`
                      : safeT("admin_opening_draft", { fallbackKo: "초안", fallbackEn: "Draft" })}
                  <span>{new Date(item.updatedAt).toLocaleString()}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
