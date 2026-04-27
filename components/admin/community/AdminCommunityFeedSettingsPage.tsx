"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { CommunityFeedOps } from "@/lib/community-feed/community-ops-settings";

export function AdminCommunityFeedSettingsPage() {
  const { t: tr } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bannedText, setBannedText] = useState("");
  const [ops, setOps] = useState<CommunityFeedOps | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/community/settings", { credentials: "include", cache: "no-store" });
        const j = await res.json();
        if (!cancelled && j.ok && j.settings) {
          const s = j.settings as CommunityFeedOps;
          setOps(s);
          setBannedText(s.banned_words.join("\n"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!ops) return;
    setSaving(true);
    try {
      const banned_words = bannedText
        .split(/\r?\n/)
        .map((l) => l.trim().toLowerCase())
        .filter(Boolean);
      const res = await fetch("/api/admin/community/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...ops,
          banned_words,
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error ?? tr("admin_topics_err_save"));
        return;
      }
      if (j.settings) {
        setOps(j.settings);
        setBannedText((j.settings as CommunityFeedOps).banned_words.join("\n"));
      }
      alert(tr("admin_feed_settings_saved_ok"));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !ops) {
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_feed_settings_page_title" backHref="/admin/philife/sections" />
        <p className="sam-text-body-secondary text-sam-muted">{tr("common_loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_feed_settings_page_title" backHref="/admin/philife/sections" />
      <AdminCard titleKey="admin_feed_settings_card_title">
        <p className="mb-4 sam-text-body-secondary text-sam-muted">{tr("admin_feed_settings_intro")}</p>
        <form onSubmit={onSave} className="max-w-xl space-y-4 sam-text-body-secondary">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-sam-fg">{tr("admin_feed_settings_banned_label")}</span>
            <textarea
              className="min-h-[120px] rounded border border-sam-border px-2 py-2 font-mono sam-text-helper"
              value={bannedText}
              onChange={(e) => setBannedText(e.target.value)}
              placeholder={tr("admin_feed_settings_banned_placeholder")}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{tr("admin_feed_settings_max_title")}</span>
              <input
                type="number"
                className="rounded border border-sam-border px-2 py-1.5"
                min={1}
                max={500}
                value={ops.max_title_length}
                onChange={(e) => setOps({ ...ops, max_title_length: Number(e.target.value) || 1 })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{tr("admin_feed_settings_max_content")}</span>
              <input
                type="number"
                className="rounded border border-sam-border px-2 py-1.5"
                min={100}
                max={100000}
                value={ops.max_content_length}
                onChange={(e) => setOps({ ...ops, max_content_length: Number(e.target.value) || 100 })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{tr("admin_feed_settings_max_comment")}</span>
              <input
                type="number"
                className="rounded border border-sam-border px-2 py-1.5"
                min={50}
                max={20000}
                value={ops.max_comment_length}
                onChange={(e) => setOps({ ...ops, max_comment_length: Number(e.target.value) || 50 })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{tr("admin_feed_settings_max_posts_day")}</span>
              <input
                type="number"
                className="rounded border border-sam-border px-2 py-1.5"
                min={0}
                max={500}
                value={ops.max_posts_per_day}
                onChange={(e) => setOps({ ...ops, max_posts_per_day: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sam-muted">{tr("admin_feed_settings_min_comment_interval")}</span>
              <input
                type="number"
                className="max-w-xs rounded border border-sam-border px-2 py-1.5"
                min={0}
                max={86400}
                value={ops.min_comment_interval_sec}
                onChange={(e) => setOps({ ...ops, min_comment_interval_sec: Number(e.target.value) || 0 })}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-sam-ink px-4 py-2 text-white disabled:opacity-50"
          >
            {saving ? tr("common_saving") : tr("common_save")}
          </button>
        </form>
      </AdminCard>
    </div>
  );
}
