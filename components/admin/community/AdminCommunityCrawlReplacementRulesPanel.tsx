"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert, dibayConfirm } from "@/components/ui/dibay-overlay";

type RuleRow = {
  id: string;
  source_id: string;
  board_id: string | null;
  from_text: string;
  to_text: string;
  apply_title: boolean;
  apply_body: boolean;
  priority: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

const fieldClass =
  "mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg";
const labelClass = "sam-text-helper text-sam-muted";
const btnPrimary =
  "rounded-ui-rect bg-sam-primary px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50";
const btnGhost =
  "rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg disabled:opacity-50";

/**
 * Board/source replacement rule CRUD + preview + explicit reapply.
 * Product copy only — no internal engine terms exposed.
 */
export function AdminCommunityCrawlReplacementRulesPanel(props: {
  sourceId: string;
  boardId: string;
}) {
  const { t } = useI18n();
  const { sourceId, boardId } = props;
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [applyTitle, setApplyTitle] = useState(true);
  const [applyBody, setApplyBody] = useState(true);
  const [priority, setPriority] = useState("100");
  const [enabled, setEnabled] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sampleTitle, setSampleTitle] = useState("");
  const [sampleBody, setSampleBody] = useState("");
  const [preview, setPreview] = useState<{
    beforeTitle: string;
    afterTitle: string;
    beforeBody: string;
    afterBody: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/community/crawl/replacement-rules?sourceId=${encodeURIComponent(sourceId)}&boardId=${encodeURIComponent(boardId)}`
      );
      const j = (await res.json()) as { ok?: boolean; rules?: RuleRow[]; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || "load_failed");
      setRules(j.rules ?? []);
    } catch (e) {
      await dibayAlert({
        title: t("admin_community_crawl_replace_load_failed"),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [boardId, sourceId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setFromText("");
    setToText("");
    setApplyTitle(true);
    setApplyBody(true);
    setPriority("100");
    setEnabled(true);
    setPreview(null);
  }

  function startEdit(rule: RuleRow) {
    setEditingId(rule.id);
    setFromText(rule.from_text);
    setToText(rule.to_text);
    setApplyTitle(rule.apply_title);
    setApplyBody(rule.apply_body);
    setPriority(String(rule.priority));
    setEnabled(rule.enabled);
    setPreview(null);
  }

  async function saveRule() {
    setBusy(true);
    try {
      const payload = {
        source_id: sourceId,
        board_id: boardId,
        from_text: fromText,
        to_text: toText,
        apply_title: applyTitle,
        apply_body: applyBody,
        priority: Number(priority) || 100,
        enabled,
      };
      const res = editingId
        ? await fetch(`/api/admin/community/crawl/replacement-rules/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/community/crawl/replacement-rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || "save_failed");
      resetForm();
      await load();
    } catch (e) {
      await dibayAlert({
        title: t("admin_community_crawl_replace_save_failed"),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeRule(id: string) {
    const ok = await dibayConfirm({
      title: t("admin_community_crawl_replace_delete_title"),
      description: t("admin_community_crawl_replace_delete_body"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/crawl/replacement-rules/${id}`, {
        method: "DELETE",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || "delete_failed");
      if (editingId === id) resetForm();
      await load();
    } catch (e) {
      await dibayAlert({
        title: t("admin_community_crawl_replace_delete_failed"),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/community/crawl/replacement-rules/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_id: sourceId,
          board_id: boardId,
          sample_title: sampleTitle,
          sample_body: sampleBody,
          draft: {
            from_text: fromText,
            to_text: toText,
            apply_title: applyTitle,
            apply_body: applyBody,
            priority: Number(priority) || 100,
            enabled,
          },
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        preview?: {
          beforeTitle: string;
          afterTitle: string;
          beforeBody: string;
          afterBody: string;
        };
        error?: string;
      };
      if (!res.ok || !j.ok || !j.preview) throw new Error(j.error || "preview_failed");
      setPreview(j.preview);
    } catch (e) {
      await dibayAlert({
        title: t("admin_community_crawl_replace_preview_failed"),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function reapply() {
    const ok = await dibayConfirm({
      title: t("admin_community_crawl_replace_reapply_title"),
      description: t("admin_community_crawl_replace_reapply_body"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/community/crawl/replacement-rules/reapply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board_id: boardId }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        scanned?: number;
        updated?: number;
        skipped_manual?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok || !j.ok) throw new Error(j.error || "reapply_failed");
      await dibayAlert({
        title: t("admin_community_crawl_replace_reapply_done"),
        description: t("admin_community_crawl_replace_reapply_result", {
          scanned: String(j.scanned ?? 0),
          updated: String(j.updated ?? 0),
          skipped: String(j.skipped_manual ?? 0),
          failed: String(j.failed ?? 0),
        }),
      });
    } catch (e) {
      await dibayAlert({
        title: t("admin_community_crawl_replace_reapply_failed"),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-sam-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="sam-text-body font-semibold text-sam-fg">
          {t("admin_community_crawl_replace_section")}
        </h3>
        <button type="button" className={btnGhost} disabled={busy} onClick={() => void reapply()}>
          {t("admin_community_crawl_replace_reapply")}
        </button>
      </div>
      <p className="sam-text-helper text-sam-muted">{t("admin_community_crawl_replace_hint")}</p>

      {loading ? (
        <p className="sam-text-helper text-sam-muted">{t("admin_community_crawl_loading")}</p>
      ) : rules.length === 0 ? (
        <p className="sam-text-helper text-sam-muted">{t("admin_community_crawl_replace_empty")}</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((r) => (
            <li
              key={r.id}
              className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p>
                    <span className="font-medium">{r.from_text}</span>
                    <span className="text-sam-muted"> → </span>
                    <span className="font-medium">{r.to_text}</span>
                  </p>
                  <p className="sam-text-helper text-sam-muted">
                    {[
                      r.apply_title ? t("admin_community_crawl_replace_target_title") : null,
                      r.apply_body ? t("admin_community_crawl_replace_target_body") : null,
                      r.enabled
                        ? t("admin_community_crawl_replace_enabled")
                        : t("admin_community_crawl_replace_disabled"),
                      `${t("admin_community_crawl_replace_priority")}: ${r.priority}`,
                      r.board_id
                        ? t("admin_community_crawl_replace_scope_board")
                        : t("admin_community_crawl_replace_scope_source"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={btnGhost} disabled={busy} onClick={() => startEdit(r)}>
                    {t("admin_community_crawl_edit")}
                  </button>
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={busy}
                    onClick={() => void removeRule(r.id)}
                  >
                    {t("admin_community_crawl_delete")}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <p className="sam-text-body font-medium text-sam-fg">
          {editingId
            ? t("admin_community_crawl_replace_edit")
            : t("admin_community_crawl_replace_add")}
        </p>
        <label className="block">
          <span className={labelClass}>{t("admin_community_crawl_replace_from")}</span>
          <input className={fieldClass} value={fromText} onChange={(e) => setFromText(e.target.value)} />
        </label>
        <label className="block">
          <span className={labelClass}>{t("admin_community_crawl_replace_to")}</span>
          <input className={fieldClass} value={toText} onChange={(e) => setToText(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 sam-text-body text-sam-fg">
            <input type="checkbox" checked={applyTitle} onChange={(e) => setApplyTitle(e.target.checked)} />
            {t("admin_community_crawl_replace_apply_title")}
          </label>
          <label className="inline-flex items-center gap-2 sam-text-body text-sam-fg">
            <input type="checkbox" checked={applyBody} onChange={(e) => setApplyBody(e.target.checked)} />
            {t("admin_community_crawl_replace_apply_body")}
          </label>
          <label className="inline-flex items-center gap-2 sam-text-body text-sam-fg">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {t("admin_community_crawl_replace_enabled")}
          </label>
        </div>
        <label className="block">
          <span className={labelClass}>{t("admin_community_crawl_replace_priority")}</span>
          <input
            className={fieldClass}
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t("admin_community_crawl_replace_sample_title")}</span>
          <input
            className={fieldClass}
            value={sampleTitle}
            onChange={(e) => setSampleTitle(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t("admin_community_crawl_replace_sample_body")}</span>
          <textarea
            className={fieldClass}
            rows={3}
            value={sampleBody}
            onChange={(e) => setSampleBody(e.target.value)}
          />
        </label>
        {preview ? (
          <div className="space-y-1 rounded-ui-rect border border-sam-border bg-sam-app p-2 sam-text-helper text-sam-fg">
            <p>
              {t("admin_community_crawl_replace_preview_title")}: {preview.beforeTitle} →{" "}
              {preview.afterTitle}
            </p>
            <p className="whitespace-pre-wrap">
              {t("admin_community_crawl_replace_preview_body")}: {preview.beforeBody} →{" "}
              {preview.afterBody}
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} disabled={busy} onClick={() => void runPreview()}>
            {t("admin_community_crawl_replace_preview")}
          </button>
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => void saveRule()}>
            {t("admin_community_crawl_save")}
          </button>
          {editingId ? (
            <button type="button" className={btnGhost} disabled={busy} onClick={resetForm}>
              {t("admin_community_crawl_cancel")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
