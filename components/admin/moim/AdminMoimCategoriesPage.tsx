"use client";

/**
 * 모임 카테고리 관리 (설계 moim §8) — 추가 · 이름(ko·en) · 순서 · 사용 중지 · 개설 금지 표시. 수정은 낙관적 잠금(409 → 다시 불러오기).
 */
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityListShell,
  CommunityTable,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import type { MoimAdminCategoryRow } from "@/lib/admin/moim/moim-admin-contract";
import { MOIM_ADMIN_FIELD, MOIM_ADMIN_REASON, moimAdminSend, useMoimSettleBanner } from "@/components/admin/moim/admin-moim-shared";

type ListResponse = { ok?: boolean; error?: string; categories?: MoimAdminCategoryRow[] };
type Draft = { id: string | null; slug: string; labelKo: string; labelEn: string; sortOrder: string; isActive: boolean; isRestricted: boolean; updatedAt: string | null };

const EMPTY: Draft = { id: null, slug: "", labelKo: "", labelEn: "", sortOrder: "0", isActive: true, isRestricted: false, updatedAt: null };

export function AdminMoimCategoriesPage() {
  const { t } = useI18n();
  const { state, reload } = useCommunityAdminJson<ListResponse>("/api/admin/moim/categories");
  const rows = state.data?.categories ?? [];
  const [draft, setDraft] = useState<Draft | null>(null);
  const { settle, node } = useMoimSettleBanner(reload);
  const valid =
    !!draft && /^[a-z0-9_]{2,40}$/.test(draft.slug.trim()) && draft.labelKo.trim().length > 0 && draft.labelEn.trim().length > 0 && /^-?\d+$/.test(draft.sortOrder.trim());

  return (
    <CommunityListShell
      title={t("admin_moim_categories_title")}
      description={t("admin_moim_categories_desc")}
      actions={
        <AdminActionButton size="sm" variant="primary" onClick={() => setDraft({ ...EMPTY, sortOrder: String((rows.at(-1)?.sortOrder ?? 0) + 10) })}>
          {t("admin_moim_category_add")}
        </AdminActionButton>
      }
      banner={node}
    >
      {state.status === "loading" && !state.data ? <AdminLoadingState ko /> : null}
      {state.status === "error" ? <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} /> : null}
      {state.status === "ok" && rows.length === 0 ? <AdminEmptyState ko message={t("admin_moim_categories_empty")} /> : null}
      {rows.length ? (
        <CommunityTable
          head={[
            t("admin_moim_category_col_order"),
            t("admin_moim_category_col_slug"),
            t("admin_moim_category_col_label_ko"),
            t("admin_moim_category_col_label_en"),
            t("admin_moim_col_status"),
            t("admin_moim_col_actions"),
          ]}
        >
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-sam-border-soft">
              <td className={COMMUNITY_TD}>{c.sortOrder}</td>
              <td className={`${COMMUNITY_TD} font-mono text-[12px]`}>{c.slug}</td>
              <td className={COMMUNITY_TD}>{c.labelKo}</td>
              <td className={COMMUNITY_TD}>{c.labelEn}</td>
              <td className={COMMUNITY_TD}>
                <div className="flex flex-wrap gap-1">
                  <AdminToneBadge tone={c.isActive ? "success" : "neutral"}>{t(c.isActive ? "admin_moim_category_active" : "admin_moim_category_inactive")}</AdminToneBadge>
                  {c.isRestricted ? <AdminToneBadge tone="danger">{t("admin_moim_category_restricted")}</AdminToneBadge> : null}
                </div>
              </td>
              <td className={COMMUNITY_TD}>
                <AdminActionButton
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setDraft({
                      id: c.id,
                      slug: c.slug,
                      labelKo: c.labelKo,
                      labelEn: c.labelEn,
                      sortOrder: String(c.sortOrder),
                      isActive: c.isActive,
                      isRestricted: c.isRestricted,
                      updatedAt: c.updatedAt,
                    })
                  }
                >
                  {t("admin_moim_edit")}
                </AdminActionButton>
              </td>
            </tr>
          ))}
        </CommunityTable>
      ) : null}
      {draft ? (
        <CommunityActionSheet
          title={t(draft.id ? "admin_moim_category_edit" : "admin_moim_category_add")}
          rows={[]}
          notice={t("admin_moim_category_notice")}
          reason={MOIM_ADMIN_REASON}
          ready={valid}
          confirmLabel={t("admin_moim_save")}
          onSubmit={(reason) =>
            moimAdminSend(
              "/api/admin/moim/categories",
              {
                id: draft.id,
                slug: draft.slug.trim(),
                labelKo: draft.labelKo.trim(),
                labelEn: draft.labelEn.trim(),
                sortOrder: Number(draft.sortOrder),
                isActive: draft.isActive,
                isRestricted: draft.isRestricted,
                expectedUpdatedAt: draft.updatedAt,
                reason,
              },
              t
            )
          }
          onClose={() => setDraft(null)}
          onSettled={(k) => {
            setDraft(null);
            settle(k);
          }}
        >
          <div className="grid gap-2 text-[13px]">
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{t("admin_moim_category_col_slug")}</span>
              <input className={MOIM_ADMIN_FIELD} value={draft.slug} maxLength={40} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase() })} />
              <span className="text-[12px] text-sam-muted">{t("admin_moim_category_slug_hint")}</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{t("admin_moim_category_col_label_ko")}</span>
              <input className={MOIM_ADMIN_FIELD} value={draft.labelKo} maxLength={40} onChange={(e) => setDraft({ ...draft, labelKo: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{t("admin_moim_category_col_label_en")}</span>
              <input className={MOIM_ADMIN_FIELD} value={draft.labelEn} maxLength={40} onChange={(e) => setDraft({ ...draft, labelEn: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sam-muted">{t("admin_moim_category_col_order")}</span>
              <input className={MOIM_ADMIN_FIELD} inputMode="numeric" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value.replace(/[^\d-]/g, "") })} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
              <span>{t("admin_moim_category_active")}</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.isRestricted} onChange={(e) => setDraft({ ...draft, isRestricted: e.target.checked })} />
              <span>{t("admin_moim_category_restricted")}</span>
            </label>
          </div>
        </CommunityActionSheet>
      ) : null}
    </CommunityListShell>
  );
}
