"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { call, type ImportRule, type ManagedSource, importErrorText } from "./api";

const EMPTY = { scope: "global" as ImportRule["scope"], sourceSite: "", sourceBoard: "", findText: "", replaceText: "", isRegex: false, note: "" };

export function ImportRulesPanel({ sources }: { sources: ManagedSource[] }) {
  const { t } = useI18n();
  const [rules, setRules] = useState<ImportRule[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setRules((await call<{ rules: ImportRule[] }>("/rules")).rules);
    } catch (e) {
      setMsg({ tone: "err", text: importErrorText(e) });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const boards = sources.find((s) => s.id === form.sourceSite)?.boards ?? [];

  const save = async () => {
    setMsg(null);
    try {
      await call("/rules", {
        body: {
          action: "save",
          rule: {
            scope: form.scope,
            sourceSite: form.scope === "global" ? null : form.sourceSite || null,
            sourceBoard: form.scope === "board" ? form.sourceBoard || null : null,
            findText: form.findText,
            replaceText: form.replaceText,
            isRegex: form.isRegex,
            note: form.note || null,
          },
        },
      });
      setForm(EMPTY);
      setMsg({ tone: "ok", text: "규칙을 저장했습니다. 이후 미리보기·게시·업데이트에 적용됩니다." });
      await load();
    } catch (e) {
      setMsg({ tone: "err", text: importErrorText(e) });
    }
  };

  const toggle = async (r: ImportRule) => {
    const ok = await confirmAdminAction({
      level: adminActionLevel(r.enabled ? "disable" : "resume"),
      ko: true,
      title: r.enabled ? "규칙 끄기" : "규칙 켜기",
      description: r.enabled ? "이후 게시·업데이트에 이 규칙을 적용하지 않습니다." : "이후 게시·업데이트에 이 규칙을 적용합니다.",
      confirmLabel: r.enabled ? "끄기" : "켜기",
    });
    if (!ok.ok) return;
    try {
      setRules((await call<{ rules: ImportRule[] }>("/rules", { body: { action: "toggle", id: r.id, enabled: !r.enabled } })).rules);
    } catch (e) {
      setMsg({ tone: "err", text: importErrorText(e) });
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4 space-y-2">
        <h2 className="text-sm font-semibold">{t("admin_community_import_tab_rules")}</h2>
        <p className="text-xs text-sam-muted">{t("admin_community_import_rules_desc")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-sm" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as ImportRule["scope"] })}>
            <option value="global">{t("admin_community_import_rules_scope_global")}</option>
            <option value="source">{t("admin_community_import_rules_scope_source")}</option>
            <option value="board">{t("admin_community_import_rules_scope_board")}</option>
          </select>
          <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-sm" disabled={form.scope === "global"} value={form.sourceSite} onChange={(e) => setForm({ ...form, sourceSite: e.target.value, sourceBoard: "" })}>
            <option value="">{t("admin_community_import_rules_select_source")}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
          <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-sm" disabled={form.scope !== "board"} value={form.sourceBoard} onChange={(e) => setForm({ ...form, sourceBoard: e.target.value })}>
            <option value="">{t("admin_community_import_rules_select_board")}</option>
            {boards.map((b) => (
              <option key={b.boardId} value={b.boardId}>
                {b.displayName}
              </option>
            ))}
          </select>
          <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-sm" placeholder={t("admin_community_import_rules_find")} value={form.findText} onChange={(e) => setForm({ ...form, findText: e.target.value })} />
          <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-sm" placeholder={t("admin_community_import_rules_replace")} value={form.replaceText} onChange={(e) => setForm({ ...form, replaceText: e.target.value })} />
          <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-sm" placeholder={t("admin_community_import_rules_note")} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-sam-muted">
            <input type="checkbox" checked={form.isRegex} onChange={(e) => setForm({ ...form, isRegex: e.target.checked })} /> {t("admin_community_import_rules_regex")}
          </label>
          <AdminActionButton variant="primary" className="ml-auto" disabled={!form.findText} onClick={() => void save()}>
            {t("admin_community_import_rules_add")}
          </AdminActionButton>
        </div>
        {msg ? <p className={`text-xs break-words ${msg.tone === "err" ? "text-sam-danger" : "text-sam-success"}`}>{msg.text}</p> : null}
      </section>
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
        {rules.length === 0 ? <p className="p-3 text-xs text-sam-muted">{t("admin_community_import_rules_empty")}</p> : null}
        <ul>
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-2 border-b border-sam-border text-xs">
              <span className="rounded-full border border-sam-border px-1.5 text-[12px]">
                {r.scope === "global" ? "전체" : r.scope === "source" ? r.sourceSite : `${r.sourceSite}/${r.sourceBoard}`}
              </span>
              <code className="break-all">{r.findText}</code>
              <span className="text-sam-muted">→</span>
              <code className="break-all">{r.replaceText || "(삭제)"}</code>
              {r.isRegex ? <span className="text-[12px] text-sam-muted">regex</span> : null}
              <AdminActionButton variant="neutral" className="ml-auto" onClick={() => void toggle(r)}>
                {r.enabled ? "사용 중" : "꺼짐"}
              </AdminActionButton>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
