"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  BOTTOM_NAV_BUILTIN_ICON_KEYS,
  resolveAdminDelApiError,
} from "@/components/admin/i18n/admin-delivery-label-keys";
import { isDeliveryBottomNavBuiltinOwnerStoreItem } from "@/lib/delivery/delivery-bottom-nav-builtin";
import {
  adminConflictReloadedMessage,
  adminOperatorErrorMessage,
} from "@/lib/admin/operator-ux/operator-labels";
import { isAdminConflictErrorCode } from "@/lib/admin/concurrency/admin-expected-updated-at";
import { AdminConfigAuditHistoryPanel } from "@/components/admin/delivery/AdminConfigAuditHistoryPanel";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { DESIGN_SYSTEM_BRAND } from "@/lib/ui/design-system-hard-lock";

/** 새 메뉴 기본 색 = 브랜드 색 (디자인 시스템 SSOT). */
const DEFAULT_NAV_COLOR = DESIGN_SYSTEM_BRAND.primaryHex;

type Row = {
  id: string;
  label: string;
  icon_key: string;
  href: string;
  sort_order: number;
  is_active: boolean;
  is_center: boolean;
  color: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type ListResp = { ok: boolean; items?: Row[]; error?: string };

/** 응답 파싱 실패·HTTP 오류도 { ok:false, error } 로 통일 — 호출부가 항상 결과를 확인한다. */
async function readResult<T extends { ok: boolean; error?: string }>(res: Response): Promise<T> {
  const j = (await res.json().catch(() => null)) as T | null;
  if (j && res.ok) return j;
  const code =
    j && typeof j.error === "string" && j.error ? j.error : res.status === 403 ? "forbidden" : "update_failed";
  return { ...(j ?? {}), ok: false, error: code } as T;
}

async function apiList(): Promise<ListResp> {
  try {
    const res = await fetch("/api/admin/stores/bottom-nav", { credentials: "include" });
    return await readResult<ListResp>(res);
  } catch {
    return { ok: false, error: "network_error" };
  }
}

async function apiCreate(payload: Partial<Row>) {
  try {
    const res = await fetch("/api/admin/stores/bottom-nav", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await readResult<{ ok: boolean; item?: Row; error?: string }>(res);
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** 단일 항목 PUT — 화면이 본 updated_at 을 함께 보낸다 (CAS, 409 stale_updated_at). */
async function apiUpdate(id: string, patch: Partial<Row>, expectedUpdatedAt: string | null | undefined) {
  try {
    const res = await fetch("/api/admin/stores/bottom-nav", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...patch, expected_updated_at: expectedUpdatedAt ?? null }),
    });
    return await readResult<{ ok: boolean; item?: Row; error?: string }>(res);
  } catch {
    return { ok: false, error: "network_error" } as { ok: boolean; item?: Row; error?: string };
  }
}

/** 순서 교환 1회 요청 (DEF-44) — 서버가 CAS·되돌리기·감사 기록을 처리한다. */
async function apiSwapOrder(a: Row, b: Row) {
  try {
    const res = await fetch("/api/admin/stores/bottom-nav", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "swap_order",
        a_id: a.id,
        b_id: b.id,
        a_sort_order: a.sort_order,
        b_sort_order: b.sort_order,
      }),
    });
    return await readResult<{ ok: boolean; error?: string }>(res);
  } catch {
    return { ok: false, error: "network_error" };
  }
}

async function apiDelete(id: string, reason: string | null) {
  try {
    const res = await fetch(`/api/admin/stores/bottom-nav?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    return await readResult<{ ok: boolean; error?: string }>(res);
  } catch {
    return { ok: false, error: "network_error" };
  }
}

function normalizeInt(v: string): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

export function AdminDeliveryBottomNavPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [rows, setRows] = useState<Row[]>([]);
  const [rowBusy, setRowBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 목록 불러오기 실패 (작업 실패 문구 `error` 와 분리) → AdminErrorState + [새로고침]. */
  const [loadErr, setLoadErr] = useState<string | null>(null);
  /** 추가 처리 중 — [추가] 중복 클릭 방지 */
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 재조회마다 증가 — 처리 이력 패널 refetch. */
  const [historyBump, setHistoryBump] = useState(0);
  const [editDraft, setEditDraft] = useState<Partial<Row> | null>(null);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<Partial<Row>>({
    label: "",
    icon_key: "home",
    href: "/philife",
    sort_order: 0,
    is_active: true,
    is_center: false,
    color: DEFAULT_NAV_COLOR,
  });

  const tableHeaders = useMemo(
    () =>
      [
        "admin_del_th_order",
        "admin_del_th_menu_name",
        "admin_del_th_icon_key",
        "admin_del_th_link",
        "admin_del_th_visible",
        "admin_del_th_center",
        "admin_del_th_color",
        "admin_del_th_manage",
      ] as const,
    []
  );

  /** 알려진 코드는 기존 라벨, 그 외는 운영자 문구 (원시 코드 노출 금지). */
  const errText = useCallback(
    (code: string | undefined | null) => {
      const resolved = resolveAdminDelApiError(t, code);
      if (code && resolved === code) {
        return adminOperatorErrorMessage(/^[a-z][a-z0-9_]*$/i.test(code) ? code : "update_failed", ko);
      }
      return resolved;
    },
    [t, ko]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadErr(null);
    try {
      const data = await apiList();
      if (!data.ok) {
        // 실패해도 직전 목록은 지우지 않는다 (§8-5).
        setLoadErr(!data.error || data.error === "update_failed" ? "load_failed" : data.error);
      } else {
        const sorted = (data.items ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        setRows(sorted.filter((r) => !isDeliveryBottomNavBuiltinOwnerStoreItem(r)));
        setHistoryBump((n) => n + 1);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const centerCount = useMemo(() => rows.filter((r) => r.is_center).length, [rows]);
  const editingRow = useMemo(
    () => (editingId ? rows.find((r) => r.id === editingId) ?? null : null),
    [editingId, rows]
  );

  /** 저장 실패 문구 — 충돌(409)은 최신 데이터를 다시 불러온 뒤 안내. */
  const saveErrText = useCallback(
    (code: string | undefined | null) =>
      isAdminConflictErrorCode(code) || code === "expected_updated_at_required"
        ? adminConflictReloadedMessage(code, ko)
        : errText(code),
    [errText, ko]
  );

  /** 단일 행 PUT (노출·중앙 토글) — 재조회 후 결과 오류 표시 (DEF-44). */
  const updateRow = useCallback(
    async (row: Row, patch: Partial<Row>) => {
      if (rowBusy) return;
      setRowBusy(true);
      setError(null);
      try {
        const res = await apiUpdate(row.id, patch, row.updated_at);
        await load();
        if (!res.ok) setError(saveErrText(res.error));
      } finally {
        setRowBusy(false);
      }
    },
    [rowBusy, saveErrText, load]
  );

  /** 순서 이동 — 한 번의 요청으로 두 항목 순서를 교환 (DEF-44). 결과 확인 후 재조회. */
  const move = useCallback(
    async (id: string, dir: "up" | "down") => {
      if (rowBusy) return;
      const idx = rows.findIndex((r) => r.id === id);
      if (idx < 0) return;
      const nextIdx = dir === "up" ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= rows.length) return;
      const a = rows[idx]!;
      const b = rows[nextIdx]!;
      setRowBusy(true);
      setError(null);
      try {
        const res = await apiSwapOrder(a, b);
        if (!res.ok) setError(errText(res.error));
      } finally {
        await load();
        setRowBusy(false);
      }
    },
    [rows, load, rowBusy, errText]
  );

  const enterEdit = useCallback((r: Row) => {
    setError(null);
    setEditingId(r.id);
    setEditDraft({
      label: r.label,
      icon_key: r.icon_key,
      href: r.href,
      color: r.color,
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft(null);
    setError(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingRow || !editingId || !editDraft) return;
    const label = String(editDraft.label ?? "").trim();
    const icon_key = String(editDraft.icon_key ?? "").trim();
    const href = String(editDraft.href ?? "").trim();
    const color = String(editDraft.color ?? "").trim() || DEFAULT_NAV_COLOR;
    if (!label || !icon_key || !href) {
      setError(t("admin_del_err_required_fields"));
      return;
    }
    setSaving(true);
    try {
      const patch: Partial<Row> = {};
      if (label !== editingRow.label) patch.label = label;
      if (icon_key !== editingRow.icon_key) patch.icon_key = icon_key;
      if (href !== editingRow.href) patch.href = href;
      if (color !== editingRow.color) patch.color = color;
      if (Object.keys(patch).length > 0) {
        const res = await apiUpdate(editingId, patch, editingRow.updated_at);
        if (!res.ok) {
          if (isAdminConflictErrorCode(res.error) || res.error === "expected_updated_at_required") {
            cancelEdit();
            await load();
          }
          setError(saveErrText(res.error));
          return;
        }
      }
      cancelEdit();
      await load();
    } finally {
      setSaving(false);
    }
  }, [editingRow, editingId, editDraft, cancelEdit, load, t, saveErrText]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <AdminPageHeader
        titleKey="admin_del_page_bottom_nav_title"
        descriptionKey="admin_del_page_bottom_nav_desc"
      />

      <div className="grid gap-4">
        <AdminCard titleKey="admin_del_card_add_menu" className="">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="sam-text-body font-medium text-sam-fg">{t("admin_del_field_label")}</span>
              <input
                className="sam-input"
                value={draft.label ?? ""}
                onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
                placeholder={t("admin_del_ph_label_example")}
              />
            </label>
            <label className="grid gap-1">
              <span className="sam-text-body font-medium text-sam-fg">{t("admin_del_field_icon_key")}</span>
              <input
                className="sam-input"
                value={draft.icon_key ?? ""}
                onChange={(e) => setDraft((p) => ({ ...p, icon_key: e.target.value }))}
                placeholder={t("admin_del_ph_icon_key")}
              />
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="sam-text-body font-medium text-sam-fg">{t("admin_del_field_href")}</span>
              <input
                className="sam-input"
                value={draft.href ?? ""}
                onChange={(e) => setDraft((p) => ({ ...p, href: e.target.value }))}
                placeholder={t("admin_del_ph_href")}
              />
            </label>
            <label className="grid gap-1">
              <span className="sam-text-body font-medium text-sam-fg">{t("admin_del_field_sort_order")}</span>
              <input
                className="sam-input"
                inputMode="numeric"
                value={String(draft.sort_order ?? 0)}
                onChange={(e) => setDraft((p) => ({ ...p, sort_order: normalizeInt(e.target.value) }))}
              />
            </label>
            <label className="grid gap-1">
              <span className="sam-text-body font-medium text-sam-fg">{t("admin_del_field_color")}</span>
              <input
                className="sam-input"
                value={draft.color ?? DEFAULT_NAV_COLOR}
                onChange={(e) => setDraft((p) => ({ ...p, color: e.target.value }))}
                placeholder={t("admin_del_ph_color")}
              />
            </label>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <label className="inline-flex items-center gap-2 sam-text-body text-sam-fg">
                <input
                  type="checkbox"
                  checked={Boolean(draft.is_active)}
                  onChange={(e) => setDraft((p) => ({ ...p, is_active: e.target.checked }))}
                />
                {t("admin_del_field_is_active")}
              </label>
              <label className="inline-flex items-center gap-2 sam-text-body text-sam-fg">
                <input
                  type="checkbox"
                  checked={Boolean(draft.is_center)}
                  onChange={(e) => setDraft((p) => ({ ...p, is_center: e.target.checked }))}
                />
                {t("admin_del_field_is_center_count", { count: centerCount })}
              </label>
              <AdminActionButton
                variant="primary"
                disabled={adding}
                onClick={async () => {
                  if (adding) return;
                  setError(null);
                  setAdding(true);
                  try {
                    const res = await apiCreate(draft);
                    if (!res.ok) {
                      setError(errText(res.error));
                      return;
                    }
                    setDraft((p) => ({ ...p, label: "" }));
                    await load();
                  } finally {
                    setAdding(false);
                  }
                }}
              >
                {t("admin_del_btn_add")}
              </AdminActionButton>
              <AdminActionButton variant="secondary" onClick={() => void load()}>
                {adminCta("refresh", ko)}
              </AdminActionButton>
            </div>
            {error ? (
              <p role="alert" className="sam-text-body text-sam-danger">
                {error}
              </p>
            ) : null}
          </div>
        </AdminCard>

        <AdminCard titleKey="admin_del_card_menu_list">
          {loadErr ? (
            <div className="mb-3">
              <AdminErrorState ko={ko} code={loadErr} onRetry={() => void load()} />
            </div>
          ) : null}
          {loading && rows.length === 0 ? (
            <AdminLoadingState ko={ko} label={t("common_loading")} />
          ) : rows.length === 0 && !error && !loadErr ? (
            <AdminEmptyState ko={ko} />
          ) : (
            <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
              <table className="w-full min-w-[820px] border-collapse sam-text-body">
                <thead>
                  <tr className="border-b border-sam-border bg-sam-app">
                    {tableHeaders.map((key) => (
                      <th
                        key={key}
                        className={`px-3 py-2 font-medium text-sam-fg ${
                          key === "admin_del_th_manage" ? "text-right" : "text-left"
                        } ${key === "admin_del_th_visible" || key === "admin_del_th_center" ? "text-center" : ""}`}
                      >
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const isEditing = editingId === r.id;
                    return (
                      <tr key={r.id} className="border-b border-sam-border-soft hover:bg-sam-app/50">
                        <td className="px-3 py-2 text-sam-muted">{r.sort_order}</td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <input
                              className="sam-input !h-9"
                              value={String(editDraft?.label ?? "")}
                              onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), label: e.target.value }))}
                            />
                          ) : (
                            <span className="font-medium text-sam-fg">{r.label}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <select
                              className="sam-input !h-9"
                              value={String(editDraft?.icon_key ?? "")}
                              onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), icon_key: e.target.value }))}
                            >
                              {BOTTOM_NAV_BUILTIN_ICON_KEYS.map((k) => (
                                <option key={k} value={k}>
                                  {k}
                                </option>
                              ))}
                              <option value={String(editDraft?.icon_key ?? "")}>
                                {t("admin_del_custom_icon_option", {
                                  key: String(editDraft?.icon_key ?? ""),
                                })}
                              </option>
                            </select>
                          ) : (
                            <span className="sam-text-helper text-sam-muted">{r.icon_key}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <input
                              className="sam-input !h-9 min-w-[260px]"
                              value={String(editDraft?.href ?? "")}
                              onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), href: e.target.value }))}
                            />
                          ) : (
                            <span className="sam-text-helper text-sam-muted">{r.href}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <AdminChipButton
                            selected={r.is_active}
                            disabled={rowBusy}
                            onClick={() => void updateRow(r, { is_active: !r.is_active })}
                            title={t("admin_del_toggle_visible_title")}
                          >
                            {r.is_active ? t("admin_del_state_on") : t("admin_del_state_off")}
                          </AdminChipButton>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <AdminChipButton
                            selected={r.is_center}
                            disabled={rowBusy || r.is_center}
                            onClick={() => void updateRow(r, { is_center: true })}
                            title={t("admin_del_center_only_one_title")}
                          >
                            {r.is_center ? t("admin_del_center_badge") : t("admin_del_normal_badge")}
                          </AdminChipButton>
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <input
                                className="sam-input !h-9 w-[120px]"
                                value={String(editDraft?.color ?? "")}
                                onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), color: e.target.value }))}
                              />
                              <input
                                type="color"
                                value={String(editDraft?.color ?? DEFAULT_NAV_COLOR)}
                                onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), color: e.target.value }))}
                                className="h-9 w-10 rounded border border-sam-border bg-sam-surface"
                                aria-label={t("admin_del_pick_color_aria")}
                              />
                            </div>
                          ) : (
                            <span className="sam-text-helper text-sam-muted">{r.color}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <AdminActionButton
                              variant="quiet"
                              size="sm"
                              onClick={() => void move(r.id, "up")}
                              disabled={idx === 0 || rowBusy}
                              title={t("admin_del_move_up_title")}
                              aria-label={t("admin_del_move_up_title")}
                            >
                              ▲
                            </AdminActionButton>
                            <AdminActionButton
                              variant="quiet"
                              size="sm"
                              onClick={() => void move(r.id, "down")}
                              disabled={idx === rows.length - 1 || rowBusy}
                              title={t("admin_del_move_down_title")}
                              aria-label={t("admin_del_move_down_title")}
                            >
                              ▼
                            </AdminActionButton>
                            {isEditing ? (
                              <>
                                <AdminActionButton
                                  variant="ghost"
                                  size="sm"
                                  disabled={saving}
                                  onClick={() => void saveEdit()}
                                >
                                  {adminCta("save", ko)}
                                </AdminActionButton>
                                <AdminActionButton variant="quiet" size="sm" disabled={saving} onClick={cancelEdit}>
                                  {adminCta("cancel", ko)}
                                </AdminActionButton>
                              </>
                            ) : (
                              <AdminActionButton variant="ghost" size="sm" onClick={() => enterEdit(r)}>
                                {adminCta("edit", ko)}
                              </AdminActionButton>
                            )}
                            {/* 행 버튼 = ghost/sm 2개 (수정·삭제, 편집 중엔 저장·취소) + ▲▼ 정렬 핸들. 삭제는 L3 재입력 확인 그대로 */}
                            {isEditing ? null : (
                            <AdminActionButton
                              variant="ghost"
                              size="sm"
                              disabled={rowBusy}
                              onClick={async () => {
                                const ok = await confirmAdminAction({
                                  level: adminActionLevel("delete"),
                                  ko,
                                  title: t("admin_del_confirm_delete"),
                                  confirmLabel: adminCta("delete", ko),
                                  destructive: true,
                                  retypeValue: r.label,
                                });
                                if (!ok.ok) return;
                                const res = await apiDelete(r.id, ok.reason);
                                if (!res.ok) {
                                  setError(errText(res.error));
                                  return;
                                }
                                if (editingId === r.id) cancelEdit();
                                await load();
                              }}
                            >
                              {adminCta("delete", ko)}
                            </AdminActionButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
        {/* DEF-40: 하단 메뉴 추가·수정·삭제·순서 변경 감사 기록 */}
        <AdminCard>
          <AdminConfigAuditHistoryPanel scope="bottom_nav" limit={20} refreshToken={rows.length + historyBump} />
        </AdminCard>
      </div>
    </div>
  );
}
