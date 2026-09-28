"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type IntroShowListItem = {
  id: string;
  title: string;
  updatedAt: string;
  isLive: boolean;
  hasPublishedRevision: boolean;
};

export function IntroShowListPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<IntroShowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/intro-shows", { credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: IntroShowListItem[];
    };
    if (!res.ok || !json.ok) {
      setError(t("admin_intro_show_loading"));
      setItems([]);
      setLoading(false);
      return;
    }
    setItems(json.items ?? []);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    const res = await fetch("/api/admin/intro-shows", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t("admin_intro_show_untitled") }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string };
    setCreating(false);
    if (!res.ok || !json.ok || !json.id) return;
    router.push(`/admin/intro/${json.id}`);
  };

  return (
    <div>
      <AdminPageHeader
        titleKey="admin_intro_show_title"
        descriptionKey="admin_intro_show_list_desc"
      />
      <div className="mb-4">
        <AdminActionButton variant="primary" onClick={() => void create()} disabled={creating}>
          {t("admin_intro_show_create")}
        </AdminActionButton>
      </div>
      {loading ? (
        <p className="text-sm text-sam-muted">{t("admin_intro_show_loading")}</p>
      ) : error ? (
        <p className="text-sm text-sam-muted">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-sam-muted">{t("admin_intro_show_empty")}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <AdminCard key={item.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => router.push(`/admin/intro/${item.id}`)}
              >
                <span className="font-semibold text-sam-fg">{item.title}</span>
                <AdminToneBadge tone={item.isLive ? "success" : "neutral"}>
                  {item.isLive ? t("admin_intro_show_live") : t("admin_intro_show_draft")}
                </AdminToneBadge>
              </button>
            </AdminCard>
          ))}
        </div>
      )}
    </div>
  );
}
