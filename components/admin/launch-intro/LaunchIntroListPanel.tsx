"use client";

/**
 * 앱 진입 어드민 v3 §3 (Owner 2026-11-17 「v3대로 진행」) — 인트로 목록(매일 관리하는 화면).
 * - 위: 「인트로 켜기」·「휴대폰이 앱을 종료한 뒤 다시 켤 때도」 (확인창 → 전체 설정 API · 읽은 판 기준 409)
 * - 필터: 앱에 나오나(전체·나오는 중·예약·안 나옴) · 종류(광고·이벤트·안내) · 이름 찾기
 * - 표: 손잡이 · 순서 · 그림(배경색 위) · 이름+종류 · 앱에 나오나(서버 계산 + 이유 1줄) · 기간 PHT · 표시 · 누르면 · 최근 30일 · 켜기 · 수정/복제/삭제
 * - 끌어서 순서 → 「순서 저장」 한 요청(행마다 읽은 판 확인 · 409 면 다시 불러옴)
 * 만들기·수정은 같은 자리의 전체 폭 편집 화면(`LaunchIntroCreativeEditor`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { LaunchIntroCreativeEditor, LAUNCH_INTRO_CTA_KEY, LAUNCH_INTRO_KIND_KEY } from "@/components/admin/launch-intro/LaunchIntroCreativeEditor";
import { fetchLaunchIntroEventOptions } from "@/components/admin/launch-intro/LaunchIntroEventPicker";
import {
  LAUNCH_INTRO_POOL_API,
  LAUNCH_INTRO_POOL_CAP,
  launchIntroPoolErrorText,
  launchIntroPoolRequest,
} from "@/components/admin/launch-intro/launch-intro-pool-client";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { formatAdminShortId } from "@/components/admin/ui/AdminTechId";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import type { MessageKey } from "@/lib/i18n/messages";
import { LAUNCH_INTRO_POOL_KINDS, LAUNCH_INTRO_POOL_NAME_MAX, type LaunchIntroPoolOffReason, type LaunchIntroPoolPolicy } from "@/lib/launch-intro/pool";
import {
  filterLaunchIntroItems,
  formatLaunchIntroPhtShort,
  launchIntroOrderPayload,
  moveLaunchIntroItem,
  parseLaunchIntroCtaHref,
  type LaunchIntroListFilter,
  type LaunchIntroPoolAdminItem,
} from "@/lib/launch-intro/pool-admin-view";

const REASON_KEY: Record<LaunchIntroPoolOffReason, MessageKey> = {
  policy_off: "admin_launch_intro_v3_reason_policy_off",
  paused: "admin_launch_intro_v3_reason_paused",
  ended_status: "admin_launch_intro_v3_reason_ended_status",
  window_ended: "admin_launch_intro_v3_reason_window_ended",
  image_missing: "admin_launch_intro_v3_reason_image_missing",
  over_cap: "admin_launch_intro_v3_reason_over_cap",
};

const STATE_FILTERS: { id: LaunchIntroListFilter["state"]; key: MessageKey }[] = [
  { id: "all", key: "admin_launch_intro_v3_filter_all" },
  { id: "live", key: "admin_launch_intro_v3_filter_live" },
  { id: "scheduled", key: "admin_launch_intro_v3_filter_scheduled" },
  { id: "off", key: "admin_launch_intro_v3_filter_off" },
];

type Notice = { tone: "ok" | "error"; text: string } | null;
type Editing = null | { mode: "new" } | { mode: "edit"; item: LaunchIntroPoolAdminItem };

export function LaunchIntroListPanel({ canWrite }: { canWrite: boolean }) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [items, setItems] = useState<LaunchIntroPoolAdminItem[] | null>(null);
  const [order, setOrder] = useState<LaunchIntroPoolAdminItem[] | null>(null);
  const [policy, setPolicy] = useState<LaunchIntroPoolPolicy | null>(null);
  const [policyRevision, setPolicyRevision] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ code?: string; httpStatus?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [filter, setFilter] = useState<LaunchIntroListFilter>({ state: "all", kind: "all", q: "" });
  const [editing, setEditing] = useState<Editing>(null);
  const [eventTitles, setEventTitles] = useState<Record<string, string>>({});
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(LAUNCH_INTRO_POOL_API, { credentials: "same-origin", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        items?: LaunchIntroPoolAdminItem[];
        policy?: LaunchIntroPoolPolicy;
        policyRevision?: string | null;
      };
      if (!res.ok || !json.ok) {
        setLoadError({ code: json.error, httpStatus: res.status });
        return;
      }
      setLoadError(null);
      setItems(json.items ?? []);
      setOrder(null);
      setPolicy(json.policy ?? null);
      setPolicyRevision(json.policyRevision ?? null);
    } catch {
      setLoadError({ code: "network" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 「누르면」 칸의 이벤트 이름 — 이벤트로 가는 인트로가 있을 때만 이벤트 목록을 한 번 받는다
  const hasEventCta = (items ?? []).some((it) => parseLaunchIntroCtaHref(it.cta_href).type === "event");
  useEffect(() => {
    if (!hasEventCta) return;
    let cancelled = false;
    void fetchLaunchIntroEventOptions().then((list) => {
      if (!cancelled && list) setEventTitles(Object.fromEntries(list.map((e) => [e.id, e.title])));
    });
    return () => {
      cancelled = true;
    };
  }, [hasEventCta]);

  const fail = useCallback(
    async (status: number, code: string) => {
      setNotice({ tone: "error", text: launchIntroPoolErrorText(code, t) });
      if (status === 409) await load();
    },
    [load, t]
  );

  const savePolicy = async (field: keyof LaunchIntroPoolPolicy, next: boolean, label: string) => {
    if (!policy) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: t("admin_launch_intro_v3_policy_confirm_title"),
      description: next
        ? t("admin_launch_intro_v3_policy_turn_on_desc", { label })
        : t("admin_launch_intro_v3_policy_turn_off_desc", { label }),
      confirmLabel: next ? t("admin_launch_intro_v3_turn_on") : t("admin_launch_intro_v3_turn_off"),
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setNotice(null);
    const res = await launchIntroPoolRequest(`${LAUNCH_INTRO_POOL_API}/policy`, "PUT", {
      policy: { ...policy, [field]: next },
      expectedRevision: policyRevision,
    });
    setBusy(false);
    if (!res.ok) return fail(res.status, res.error);
    setNotice({ tone: "ok", text: t("admin_launch_intro_v3_switched") });
    await load();
  };

  /** 빌드 전 감사 I6: 저장 안 한 끌기 순서가 있으면 다시 읽기(load) 전에 버려도 되는지 묻는다 */
  const confirmDiscardOrder = async (): Promise<boolean> => {
    if (!order) return true;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: t("admin_launch_intro_v3_order_discard_title"),
      description: t("admin_launch_intro_v3_order_discard_desc"),
      confirmLabel: t("admin_launch_intro_v3_order_discard_confirm"),
    });
    return confirmed.ok;
  };

  const toggleItem = async (item: LaunchIntroPoolAdminItem, on: boolean) => {
    if (!(await confirmDiscardOrder())) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: on ? t("admin_launch_intro_v3_switch_on_title") : t("admin_launch_intro_v3_switch_off_title"),
      description: on ? t("admin_launch_intro_v3_switch_on_desc") : t("admin_launch_intro_v3_switch_off_desc"),
      confirmLabel: on ? t("admin_launch_intro_v3_turn_on") : t("admin_launch_intro_v3_turn_off"),
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setNotice(null);
    const res = await launchIntroPoolRequest(`${LAUNCH_INTRO_POOL_API}/${item.id}`, "PATCH", {
      status: on ? "active" : "paused",
      expectedUpdatedAt: item.updated_at,
    });
    setBusy(false);
    if (!res.ok) return fail(res.status, res.error);
    setNotice({ tone: "ok", text: t("admin_launch_intro_v3_switched") });
    await load();
  };

  const duplicate = async (item: LaunchIntroPoolAdminItem) => {
    if (!(await confirmDiscardOrder())) return;
    setBusy(true);
    setNotice(null);
    const name = t("admin_launch_intro_v3_duplicate_name", { name: item.name }).slice(0, LAUNCH_INTRO_POOL_NAME_MAX);
    const res = await launchIntroPoolRequest(LAUNCH_INTRO_POOL_API, "POST", { duplicateOf: item.id, name });
    setBusy(false);
    if (!res.ok) return fail(res.status, res.error);
    setNotice({ tone: "ok", text: t("admin_launch_intro_v3_duplicated") });
    await load();
  };

  const remove = async (item: LaunchIntroPoolAdminItem) => {
    if (!(await confirmDiscardOrder())) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("delete"),
      ko,
      title: t("admin_launch_intro_pool_delete"),
      description: t("admin_launch_intro_pool_delete_confirm"),
      confirmLabel: adminCta("delete", ko),
      destructive: true,
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setNotice(null);
    const res = await launchIntroPoolRequest(`${LAUNCH_INTRO_POOL_API}/${item.id}`, "DELETE");
    setBusy(false);
    if (!res.ok) return fail(res.status, res.error);
    setNotice({ tone: "ok", text: t("admin_launch_intro_pool_deleted") });
    await load();
  };

  const rows = useMemo(() => order ?? items ?? [], [order, items]);
  const reorderable = canWrite && !busy && filter.state === "all" && filter.kind === "all" && !filter.q.trim();
  const shown = useMemo(() => filterLaunchIntroItems(rows, filter), [rows, filter]);

  const saveOrder = async () => {
    if (!order) return;
    setBusy(true);
    setNotice(null);
    const res = await launchIntroPoolRequest(`${LAUNCH_INTRO_POOL_API}/order`, "PUT", { items: launchIntroOrderPayload(order) });
    setBusy(false);
    if (!res.ok) return fail(res.status, res.error);
    setNotice({ tone: "ok", text: t("admin_launch_intro_v3_order_saved") });
    await load();
  };

  const move = (from: number, to: number) => {
    if (!reorderable) return;
    setOrder(moveLaunchIntroItem(rows, from, to));
  };

  const counts = useMemo(() => {
    const c = { all: rows.length, live: 0, scheduled: 0, off: 0 };
    for (const it of rows) c[it.applied?.state ?? "off"] += 1;
    return c;
  }, [rows]);

  const maxSort = Math.max(0, ...(items ?? []).map((i) => i.sort_order));

  if (editing) {
    return (
      <LaunchIntroCreativeEditor
        key={editing.mode === "edit" ? editing.item.id : "new"}
        item={editing.mode === "edit" ? editing.item : null}
        nextSortOrder={Math.min(100000, maxSort + 10)}
        canWrite={canWrite}
        onCancel={() => setEditing(null)}
        onDone={(message) => {
          setEditing(null);
          setNotice({ tone: "ok", text: message });
          void load();
        }}
      />
    );
  }

  const appliedCell = (it: LaunchIntroPoolAdminItem) => {
    const a = it.applied;
    if (!a) return <span className="sam-text-helper text-sam-muted">{t("admin_launch_intro_v3_applied_unknown")}</span>;
    if (a.state === "live") {
      return (
        <div>
          <span className="inline-flex rounded-full bg-sam-success-soft px-2 py-0.5 sam-text-helper font-semibold text-sam-success">
            ● {t("admin_launch_intro_v3_applied_live")}
          </span>
        </div>
      );
    }
    if (a.state === "scheduled") {
      return (
        <div>
          <span className="inline-flex rounded-full bg-sam-warning-soft px-2 py-0.5 sam-text-helper font-semibold text-sam-warning">
            ◐ {t("admin_launch_intro_v3_applied_scheduled")}
          </span>
          <div className="mt-0.5 sam-text-helper tabular-nums text-sam-muted">
            {t("admin_launch_intro_v3_applied_scheduled_at", { time: formatLaunchIntroPhtShort(a.startAt) })}
          </div>
        </div>
      );
    }
    return (
      <div>
        <span className="inline-flex rounded-full bg-sam-danger-soft px-2 py-0.5 sam-text-helper font-semibold text-sam-danger">
          ✕ {t("admin_launch_intro_v3_applied_off")}
        </span>
        <div className="mt-0.5 sam-text-helper text-sam-muted" data-launch-intro-off-reason={a.reason}>
          {t(REASON_KEY[a.reason], {
            date: formatLaunchIntroPhtShort(a.endAt ?? null).slice(0, 5),
            max: LAUNCH_INTRO_POOL_CAP,
          })}
        </div>
      </div>
    );
  };

  const periodText = (it: LaunchIntroPoolAdminItem) => {
    const start = formatLaunchIntroPhtShort(it.start_at);
    const end = formatLaunchIntroPhtShort(it.end_at);
    if (start && end) return t("admin_launch_intro_v3_period_range", { start, end });
    if (start) return t("admin_launch_intro_v3_period_from", { start });
    if (end) return t("admin_launch_intro_v3_period_until", { end });
    return t("admin_launch_intro_v3_period_always");
  };

  const ctaText = (it: LaunchIntroPoolAdminItem) => {
    const c = parseLaunchIntroCtaHref(it.cta_href);
    const label = t(LAUNCH_INTRO_CTA_KEY[c.type]);
    if (c.type === "none") return label;
    const value = c.type === "event" ? eventTitles[c.value] || formatAdminShortId(c.value) : c.value;
    return `${label} 「${value}」`;
  };

  const statsText = (it: LaunchIntroPoolAdminItem) => {
    const s = it.stats;
    if (!s || (s.impression === 0 && s.click === 0)) return "—";
    if (s.click === 0) return t("admin_launch_intro_v3_stats_impression_only", { impression: formatAdminNumber(s.impression) });
    const rate = s.impression > 0 ? `${((s.click / s.impression) * 100).toFixed(1)}%` : "—";
    return t("admin_launch_intro_v3_stats_line", {
      impression: formatAdminNumber(s.impression),
      click: formatAdminNumber(s.click),
      rate,
    });
  };

  return (
    <div className="space-y-3" data-launch-intro-list="">
      <AdminCard>
        <p className="px-4 py-3 sam-text-body text-sam-fg sm:px-5" data-launch-intro-new-app-note="">
          {t("admin_launch_intro_v3_new_app_note")}
        </p>
      </AdminCard>
      <AdminCard>
        <div className="space-y-3 px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              {policy ? (
                <>
                  <span className="inline-flex items-center gap-2 sam-text-body text-sam-fg" data-launch-intro-pool-enabled="">
                    <AdminSwitch
                      checked={policy.enabled}
                      disabled={!canWrite || busy}
                      label={t("admin_launch_intro_v3_policy_enabled")}
                      onChange={(v) => void savePolicy("enabled", v, t("admin_launch_intro_v3_policy_enabled"))}
                    />
                    {t("admin_launch_intro_v3_policy_enabled")}
                  </span>
                  <span className="inline-flex items-center gap-2 sam-text-body text-sam-fg" data-launch-intro-pool-os-restore="">
                    <AdminSwitch
                      checked={policy.showOnOsRestore}
                      disabled={!canWrite || busy}
                      label={t("admin_launch_intro_v3_policy_os_restore")}
                      onChange={(v) => void savePolicy("showOnOsRestore", v, t("admin_launch_intro_v3_policy_os_restore"))}
                    />
                    {t("admin_launch_intro_v3_policy_os_restore")}
                  </span>
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <AdminActionButton variant="secondary" disabled={!order || busy || !canWrite} onClick={() => void saveOrder()} data-launch-intro-save-order="">
                {t("admin_launch_intro_v3_save_order")}
              </AdminActionButton>
              <AdminActionButton variant="primary" disabled={!canWrite || busy} onClick={() => setEditing({ mode: "new" })} data-launch-intro-new="">
                {t("admin_launch_intro_v3_new")}
              </AdminActionButton>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {STATE_FILTERS.map((f) => (
                <AdminChipButton
                  key={f.id}
                  selected={filter.state === f.id}
                  count={counts[f.id]}
                  onClick={() => setFilter((cur) => ({ ...cur, state: f.id }))}
                  data-launch-intro-filter={f.id}
                >
                  {t(f.key)}
                </AdminChipButton>
              ))}
              {LAUNCH_INTRO_POOL_KINDS.map((k) => (
                <AdminChipButton
                  key={k}
                  selected={filter.kind === k}
                  onClick={() => setFilter((cur) => ({ ...cur, kind: cur.kind === k ? "all" : k }))}
                  data-launch-intro-kind-filter={k}
                >
                  {t(LAUNCH_INTRO_KIND_KEY[k])}
                </AdminChipButton>
              ))}
            </div>
            <input
              className="w-56 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body text-sam-fg"
              placeholder={t("admin_launch_intro_v3_name_find")}
              value={filter.q}
              onChange={(e) => setFilter((cur) => ({ ...cur, q: e.target.value }))}
              data-launch-intro-name-find=""
            />
          </div>

          {notice ? (
            <p
              role={notice.tone === "error" ? "alert" : "status"}
              className={`rounded-ui-rect px-3 py-2 sam-text-body ${notice.tone === "error" ? "bg-sam-danger-soft text-sam-danger" : "bg-sam-surface-muted text-sam-fg"}`}
            >
              {notice.text}
            </p>
          ) : null}
          {order ? <p className="sam-text-helper text-sam-warning">{t("admin_launch_intro_v3_order_dirty")}</p> : null}
          {!reorderable && canWrite ? <p className="sam-text-helper text-sam-muted">{t("admin_launch_intro_v3_order_filter_note")}</p> : null}

          {!items && !loadError ? <AdminLoadingState ko={ko} /> : null}
          {!items && loadError ? (
            <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.httpStatus} onRetry={() => void load()} />
          ) : null}

          {items ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse sam-text-body text-sam-fg" data-launch-intro-table="">
                <thead>
                  <tr className="border-b border-sam-border text-left sam-text-helper text-sam-muted">
                    <th className="w-8 px-1 py-2" aria-label={t("admin_launch_intro_v3_drag_aria")} />
                    <th className="px-2 py-2">{t("admin_launch_intro_v3_col_order")}</th>
                    <th className="px-2 py-2">{t("admin_launch_intro_v3_col_image")}</th>
                    <th className="px-2 py-2">{t("admin_launch_intro_v3_col_name")}</th>
                    <th className="px-2 py-2">{t("admin_launch_intro_v3_col_applied")}</th>
                    <th className="px-2 py-2">{t("admin_launch_intro_v3_col_period")}</th>
                    <th className="px-2 py-2">{t("admin_launch_intro_v3_col_duration")}</th>
                    <th className="px-2 py-2">{t("admin_launch_intro_v3_col_cta")}</th>
                    <th className="px-2 py-2">{t("admin_launch_intro_v3_col_stats")}</th>
                    <th className="px-2 py-2">{t("admin_launch_intro_v3_col_switch")}</th>
                    <th className="px-2 py-2 text-right">{t("admin_launch_intro_v3_col_actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((it) => {
                    const idx = rows.indexOf(it);
                    const a = it.applied;
                    const rank = a && a.state !== "off" ? a.rank + 1 : null;
                    return (
                      <tr
                        key={it.id}
                        className={`border-b border-sam-border align-middle ${dragOver === idx ? "bg-sam-surface-muted" : ""}`}
                        draggable={reorderable}
                        onDragStart={(e) => {
                          dragFrom.current = idx;
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          if (!reorderable || dragFrom.current === null) return;
                          e.preventDefault();
                          setDragOver(idx);
                        }}
                        onDragLeave={() => setDragOver((cur) => (cur === idx ? null : cur))}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragFrom.current !== null) move(dragFrom.current, idx);
                          dragFrom.current = null;
                          setDragOver(null);
                        }}
                        onDragEnd={() => {
                          dragFrom.current = null;
                          setDragOver(null);
                        }}
                        data-launch-intro-row={it.id}
                      >
                        <td className="px-1 py-2">
                          <span
                            role="button"
                            tabIndex={reorderable ? 0 : -1}
                            aria-disabled={!reorderable}
                            aria-label={t("admin_launch_intro_v3_drag_aria")}
                            className={`select-none px-1 text-sam-muted ${reorderable ? "cursor-grab" : "opacity-40"}`}
                            onKeyDown={(e) => {
                              if (e.key === "ArrowUp" && idx > 0) {
                                e.preventDefault();
                                move(idx, idx - 1);
                              } else if (e.key === "ArrowDown" && idx < rows.length - 1) {
                                e.preventDefault();
                                move(idx, idx + 1);
                              }
                            }}
                          >
                            ⋮⋮
                          </span>
                        </td>
                        <td className="px-2 py-2 tabular-nums">{rank ?? "—"}</td>
                        <td className="px-2 py-2">
                          <div
                            className="flex h-14 w-8 items-center justify-center overflow-hidden rounded-ui-rect border border-sam-border"
                            style={{ background: it.background_color }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- 어드민 작은 그림 */}
                            <img src={it.image_url} alt="" className="max-h-full max-w-full object-contain" />
                          </div>
                        </td>
                        <td className="max-w-[220px] px-2 py-2">
                          <div className="truncate font-semibold">{it.name}</div>
                          <span className="mt-0.5 inline-flex rounded-full bg-sam-surface-muted px-2 sam-text-helper text-sam-fg" data-launch-intro-kind-badge={it.kind}>
                            {t(LAUNCH_INTRO_KIND_KEY[it.kind])}
                          </span>
                        </td>
                        <td className="px-2 py-2" data-launch-intro-applied={a?.state ?? "unknown"}>
                          {appliedCell(it)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums">{periodText(it)}</td>
                        <td className="whitespace-nowrap px-2 py-2">{t("admin_launch_intro_pool_seconds", { seconds: it.duration_ms / 1000 })}</td>
                        <td className="max-w-[200px] truncate px-2 py-2">{ctaText(it)}</td>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums">{statsText(it)}</td>
                        <td className="px-2 py-2">
                          <AdminSwitch
                            checked={it.status === "active"}
                            disabled={!canWrite || busy}
                            label={t("admin_launch_intro_v3_col_switch")}
                            onChange={(v) => void toggleItem(it, v)}
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          <div className="inline-flex gap-1">
                            <AdminActionButton variant="ghost" size="sm" disabled={busy} onClick={() => setEditing({ mode: "edit", item: it })}>
                              {adminCta("edit", ko)}
                            </AdminActionButton>
                            <AdminActionButton variant="ghost" size="sm" disabled={!canWrite || busy} onClick={() => void duplicate(it)}>
                              {t("admin_launch_intro_v3_duplicate")}
                            </AdminActionButton>
                            {/* 켜진 소재는 삭제 칸이 없다(서버도 409 active_cannot_delete) — 먼저 끈다 */}
                            {it.status !== "active" ? (
                              <AdminActionButton variant="danger" size="sm" disabled={!canWrite || busy} onClick={() => void remove(it)}>
                                {adminCta("delete", ko)}
                              </AdminActionButton>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-2 py-6 text-center sam-text-body text-sam-muted">
                        {rows.length === 0 ? t("admin_launch_intro_pool_empty") : t("admin_launch_intro_v3_empty_filtered")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          <p className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-3 py-2 sam-text-helper text-sam-fg">
            {t("admin_launch_intro_v3_list_note", { max: LAUNCH_INTRO_POOL_CAP })}
          </p>
        </div>
      </AdminCard>
    </div>
  );
}
