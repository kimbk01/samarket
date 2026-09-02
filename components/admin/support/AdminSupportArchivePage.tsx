"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type ArchiveTab = "notes" | "platform";

type NoteThread = {
  id: string;
  subject: string;
  status: string;
  last_message_at: string;
  started_by?: string;
};

type PlatformRow = {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  store_id?: string | null;
};

/**
 * A2-2 legacy Care + platform inbox — read-only archive (no reply/compose).
 */
export function AdminSupportArchivePage() {
  const { safeT, language } = useI18n();
  const [tab, setTab] = useState<ArchiveTab>("notes");
  const [notes, setNotes] = useState<NoteThread[]>([]);
  const [platform, setPlatform] = useState<PlatformRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const locale = language === "ko" ? "ko-KR" : "en-US";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [notesRes, platRes] = await Promise.all([
        fetch("/api/admin/member-notes", { credentials: "include", cache: "no-store" }),
        fetch("/api/admin/platform-inquiries", { credentials: "include", cache: "no-store" }),
      ]);
      const notesJson = (await notesRes.json().catch(() => ({}))) as {
        ok?: boolean;
        threads?: NoteThread[];
        error?: string;
      };
      const platJson = (await platRes.json().catch(() => ({}))) as {
        ok?: boolean;
        rows?: PlatformRow[];
        inquiries?: PlatformRow[];
        error?: string;
      };
      if (!notesRes.ok || !notesJson.ok) {
        setError(notesJson.error ?? "notes_load_failed");
      } else {
        setNotes(Array.isArray(notesJson.threads) ? notesJson.threads : []);
      }
      if (platRes.ok && platJson.ok) {
        const rows = platJson.rows ?? platJson.inquiries ?? [];
        setPlatform(Array.isArray(rows) ? rows : []);
      }
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" data-admin-support-archive="1">
      <AdminPageHeader
        title={safeT("admin_menu_cp_support_archive", {
          fallbackKo: "이전 문의 기록",
          fallbackEn: "Previous inquiry archive",
        })}
        description={safeT("admin_support_archive_desc", {
          fallbackKo: "레거시 쪽지·1:1·플랫폼 문의 보관. 읽기 전용입니다.",
          fallbackEn: "Legacy notes and platform inquiries. Read-only archive.",
        })}
      />
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {safeT("admin_support_archive_readonly_hint", {
          fallbackKo: "신규 문의는 「고객센터」에서 처리합니다. 여기에서는 답변·작성할 수 없습니다.",
          fallbackEn: "New support is handled in Support Center. This archive cannot reply or compose.",
        })}
      </p>
      <div className="flex gap-2">
        {(
          [
            { id: "notes" as const, ko: "쪽지·1:1", en: "Notes / 1:1" },
            { id: "platform" as const, ko: "플랫폼 문의", en: "Platform inquiries" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              tab === t.id
                ? "bg-sam-primary text-white"
                : "border border-sam-border bg-sam-surface text-sam-fg"
            }`}
          >
            {language === "en" ? t.en : t.ko}
          </button>
        ))}
        <Link href="/admin/support" className="ml-auto text-sm text-sam-primary underline">
          {safeT("admin_support_title", { fallbackKo: "고객센터", fallbackEn: "Support Center" })}
        </Link>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : tab === "notes" ? (
        <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          {notes.length === 0 ? (
            <li className="p-4 text-sm text-sam-muted">—</li>
          ) : (
            notes.map((n) => (
              <li key={n.id} className="px-3 py-3">
                <p className="text-sm font-medium">{n.subject}</p>
                <p className="text-xs text-sam-muted">
                  {n.started_by ?? "—"} · {n.status} ·{" "}
                  {n.last_message_at ? new Date(n.last_message_at).toLocaleString(locale) : ""}
                </p>
              </li>
            ))
          )}
        </ul>
      ) : (
        <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          {platform.length === 0 ? (
            <li className="p-4 text-sm text-sam-muted">—</li>
          ) : (
            platform.map((r) => (
              <li key={r.id} className="px-3 py-3">
                <p className="text-sm font-medium">{r.subject}</p>
                <p className="text-xs text-sam-muted">
                  {r.status}
                  {r.store_id ? ` · Store ${r.store_id.slice(0, 8)}…` : ""} ·{" "}
                  {r.created_at ? new Date(r.created_at).toLocaleString(locale) : ""}
                </p>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
