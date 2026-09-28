"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { IntroV3CampaignRow } from "@/lib/startup/intro-v3/admin-service";

export function AdminIntroV3ListPage() {
  const { safeT } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<IntroV3CampaignRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/intro-v3/campaigns", { credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: IntroV3CampaignRow[] };
    if (!res.ok || !json.ok) {
      setError(
        safeT("admin_intro_load_error", {
          fallbackKo: "인트로 목록을 불러오지 못했습니다.",
          fallbackEn: "Could not load intros.",
        })
      );
      setItems([]);
      return;
    }
    setItems(json.items ?? []);
    setError(null);
  }, [safeT]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDraft() {
    setCreating(true);
    const res = await fetch("/api/admin/intro-v3/campaigns", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "V3 QA draft" }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string };
    setCreating(false);
    if (res.ok && json.ok && json.id) {
      router.push(`/admin/intro-v3/${json.id}`);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        backHref="/admin/intro"
        titleKey="admin_intro_v3_title"
        descriptionKey="admin_intro_v3_list_description"
      />
      <div>
        <button
          type="button"
          className="inline-flex min-h-9 items-center rounded-ui-rect bg-[var(--admin-action-primary-bg,#111827)] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
          onClick={() => void createDraft()}
          disabled={creating}
        >
          {safeT("admin_intro_v3_new", { fallbackKo: "새 V3 초안", fallbackEn: "New V3 draft" })}
        </button>
      </div>
      {error ? <p className="sam-text-body text-red-700">{error}</p> : null}
      {items.length === 0 && !error ? (
        <p className="sam-text-body text-sam-muted">
          {safeT("admin_intro_v3_empty", { fallbackKo: "V3 초안이 없습니다.", fallbackEn: "No V3 drafts yet." })}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <AdminCard key={item.id} title={item.name}>
              <button
                type="button"
                className="inline-flex min-h-9 items-center rounded-ui-rect border border-sam-border px-3 py-1.5 text-[13px] font-semibold text-sam-fg"
                onClick={() => router.push(`/admin/intro-v3/${item.id}`)}
              >
                {safeT("admin_intro_v3_open", { fallbackKo: "열기", fallbackEn: "Open" })}
              </button>
            </AdminCard>
          ))}
        </div>
      )}
    </div>
  );
}
