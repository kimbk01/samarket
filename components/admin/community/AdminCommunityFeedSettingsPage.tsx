"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { CommunityFeedOps } from "@/lib/community-feed/community-ops-settings";

export function AdminCommunityFeedSettingsPage() {
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
        alert(j.error ?? "저장 실패");
        return;
      }
      if (j.settings) {
        setOps(j.settings);
        setBannedText((j.settings as CommunityFeedOps).banned_words.join("\n"));
      }
      alert("저장했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !ops) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title="피드 운영 설정" backHref="/admin/community/sections" />
        <p className="text-[13px] text-gray-500">불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader title="피드 운영 설정" backHref="/admin/community/sections" />
      <AdminCard title="동네생활 피드 (admin_settings · community_feed_ops)">
        <p className="mb-4 text-[13px] text-gray-500">
          금칙어·본문 길이·하루 글 수·댓글 도배 간격을 설정합니다. 사용자 글/댓글 API에 반영됩니다.
        </p>
        <form onSubmit={onSave} className="max-w-xl space-y-4 text-[13px]">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-gray-700">금칙어 (한 줄에 하나, 부분 일치)</span>
            <textarea
              className="min-h-[120px] rounded border border-gray-200 px-2 py-2 font-mono text-[12px]"
              value={bannedText}
              onChange={(e) => setBannedText(e.target.value)}
              placeholder="예시단어"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">제목 최대 길이</span>
              <input
                type="number"
                className="rounded border border-gray-200 px-2 py-1.5"
                min={1}
                max={500}
                value={ops.max_title_length}
                onChange={(e) => setOps({ ...ops, max_title_length: Number(e.target.value) || 1 })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">본문 최대 길이</span>
              <input
                type="number"
                className="rounded border border-gray-200 px-2 py-1.5"
                min={100}
                max={100000}
                value={ops.max_content_length}
                onChange={(e) => setOps({ ...ops, max_content_length: Number(e.target.value) || 100 })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">댓글 최대 길이</span>
              <input
                type="number"
                className="rounded border border-gray-200 px-2 py-1.5"
                min={50}
                max={20000}
                value={ops.max_comment_length}
                onChange={(e) => setOps({ ...ops, max_comment_length: Number(e.target.value) || 50 })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">하루 글 개수 상한 (0 = 무제한)</span>
              <input
                type="number"
                className="rounded border border-gray-200 px-2 py-1.5"
                min={0}
                max={500}
                value={ops.max_posts_per_day}
                onChange={(e) => setOps({ ...ops, max_posts_per_day: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-gray-600">댓글 최소 간격(초, 0 = 제한 없음)</span>
              <input
                type="number"
                className="max-w-xs rounded border border-gray-200 px-2 py-1.5"
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
            className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </form>
      </AdminCard>
    </div>
  );
}
