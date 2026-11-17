"use client";

/**
 * 진입 감사 5단계 IN-3·IN-8·OS-3 (2026-11-17 · Owner 「설계안대로 진행」) — 인트로 소재 묶음 어드민.
 * 소재마다 그림(투명 PNG 가능)·배경색·표시 시간(1~5초)·목적지·「광고」 표기·기간·순서 · 진입마다 다음 소재.
 * 전체 설정: 켜기 · OS 종료 후 실행에도 보이기. 저장은 읽은 판 기준(다른 관리자 저장이면 409 → 다시 불러옴).
 */

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import {
  LAUNCH_INTRO_POOL_DURATION_DEFAULT_MS,
  LAUNCH_INTRO_POOL_DURATION_MAX_MS,
  LAUNCH_INTRO_POOL_DURATION_MIN_MS,
  type LaunchIntroPoolPolicy,
} from "@/lib/launch-intro/pool";

type Item = {
  id: string;
  name: string;
  status: "active" | "paused" | "ended";
  sort_order: number;
  start_at: string | null;
  end_at: string | null;
  background_color: string;
  duration_ms: number;
  cta_href: string | null;
  show_ad_label: boolean;
  image_url: string;
  image_width: number;
  image_height: number;
  updated_at: string;
  stats: { impression: number; skip: number; click: number; complete: number };
};

const API = "/api/admin/launch-intro/pool";
const DURATIONS = [1000, 1500, 2000, 2500, 3000, 4000, 5000].filter(
  (d) => d >= LAUNCH_INTRO_POOL_DURATION_MIN_MS && d <= LAUNCH_INTRO_POOL_DURATION_MAX_MS
);

/** 날짜 입력(브라우저 지역 시간) ↔ ISO */
function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocal(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

async function uploadDraftImage(file: File): Promise<string> {
  const post = async (body: unknown) => {
    const res = await fetch("/api/admin/launch-intro/upload", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Record<string, unknown>;
    if (!json.ok) throw new Error(json.error ?? String(res.status));
    return json;
  };
  const start = (await post({ action: "start", mime: file.type, bytes: file.size })) as unknown as {
    path: string;
    signedUrl: string;
  };
  const put = await fetch(start.signedUrl, {
    method: "PUT",
    headers: { "content-type": file.type, "x-upsert": "false" },
    body: file,
  });
  if (!put.ok) throw new Error(`storage_${put.status}`);
  const done = (await post({ action: "finish", path: start.path })) as unknown as { kind: string; ref: { draftPath?: string } };
  if (done.kind !== "image" || !done.ref.draftPath) throw new Error("image_type_invalid");
  return done.ref.draftPath;
}

export function LaunchIntroPoolAdminSection({ canWrite }: { canWrite: boolean }) {
  const { t, language } = useI18n();
  const [items, setItems] = useState<Item[] | null>(null);
  const [policy, setPolicy] = useState<LaunchIntroPoolPolicy | null>(null);
  const [policyRevision, setPolicyRevision] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);

  const errorText = useCallback(
    (code: string) => {
      if (code === "stale_revision") return t("admin_launch_intro_pool_err_stale");
      if (code === "fullscreen_image_too_small") return t("admin_launch_intro_pool_err_small");
      if (code === "image_type_invalid" || code === "image_required") return t("admin_launch_intro_pool_err_image");
      if (code === "cta_invalid") return t("admin_launch_intro_pool_err_cta");
      if (code === "active_cannot_delete") return t("admin_launch_intro_pool_err_delete_active");
      if (code === "window_invalid") return t("admin_launch_intro_pool_err_window");
      return t("admin_launch_intro_pool_err_save");
    },
    [t]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(API, { credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: Item[];
        policy?: LaunchIntroPoolPolicy;
        policyRevision?: string | null;
      };
      if (!res.ok || !json.ok) throw new Error("load");
      setItems(json.items ?? []);
      setPolicy(json.policy ?? null);
      setPolicyRevision(json.policyRevision ?? null);
    } catch {
      setNotice({ tone: "error", text: t("admin_launch_intro_pool_err_load") });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<Response>, okText: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fn();
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setNotice({ tone: "error", text: errorText(json.error ?? "save_failed") });
        if (res.status === 409) await load();
        return;
      }
      setNotice({ tone: "ok", text: okText });
      await load();
    } catch (e) {
      setNotice({ tone: "error", text: errorText(e instanceof Error ? e.message : "save_failed") });
    } finally {
      setBusy(false);
    }
  };

  const savePolicy = (next: LaunchIntroPoolPolicy) =>
    run(
      () =>
        fetch(`${API}/policy`, {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ policy: next, expectedRevision: policyRevision }),
        }),
      t("admin_launch_intro_pool_saved")
    );

  const create = () =>
    run(async () => {
      if (!newFile) throw new Error("image_required");
      const draftPath = await uploadDraftImage(newFile);
      const res = await fetch(API, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          draftPath,
          durationMs: LAUNCH_INTRO_POOL_DURATION_DEFAULT_MS,
          sortOrder: (items?.length ?? 0) * 10,
        }),
      });
      if (res.ok) {
        setNewName("");
        setNewFile(null);
      }
      return res;
    }, t("admin_launch_intro_pool_created"));

  const patch = (item: Item, body: Record<string, unknown>) =>
    run(
      () =>
        fetch(`${API}/${item.id}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, expectedUpdatedAt: item.updated_at }),
        }),
      t("admin_launch_intro_pool_saved")
    );

  const remove = async (item: Item) => {
    const ko = language !== "en";
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("delete"),
      ko,
      title: t("admin_launch_intro_pool_delete"),
      description: t("admin_launch_intro_pool_delete_confirm"),
      confirmLabel: adminCta("delete", ko),
      destructive: true,
    });
    if (!confirmed.ok) return;
    void run(
      () => fetch(`${API}/${item.id}`, { method: "DELETE", credentials: "same-origin" }),
      t("admin_launch_intro_pool_deleted")
    );
  };

  const disabled = !canWrite || busy;

  return (
    <AdminCard>
      <div className="space-y-4 px-4 py-3.5 sm:px-5" data-launch-intro-pool="1">
        <div>
          <h2 className="text-sm font-semibold">{t("admin_launch_intro_pool_title")}</h2>
          <p className="mt-1 text-xs text-sam-muted">{t("admin_launch_intro_pool_desc")}</p>
        </div>

        {policy ? (
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={policy.enabled}
                disabled={disabled}
                onChange={(e) => void savePolicy({ ...policy, enabled: e.target.checked })}
                data-launch-intro-pool-enabled="1"
              />
              {t("admin_launch_intro_pool_enabled")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={policy.showOnOsRestore}
                disabled={disabled}
                onChange={(e) => void savePolicy({ ...policy, showOnOsRestore: e.target.checked })}
                data-launch-intro-pool-os-restore="1"
              />
              {t("admin_launch_intro_pool_os_restore")}
            </label>
          </div>
        ) : null}

        {notice ? (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={notice.tone === "error" ? "text-sm text-sam-danger" : "text-sm text-sam-fg"}
          >
            {notice.text}
          </p>
        ) : null}

        <ul className="space-y-3">
          {(items ?? []).map((item) => (
            <PoolRow key={`${item.id}-${item.updated_at}`} item={item} disabled={disabled} onSave={patch} onDelete={remove} />
          ))}
          {items && items.length === 0 ? <li className="text-sm text-sam-muted">{t("admin_launch_intro_pool_empty")}</li> : null}
        </ul>

        <div className="space-y-2 border-t border-sam-border pt-3">
          <h3 className="text-sm font-semibold">{t("admin_launch_intro_pool_new")}</h3>
          <input
            className="w-full rounded-ui-rect border border-sam-border px-2 py-1.5 text-sm"
            placeholder={t("admin_launch_intro_pool_name")}
            value={newName}
            maxLength={80}
            disabled={disabled}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled}
            onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
            data-launch-intro-pool-file="1"
          />
          <p className="text-xs text-sam-muted">{t("admin_launch_intro_pool_image_help")}</p>
          <div className="flex justify-end">
            <AdminActionButton variant="primary" disabled={disabled || !newName.trim() || !newFile} onClick={() => void create()}>
              {t("admin_launch_intro_pool_add")}
            </AdminActionButton>
          </div>
        </div>
      </div>
    </AdminCard>
  );
}

function PoolRow({
  item,
  disabled,
  onSave,
  onDelete,
}: {
  item: Item;
  disabled: boolean;
  onSave: (item: Item, body: Record<string, unknown>) => Promise<void>;
  onDelete: (item: Item) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(item.name);
  const [status, setStatus] = useState(item.status);
  const [sortOrder, setSortOrder] = useState(item.sort_order);
  const [startAt, setStartAt] = useState(toLocal(item.start_at));
  const [endAt, setEndAt] = useState(toLocal(item.end_at));
  const [bg, setBg] = useState(item.background_color);
  const [duration, setDuration] = useState(item.duration_ms);
  const [cta, setCta] = useState(item.cta_href ?? "");
  const [adLabel, setAdLabel] = useState(item.show_ad_label);
  const input = "w-full rounded-ui-rect border border-sam-border px-2 py-1.5 text-sm";

  return (
    <li className="rounded-ui-rect border border-sam-border p-3" data-launch-intro-pool-item={item.id}>
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- 어드민 미리보기 작은 그림 */}
        <img
          src={item.image_url}
          alt=""
          className="h-24 w-16 shrink-0 rounded-ui-rect object-contain"
          style={{ background: bg }}
        />
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          <label className="text-xs">
            {t("admin_launch_intro_pool_name")}
            <input className={input} value={name} maxLength={80} disabled={disabled} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-xs">
            {t("admin_launch_intro_pool_status")}
            <select className={input} value={status} disabled={disabled} onChange={(e) => setStatus(e.target.value as Item["status"])}>
              <option value="active">{t("admin_launch_intro_pool_status_active")}</option>
              <option value="paused">{t("admin_launch_intro_pool_status_paused")}</option>
              <option value="ended">{t("admin_launch_intro_pool_status_ended")}</option>
            </select>
          </label>
          <label className="text-xs">
            {t("admin_launch_intro_pool_start")}
            <input type="datetime-local" className={input} value={startAt} disabled={disabled} onChange={(e) => setStartAt(e.target.value)} />
          </label>
          <label className="text-xs">
            {t("admin_launch_intro_pool_end")}
            <input type="datetime-local" className={input} value={endAt} disabled={disabled} onChange={(e) => setEndAt(e.target.value)} />
          </label>
          <label className="text-xs">
            {t("admin_launch_intro_pool_bg")}
            <input className={`${input} font-mono`} value={bg} maxLength={7} disabled={disabled} onChange={(e) => setBg(e.target.value)} />
          </label>
          <label className="text-xs">
            {t("admin_launch_intro_pool_duration")}
            <select className={input} value={String(duration)} disabled={disabled} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((d) => (
                <option key={d} value={String(d)}>
                  {t("admin_launch_intro_pool_seconds", { seconds: d / 1000 })}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs sm:col-span-2">
            {t("admin_launch_intro_pool_cta")}
            <input className={input} value={cta} maxLength={500} placeholder="/stores" disabled={disabled} onChange={(e) => setCta(e.target.value)} />
          </label>
          <label className="text-xs">
            {t("admin_launch_intro_pool_order")}
            <input
              type="number"
              className={input}
              value={sortOrder}
              disabled={disabled}
              onChange={(e) => setSortOrder(Math.trunc(Number(e.target.value) || 0))}
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={adLabel} disabled={disabled} onChange={(e) => setAdLabel(e.target.checked)} />
            {t("admin_launch_intro_pool_ad_label")}
          </label>
        </div>
      </div>
      <p className="mt-2 text-xs text-sam-muted" data-launch-intro-pool-stats="1">
        {t("admin_launch_intro_pool_stats", {
          impression: item.stats.impression,
          click: item.stats.click,
          skip: item.stats.skip,
          complete: item.stats.complete,
        })}
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <AdminActionButton variant="secondary" disabled={disabled || item.status === "active"} onClick={() => void onDelete(item)}>
          {t("admin_launch_intro_pool_delete")}
        </AdminActionButton>
        <AdminActionButton
          variant="primary"
          disabled={disabled}
          onClick={() =>
            void onSave(item, {
              name,
              status,
              sortOrder,
              startAt: fromLocal(startAt),
              endAt: fromLocal(endAt),
              backgroundColor: bg,
              durationMs: duration,
              ctaHref: cta.trim() || null,
              showAdLabel: adLabel,
            })
          }
        >
          {t("admin_launch_intro_pool_save")}
        </AdminActionButton>
      </div>
    </li>
  );
}
