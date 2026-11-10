"use client";

/**
 * 어드민 「문의 유형 관리」 (고객센터 접수형 3단계 · Owner 「3단계 진행」 2026-11-10).
 * 분야·세부의 이름(한국어·영어) · 순서 · 앱 노출을 바꾼다. 정의·서버 판정은 코드 그대로.
 * 숨김 = 고객 선택 목록에서만 빠짐. 「기타」 분야와 각 「기타」 세부는 숨길 수 없다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { listIssueTypesForCategory, type SupportAudience } from "@/lib/support/support-category-registry";
import {
  SUPPORT_CATEGORY_LABEL_EN_MAX,
  SUPPORT_CATEGORY_LABEL_KO_MAX,
  adminEditableSupportCategories,
  indexSupportCategorySettings,
  isSupportCategoryHideLocked,
  orderSupportCategories,
  orderSupportIssues,
  supportCategorySettingKey,
  type SupportCategorySettingRow,
  type SupportCategorySettingsIndex,
} from "@/lib/support/support-category-settings";
import { SUPPORT_TICKET_STORE_LESS_ONLY_CATEGORIES } from "@/lib/support/support-ticket-form";
import { supportErrorLabel } from "@/lib/support/support-display-labels";

type Item = { categoryId: string; issueId: string; labelKey: string };

type SaveInput = {
  audience: SupportAudience;
  categoryId: string;
  issueId: string;
  labelKo: string | null;
  labelEn: string | null;
  sortOrder: number | null;
  hidden: boolean;
};

function rowOf(index: SupportCategorySettingsIndex, audience: SupportAudience, categoryId: string, issueId: string) {
  return index.get(supportCategorySettingKey(audience, categoryId, issueId)) ?? null;
}

function SettingRow({
  audience,
  item,
  row,
  position,
  count,
  nested,
  disabled,
  issueCount,
  expanded,
  onToggleIssues,
  onMove,
  onSave,
}: {
  audience: SupportAudience;
  item: Item;
  row: SupportCategorySettingRow | null;
  position: number;
  count: number;
  nested: boolean;
  disabled: boolean;
  issueCount?: number;
  expanded?: boolean;
  onToggleIssues?: () => void;
  onMove: (dir: -1 | 1) => void;
  onSave: (patch: Partial<SaveInput>) => Promise<boolean>;
}) {
  const { t, safeT, language } = useI18n();
  const defaultKo = translateBy("ko", item.labelKey as MessageKey);
  const defaultEn = translateBy("en", item.labelKey as MessageKey);
  const [ko, setKo] = useState(row?.label_ko ?? "");
  const [en, setEn] = useState(row?.label_en ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setKo(row?.label_ko ?? "");
    setEn(row?.label_en ?? "");
  }, [row?.label_ko, row?.label_en]);

  const locked = isSupportCategoryHideLocked(item.categoryId, item.issueId);
  const hidden = row?.hidden === true && !locked;
  const isOther = item.issueId ? item.issueId === "OTHER" : item.categoryId === "OTHER";
  const dirty = (ko.trim() || null) !== (row?.label_ko ?? null) || (en.trim() || null) !== (row?.label_en ?? null);
  const shownName = ko.trim() || defaultKo;
  const storeLessOnly =
    !item.issueId && audience === "MEMBER" && SUPPORT_TICKET_STORE_LESS_ONLY_CATEGORIES.includes(item.categoryId);

  const run = async (patch: Partial<SaveInput>) => {
    setBusy(true);
    try {
      await onSave(patch);
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr
      className={`border-b border-sam-border-soft ${hidden ? "bg-sam-surface-muted" : ""}`}
      data-admin-support-category={item.issueId ? `${item.categoryId}/${item.issueId}` : item.categoryId}
    >
      <td className="w-[88px] px-2 py-2 align-middle">
        <div className="flex gap-1">
          <AdminActionButton
            size="sm"
            variant="quiet"
            aria-label={t("admin_support_cat_up")}
            disabled={disabled || busy || isOther || position === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </AdminActionButton>
          <AdminActionButton
            size="sm"
            variant="quiet"
            aria-label={t("admin_support_cat_down")}
            disabled={disabled || busy || isOther || position >= count - 2}
            onClick={() => onMove(1)}
          >
            ↓
          </AdminActionButton>
        </div>
      </td>
      <td className={`px-2 py-2 align-middle ${nested ? "pl-8" : ""}`}>
        <input
          value={ko}
          maxLength={SUPPORT_CATEGORY_LABEL_KO_MAX}
          disabled={disabled || busy}
          onChange={(e) => setKo(e.target.value)}
          placeholder={defaultKo}
          aria-label={t("admin_support_cat_col_name")}
          className="h-9 w-full min-w-0 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-sm text-sam-fg"
        />
        {storeLessOnly ? (
          <p className="mt-1 text-xs text-sam-muted">{t("admin_support_cat_store_less")}</p>
        ) : null}
      </td>
      <td className="px-2 py-2 align-middle">
        <input
          value={en}
          maxLength={SUPPORT_CATEGORY_LABEL_EN_MAX}
          disabled={disabled || busy}
          onChange={(e) => setEn(e.target.value)}
          placeholder={defaultEn}
          aria-label={t("admin_support_cat_col_name_en")}
          className="h-9 w-full min-w-0 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-sm text-sam-fg"
        />
      </td>
      <td className="w-[84px] px-2 py-2 text-center align-middle">
        <span
          className={`inline-block rounded-ui-rect px-2 py-0.5 text-xs font-semibold ${
            locked
              ? "bg-sam-surface-muted text-sam-muted"
              : hidden
                ? "bg-sam-danger-soft text-sam-danger"
                : "bg-sam-success-soft text-sam-success"
          }`}
        >
          {locked ? t("admin_support_cat_locked") : hidden ? t("admin_support_cat_hidden") : t("admin_support_cat_visible")}
        </span>
      </td>
      <td className="w-[260px] px-2 py-2 align-middle">
        <div className="flex flex-wrap justify-end gap-1">
          <AdminActionButton
            size="sm"
            variant="primary"
            disabled={disabled || busy || !dirty}
            onClick={() => void run({ labelKo: ko.trim() || null, labelEn: en.trim() || null })}
          >
            {t("admin_support_cat_save")}
          </AdminActionButton>
          {locked ? null : hidden ? (
            <AdminActionButton size="sm" variant="secondary" disabled={disabled || busy} onClick={() => void run({ hidden: false })}>
              {t("admin_support_cat_show")}
            </AdminActionButton>
          ) : (
            <AdminActionButton
              size="sm"
              variant="danger"
              disabled={disabled || busy}
              onClick={() => {
                void (async () => {
                  const confirmed = await confirmAdminAction({
                    level: adminActionLevel("exposeStop"),
                    ko: language === "ko",
                    title: t("admin_support_cat_hide_confirm_title", { name: shownName }),
                    description: safeT("admin_support_cat_hide_confirm_body"),
                    confirmLabel: t("admin_support_cat_hide"),
                    destructive: true,
                  });
                  if (confirmed.ok) await run({ hidden: true });
                })();
              }}
            >
              {t("admin_support_cat_hide")}
            </AdminActionButton>
          )}
          {onToggleIssues ? (
            <AdminActionButton size="sm" variant="neutral" onClick={onToggleIssues} aria-expanded={expanded}>
              {expanded ? t("admin_support_cat_issues_close") : t("admin_support_cat_issues", { count: issueCount ?? 0 })}
            </AdminActionButton>
          ) : null}
        </div>
        {row?.updated_at ? (
          <p className="mt-1 text-right text-xs text-sam-muted">{formatAdminManilaDateTime(row.updated_at)}</p>
        ) : null}
      </td>
    </tr>
  );
}

export function AdminSupportCategoriesPage() {
  const { t, safeT, language } = useI18n();
  const ko = language === "ko";
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);
  const [audience, setAudience] = useState<SupportAudience>("MEMBER");
  const [rows, setRows] = useState<SupportCategorySettingRow[]>([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openIssues, setOpenIssues] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/support/category-settings", { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        rows?: SupportCategorySettingRow[];
        tableMissing?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "load_failed");
        setErrorStatus(res.status);
        return;
      }
      setRows(json.rows ?? []);
      setTableMissing(json.tableMissing === true);
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const index = useMemo(() => indexSupportCategorySettings(rows), [rows]);
  const categories = useMemo(
    () => orderSupportCategories(index, audience, adminEditableSupportCategories(audience)),
    [index, audience]
  );

  const save = useCallback(
    async (input: SaveInput): Promise<boolean> => {
      setSaveError(null);
      try {
        const res = await fetch("/api/admin/support/category-settings", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; row?: SupportCategorySettingRow; error?: string } | null;
        if (!res.ok || !json?.ok || !json.row) {
          setSaveError(json?.error ?? "update_failed");
          return false;
        }
        const saved = json.row;
        setRows((prev) => {
          const key = supportCategorySettingKey(saved.audience, saved.category_id, saved.issue_id);
          const rest = prev.filter((r) => supportCategorySettingKey(r.audience, r.category_id, r.issue_id) !== key);
          return [...rest, saved];
        });
        return true;
      } catch {
        setSaveError("network_error");
        return false;
      }
    },
    []
  );

  const saveItem = useCallback(
    (item: Item, patch: Partial<SaveInput>) => {
      const row = rowOf(index, audience, item.categoryId, item.issueId);
      return save({
        audience,
        categoryId: item.categoryId,
        issueId: item.issueId,
        labelKo: row?.label_ko ?? null,
        labelEn: row?.label_en ?? null,
        sortOrder: row?.sort_order ?? null,
        hidden: row?.hidden === true,
        ...patch,
      });
    },
    [index, audience, save]
  );

  /** 순서 바꾸기 — 바뀐 목록 전체에 10 단위 순서를 다시 매기고, 값이 달라진 항목만 저장 */
  const move = useCallback(
    async (list: Item[], position: number, dir: -1 | 1) => {
      const target = position + dir;
      if (target < 0 || target >= list.length) return;
      const next = [...list];
      [next[position], next[target]] = [next[target], next[position]];
      setBusy(true);
      try {
        for (let i = 0; i < next.length; i += 1) {
          const it = next[i];
          if ((it.issueId ? it.issueId : it.categoryId) === "OTHER") continue;
          const want = i * 10;
          const row = rowOf(index, audience, it.categoryId, it.issueId);
          if (row?.sort_order === want) continue;
          const ok = await saveItem(it, { sortOrder: want });
          if (!ok) break;
        }
      } finally {
        setBusy(false);
      }
    },
    [index, audience, saveItem]
  );

  const categoryItems: Item[] = categories.map((c) => ({ categoryId: c.id, issueId: "", labelKey: c.labelKey }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" data-admin-support-categories="1">
      <AdminPageHeader title={safeT("admin_menu_cp_support_categories")} description={safeT("admin_support_cat_desc")} />
      <div className="flex items-center gap-2">
        <AdminTabs
          className="flex-1"
          ariaLabel={safeT("admin_menu_cp_support_categories")}
          tabs={[
            { id: "MEMBER", label: t("admin_support_cat_tab_member") },
            { id: "OWNER", label: t("admin_support_cat_tab_owner") },
          ]}
          value={audience}
          syncUrl={false}
          onChange={(id) => {
            setAudience(id === "OWNER" ? "OWNER" : "MEMBER");
            setOpenIssues(null);
          }}
        />
        <Link href="/admin/support" className="ml-auto text-sm text-sam-primary underline">
          {safeT("admin_support_title")}
        </Link>
      </div>
      {tableMissing ? (
        <p className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-sm text-sam-fg" data-admin-support-cat-table-missing="1">
          {t("admin_support_cat_table_missing")}
        </p>
      ) : null}
      {saveError ? (
        <p className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 text-sm text-sam-danger" role="alert">
          {supportErrorLabel(safeT, saveError)}
        </p>
      ) : null}
      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : error ? (
        <AdminErrorState ko={ko} code={error} httpStatus={errorStatus} onRetry={() => void load()} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border-soft bg-sam-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-sam-border-soft bg-sam-surface-muted text-left text-xs text-sam-muted">
                <th className="px-2 py-2 font-semibold">{t("admin_support_cat_col_order")}</th>
                <th className="px-2 py-2 font-semibold">{t("admin_support_cat_col_name")}</th>
                <th className="px-2 py-2 font-semibold">{t("admin_support_cat_col_name_en")}</th>
                <th className="px-2 py-2 text-center font-semibold">{t("admin_support_cat_col_visible")}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {categoryItems.map((item, position) => {
                const issues = orderSupportIssues(index, audience, item.categoryId, listIssueTypesForCategory(item.categoryId));
                const issueItems: Item[] = issues.map((i) => ({ categoryId: item.categoryId, issueId: i.id, labelKey: i.labelKey }));
                const expanded = openIssues === item.categoryId;
                return [
                  <SettingRow
                    key={item.categoryId}
                    audience={audience}
                    item={item}
                    row={rowOf(index, audience, item.categoryId, "")}
                    position={position}
                    count={categoryItems.length}
                    nested={false}
                    disabled={tableMissing || busy}
                    issueCount={issueItems.length}
                    expanded={expanded}
                    onToggleIssues={() => setOpenIssues(expanded ? null : item.categoryId)}
                    onMove={(dir) => void move(categoryItems, position, dir)}
                    onSave={(patch) => saveItem(item, patch)}
                  />,
                  ...(expanded
                    ? issueItems.map((iss, ip) => (
                        <SettingRow
                          key={`${item.categoryId}/${iss.issueId}`}
                          audience={audience}
                          item={iss}
                          row={rowOf(index, audience, iss.categoryId, iss.issueId)}
                          position={ip}
                          count={issueItems.length}
                          nested
                          disabled={tableMissing || busy}
                          onMove={(dir) => void move(issueItems, ip, dir)}
                          onSave={(patch) => saveItem(iss, patch)}
                        />
                      ))
                    : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-sam-muted">{t("admin_support_cat_locked_hint")}</p>
    </div>
  );
}
