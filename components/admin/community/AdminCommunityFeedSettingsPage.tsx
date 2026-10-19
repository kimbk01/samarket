"use client";

/**
 * 커뮤니티 운영 설정 (설계 §C-22). 불러오기 실패 = 오류 상태(무한 로딩 없음) · 바뀐 항목만 보내 현재값과 병합(C-29) ·
 * 「설정 저장」 L1 (변경 항목 요약) · expectedUpdatedAt CAS (409 → 최신값 다시 불러오기) · 결과 배너(alert 없음).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminErrorState, AdminLoadingState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import type { CommunityFeedOps } from "@/lib/community-feed/community-ops-settings";

type Banner = { ok: true; message: string } | { ok: false; code: string } | null;
type NumKey = Exclude<keyof CommunityFeedOps, "banned_words">;

const FIELD_LABEL: Record<keyof CommunityFeedOps, string> = {
  banned_words: "금지어",
  max_title_length: "제목 최대 글자 수",
  max_content_length: "본문 최대 글자 수",
  max_comment_length: "댓글 최대 글자 수",
  max_posts_per_day: "하루 최대 글 수",
  min_comment_interval_sec: "댓글 최소 간격(초)",
};

const STALE = "다른 관리자가 먼저 변경했습니다 — 최신 내용으로 다시 불러왔습니다";

function parseWords(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
}

function settingsErrorText(code: string): string {
  if (code === "no_fields") return "바뀐 항목이 없습니다.";
  if (code === "admin_settings_table_missing") return "설정 저장소를 쓸 수 없습니다. 시스템 관리자에게 문의하세요.";
  if (code === "forbidden" || code === "forbidden_permission") return "이 작업을 할 권한이 없습니다.";
  if (code === "network_error") return "네트워크 오류가 발생했습니다. 다시 시도해 주세요.";
  return "저장하지 못했습니다. 입력값은 그대로 두었으니 다시 저장해 주세요.";
}

export function AdminCommunityFeedSettingsPage() {
  const { t: tr, language } = useI18n();
  const ko = language !== "en";
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<CommunityFeedOps | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [ops, setOps] = useState<CommunityFeedOps | null>(null);
  const [bannedText, setBannedText] = useState("");
  const [banner, setBanner] = useState<Banner>(null);

  const apply = useCallback((s: CommunityFeedOps, at: string | null) => {
    setSaved(s);
    setOps(s);
    setBannedText(s.banned_words.join("\n"));
    setUpdatedAt(at);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch("/api/admin/community/settings", { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; settings?: CommunityFeedOps; updatedAt?: string | null; error?: string };
      if (!res.ok || !j.ok || !j.settings) {
        setLoadErr({ code: j.error ?? "load_failed", status: res.status });
      } else {
        apply(j.settings, j.updatedAt ?? null);
      }
    } catch {
      setLoadErr({ code: "network_error", status: 0 });
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = useMemo(() => {
    if (!ops || !saved) return [] as (keyof CommunityFeedOps)[];
    const out: (keyof CommunityFeedOps)[] = [];
    if (JSON.stringify(parseWords(bannedText)) !== JSON.stringify(saved.banned_words)) out.push("banned_words");
    for (const k of Object.keys(FIELD_LABEL) as (keyof CommunityFeedOps)[]) {
      if (k !== "banned_words" && ops[k] !== saved[k]) out.push(k);
    }
    return out;
  }, [ops, saved, bannedText]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!ops || !saved || changed.length === 0) return;
    const words = parseWords(bannedText);
    const summary = changed
      .map((k) =>
        k === "banned_words"
          ? `금지어 ${saved.banned_words.length}개 → ${words.length}개`
          : `${FIELD_LABEL[k]}: ${saved[k as NumKey].toLocaleString()} → ${ops[k as NumKey].toLocaleString()}`
      )
      .join("\n");
    const confirmed = await confirmAdminAction({
      level: "L1",
      ko: true,
      title: "운영 설정 저장",
      description: `바뀌는 항목\n${summary}`,
      confirmLabel: "설정 저장",
    });
    if (!confirmed.ok) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { expectedUpdatedAt: updatedAt };
      for (const k of changed) patch[k] = k === "banned_words" ? words : ops[k];
      const res = await fetch("/api/admin/community/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        settings?: CommunityFeedOps;
        updatedAt?: string | null;
      };
      if (res.status === 409 && j.settings) {
        apply(j.settings, j.updatedAt ?? null);
        setBanner({ ok: false, code: STALE });
        return;
      }
      if (!res.ok || !j.ok) {
        setBanner({ ok: false, code: settingsErrorText(j.error ?? "") });
        return;
      }
      if (j.settings) apply(j.settings, j.updatedAt ?? null);
      setBanner({ ok: true, message: `설정 ${changed.length}개 항목을 저장했습니다.` });
    } catch {
      setBanner({ ok: false, code: settingsErrorText("network_error") });
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <header>
      <Link href="/admin/community" className="text-[13px] font-medium text-sam-muted hover:underline">
        ← 커뮤니티
      </Link>
      <h1 className="sam-text-page-title mt-1 font-semibold text-sam-fg">{tr("admin_feed_settings_page_title")}</h1>
      <p className="mt-1 sam-text-body text-sam-muted">금지어와 글·댓글 작성 제한을 정합니다.</p>
    </header>
  );

  if (loading) {
    return (
      <div className="space-y-4" data-aro-ops-ux-001-w3="1" data-admin-mgmt-proof="community-settings">
        {header}
        <div data-admin-mgmt-state="LOADING">
          <AdminLoadingState ko={ko} />
        </div>
      </div>
    );
  }
  if (loadErr || !ops) {
    return (
      <div className="space-y-4" data-aro-ops-ux-001-w3="1" data-admin-mgmt-proof="community-settings">
        {header}
        <div data-admin-mgmt-state="ERROR">
          <AdminErrorState ko={ko} code={loadErr?.code ?? "load_failed"} httpStatus={loadErr?.status} onRetry={() => void load()} />
        </div>
      </div>
    );
  }

  const num = (k: NumKey, min: number, max: number, fallback: number) => (
    <label className="flex flex-col gap-1">
      <span className="text-sam-muted">{FIELD_LABEL[k]}</span>
      <input
        type="number"
        className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg"
        min={min}
        max={max}
        value={ops[k]}
        onChange={(e) => setOps({ ...ops, [k]: Number(e.target.value) || fallback })}
      />
    </label>
  );

  return (
    <div className="space-y-4" data-aro-ops-ux-001-w3="1" data-admin-mgmt-proof="community-settings">
      {header}
      <AdminResultBanner ko={ko} result={banner} onClose={() => setBanner(null)} />
      <form onSubmit={onSave} className="space-y-4">
        <AdminCard titleKey="admin_community_feed_settings_section_content">
          <div className="max-w-xl space-y-4 text-[13px]">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-sam-fg">{tr("admin_feed_settings_banned_label")}</span>
              <textarea
                className="min-h-[120px] rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-2 text-sam-fg"
                value={bannedText}
                onChange={(e) => setBannedText(e.target.value)}
                placeholder={tr("admin_feed_settings_banned_placeholder")}
              />
              <span className="sam-text-xxs text-sam-muted">한 줄에 한 단어 · 현재 {parseWords(bannedText).length}개</span>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {num("max_title_length", 1, 500, 1)}
              {num("max_content_length", 100, 100000, 100)}
              {num("max_comment_length", 50, 20000, 50)}
            </div>
          </div>
        </AdminCard>

        <AdminCard titleKey="admin_community_feed_settings_section_write">
          <div className="max-w-xl space-y-2 text-[13px]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {num("max_posts_per_day", 0, 500, 0)}
              {num("min_comment_interval_sec", 0, 86400, 0)}
            </div>
            <p className="sam-text-xxs text-sam-muted">0 이면 제한 없음</p>
          </div>
        </AdminCard>

        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t border-sam-border bg-sam-surface py-2">
          <AdminActionButton
            variant="neutral"
            disabled={saving || changed.length === 0}
            onClick={() => saved && apply(saved, updatedAt)}
          >
            취소
          </AdminActionButton>
          <span className="text-[12px] text-sam-muted">
            {changed.length > 0 ? `바뀐 항목 ${changed.length}개: ${changed.map((k) => FIELD_LABEL[k]).join(", ")}` : "변경 없음"}
          </span>
          <AdminActionButton type="submit" variant="primary" disabled={saving || changed.length === 0}>
            {saving ? "처리 중" : "설정 저장"}
          </AdminActionButton>
        </div>
      </form>
    </div>
  );
}
