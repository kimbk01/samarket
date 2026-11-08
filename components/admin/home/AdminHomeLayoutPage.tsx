"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  cloneHomeLayout,
  HOME_MENU_CATALOG,
  HOME_PANEL_LABEL_KEYS,
  HOME_SECTION_LABEL_KEYS,
  HOME_SECTIONS_MEMBER_ONLY,
  HOME_SHORTCUTS_MAX_VISIBLE,
  HOME_TILES_MAX_VISIBLE,
  type HomeLayoutConfig,
} from "@/lib/home/home-layout-contract";

type LoadResponse = {
  ok: boolean;
  source?: "db" | "default";
  config?: HomeLayoutConfig;
  revision?: string | null;
  error?: string;
};

type ListName = "sections" | "tiles" | "shortcuts" | "panels";

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  const tmp = next[i]!;
  next[i] = next[j]!;
  next[j] = tmp;
  return next;
}

/** 어드민 「홈 구성」 — 앱 홈의 칸 순서·보이기·메뉴·주제판. 설계안 v11 §7 */
export function AdminHomeLayoutPage() {
  const { language, t: tr } = useI18n();
  const ko = language !== "en";
  const adminAction = useAdminRouteAction("/admin/menus/home-layout");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<HomeLayoutConfig | null>(null);
  const [draft, setDraft] = useState<HomeLayoutConfig | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [source, setSource] = useState<"db" | "default">("default");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/home-layout", { cache: "no-store", credentials: "include" });
      const data = (await res.json()) as LoadResponse;
      if (!res.ok || !data.ok || !data.config) throw new Error(data.error ?? `http_${res.status}`);
      setSaved(cloneHomeLayout(data.config));
      setDraft(cloneHomeLayout(data.config));
      setRevision(data.revision ?? null);
      setSource(data.source ?? "default");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);
  const visibleTiles = draft?.tiles.filter((t) => t.visible).length ?? 0;
  const visibleShortcuts = draft?.shortcuts.filter((t) => t.visible).length ?? 0;

  const patchList = (name: ListName, next: unknown[]) =>
    setDraft((d) => (d ? ({ ...d, [name]: next } as HomeLayoutConfig) : d));

  const save = async () => {
    if (!draft) return;
    const ok = await confirmAdminAction({
      level: adminActionLevel("runtimeSettingChange"),
      ko,
      title: tr("admin_home_layout_confirm_title"),
      description: tr("admin_home_layout_confirm_body"),
      confirmLabel: tr("admin_home_layout_save"),
    });
    if (!ok.ok) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/home-layout", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: draft, expectedRevision: revision }),
      });
      const data = (await res.json()) as LoadResponse;
      if (res.status === 409) {
        setMessage({
          type: "err",
          text: tr("admin_home_layout_conflict"),
        });
        return;
      }
      if (!res.ok || !data.ok || !data.config) throw new Error(data.error ?? `http_${res.status}`);
      setSaved(cloneHomeLayout(data.config));
      setDraft(cloneHomeLayout(data.config));
      setRevision(data.revision ?? null);
      setSource("db");
      setMessage({ type: "ok", text: tr("admin_home_layout_saved") });
    } catch (e) {
      setMessage({ type: "err", text: tr("admin_home_layout_save_failed", { reason: e instanceof Error ? e.message : "" }) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AdminLoadingState ko={ko} label={tr("admin_home_layout_loading")} />;
  if (loadError || !draft) {
    return <AdminErrorState ko={ko} code={loadError ?? "load_failed"} onRetry={() => void load()} />;
  }

  const rowCls = "flex flex-wrap items-center gap-3 border-t border-sam-border px-4 py-2.5 first:border-t-0";
  const arrows = (name: ListName, list: unknown[], i: number) => (
    <span className="ml-auto flex gap-1">
      <AdminActionButton size="sm" disabled={i === 0} onClick={() => patchList(name, move(list, i, -1))} aria-label={tr("admin_home_layout_up")}>
        ↑
      </AdminActionButton>
      <AdminActionButton
        size="sm"
        disabled={i === list.length - 1}
        onClick={() => patchList(name, move(list, i, 1))}
        aria-label={tr("admin_home_layout_down")}
      >
        ↓
      </AdminActionButton>
    </span>
  );
  const check = (checked: boolean, onChange: (v: boolean) => void, label: string, disabled = false) => (
    <label className="flex items-center gap-1.5 sam-text-body-secondary text-sam-muted">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
  let bigCount = 0;

  return (
    <div className="space-y-4" data-admin-home-layout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader
          titleKey="admin_menu_home_layout"
          description={tr("admin_home_layout_desc")}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sam-surface-muted px-2.5 py-1 sam-text-helper text-sam-muted">
            {source === "db" ? tr("admin_home_layout_saved_badge") : tr("admin_home_layout_default_badge")}
          </span>
          {dirty ? (
            <span className="rounded-full bg-sam-warning-soft px-2.5 py-1 sam-text-helper text-sam-warning">
              {tr("admin_home_layout_dirty")}
            </span>
          ) : null}
          <AdminActionButton
            variant="primary"
            disabled={!dirty || saving || !adminAction.allowed}
            title={adminAction.reason ?? undefined}
            onClick={() => void save()}
          >
            {saving ? tr("admin_home_layout_saving") : tr("admin_home_layout_save")}
          </AdminActionButton>
          {dirty ? (
            <AdminActionButton disabled={saving} onClick={() => setDraft(saved ? cloneHomeLayout(saved) : draft)}>
              {tr("admin_home_layout_revert")}
            </AdminActionButton>
          ) : null}
        </div>
      </div>

      {message ? (
        <div
          className={`rounded-ui-rect px-4 py-2 sam-text-body ${
            message.type === "ok" ? "bg-sam-success-soft text-sam-success" : "bg-sam-danger-soft text-sam-danger"
          }`}
        >
          {message.text}
        </div>
      ) : null}
      {!adminAction.allowed && adminAction.reason ? (
        <p className="sam-text-body-secondary text-sam-muted">{adminAction.reason}</p>
      ) : null}

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
        <h2 className="px-4 pt-3 pb-1 sam-text-section-title font-semibold">{tr("admin_home_layout_sections")}</h2>
        {draft.sections.map((s, i) => (
          <div key={s.key} className={rowCls}>
            <span className="min-w-[180px] sam-text-body">{tr(HOME_SECTION_LABEL_KEYS[s.key])}</span>
            {check(s.visible, (v) => patchList("sections", draft.sections.map((x) => (x.key === s.key ? { ...x, visible: v } : x))), tr("admin_home_layout_visible"))}
            {check(
              s.guestVisible,
              (v) => patchList("sections", draft.sections.map((x) => (x.key === s.key ? { ...x, guestVisible: v } : x))),
              tr("admin_home_layout_guest_visible"),
              HOME_SECTIONS_MEMBER_ONLY.has(s.key)
            )}
            {arrows("sections", draft.sections, i)}
          </div>
        ))}
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
        <h2 className="px-4 pt-3 pb-1 sam-text-section-title font-semibold">
          {tr("admin_home_layout_tiles", { max: HOME_TILES_MAX_VISIBLE })}
        </h2>
        {draft.tiles.map((t, i) => {
          const tag = t.visible ? (bigCount++ < 2 ? tr("admin_home_layout_large") : tr("admin_home_layout_small")) : null;
          return (
            <div key={t.key} className={rowCls}>
              <span className="min-w-[180px] sam-text-body">
                {tr(HOME_MENU_CATALOG[t.key].labelKey)}
                {tag ? <span className="ml-2 sam-text-helper text-sam-muted">{tag}</span> : null}
              </span>
              <span className="sam-text-helper text-sam-muted">{HOME_MENU_CATALOG[t.key].href}</span>
              {check(
                t.visible,
                (v) => patchList("tiles", draft.tiles.map((x) => (x.key === t.key ? { ...x, visible: v } : x))),
                tr("admin_home_layout_visible"),
                !t.visible && visibleTiles >= HOME_TILES_MAX_VISIBLE
              )}
              {arrows("tiles", draft.tiles, i)}
            </div>
          );
        })}
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
        <h2 className="px-4 pt-3 pb-1 sam-text-section-title font-semibold">
          {tr("admin_home_layout_shortcuts", { max: HOME_SHORTCUTS_MAX_VISIBLE })}
        </h2>
        {draft.shortcuts.map((t, i) => (
          <div key={t.key} className={rowCls}>
            <span className="min-w-[180px] sam-text-body">{tr(HOME_MENU_CATALOG[t.key].labelKey)}</span>
            <span className="sam-text-helper text-sam-muted">{HOME_MENU_CATALOG[t.key].href}</span>
            {check(
              t.visible,
              (v) => patchList("shortcuts", draft.shortcuts.map((x) => (x.key === t.key ? { ...x, visible: v } : x))),
              tr("admin_home_layout_visible"),
              !t.visible && visibleShortcuts >= HOME_SHORTCUTS_MAX_VISIBLE
            )}
            {arrows("shortcuts", draft.shortcuts, i)}
          </div>
        ))}
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
        <h2 className="px-4 pt-3 pb-1 sam-text-section-title font-semibold">{tr("admin_home_layout_panels")}</h2>
        {draft.panels.map((p, i) => (
          <div key={p.key} className={rowCls}>
            <span className="min-w-[180px] sam-text-body">{tr(HOME_PANEL_LABEL_KEYS[p.key])}</span>
            {check(p.visible, (v) => patchList("panels", draft.panels.map((x) => (x.key === p.key ? { ...x, visible: v } : x))), tr("admin_home_layout_visible"))}
            {arrows("panels", draft.panels, i)}
          </div>
        ))}
      </section>
    </div>
  );
}
