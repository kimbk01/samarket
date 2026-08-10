"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { useAdminPointPolicyData } from "@/hooks/useAdminPointPolicyData";
import { BoardPointPolicyForm } from "@/components/admin/point-policies/BoardPointPolicyForm";
import type { BoardPointPolicy } from "@/lib/types/point-policy";

const COMMUNITY_BOARD_KEYS = new Set(["general", "qna"]);

/**
 * Community Admin — board_point_policies for general/qna only.
 * Topic-slug policies HOLD. Reuses existing point policy APIs/executor.
 */
export function AdminCommunityPointPoliciesPage() {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { policies } = useAdminPointPolicyData(refresh);

  const communityPolicies = useMemo(
    () => policies.filter((p) => COMMUNITY_BOARD_KEYS.has(String(p.boardKey ?? "").toLowerCase())),
    [policies]
  );

  const selected = useMemo(
    () => (selectedId ? communityPolicies.find((p) => p.id === selectedId) ?? null : null),
    [communityPolicies, selectedId]
  );

  useEffect(() => {
    if (!selectedId && communityPolicies[0]?.id) {
      setSelectedId(communityPolicies[0].id);
    }
  }, [communityPolicies, selectedId]);

  const refreshAll = useCallback(() => setRefresh((r) => r + 1), []);

  const handleSave = async (values: Partial<BoardPointPolicy>) => {
    const boardKey = String(values.boardKey ?? selected?.boardKey ?? "").toLowerCase();
    if (!COMMUNITY_BOARD_KEYS.has(boardKey)) {
      alert(t("admin_community_point_board_key_hold"));
      return;
    }
    const full: Omit<BoardPointPolicy, "id" | "updatedAt"> & { id?: string } = {
      boardKey,
      boardName: values.boardName ?? selected?.boardName ?? boardKey,
      isActive: values.isActive ?? selected?.isActive ?? true,
      writeRewardType: values.writeRewardType ?? selected?.writeRewardType ?? "fixed",
      writeFixedPoint: values.writeFixedPoint ?? selected?.writeFixedPoint ?? 0,
      writeRandomMin: values.writeRandomMin ?? selected?.writeRandomMin ?? 0,
      writeRandomMax: values.writeRandomMax ?? selected?.writeRandomMax ?? 0,
      writeCooldownSeconds: values.writeCooldownSeconds ?? selected?.writeCooldownSeconds ?? 0,
      commentRewardType: values.commentRewardType ?? selected?.commentRewardType ?? "fixed",
      commentFixedPoint: values.commentFixedPoint ?? selected?.commentFixedPoint ?? 0,
      commentRandomMin: values.commentRandomMin ?? selected?.commentRandomMin ?? 0,
      commentRandomMax: values.commentRandomMax ?? selected?.commentRandomMax ?? 0,
      commentCooldownSeconds: values.commentCooldownSeconds ?? selected?.commentCooldownSeconds ?? 0,
      likeRewardPoint: values.likeRewardPoint ?? selected?.likeRewardPoint ?? 0,
      reportRewardPoint: values.reportRewardPoint ?? selected?.reportRewardPoint ?? 0,
      maxFreeUserPointCap: values.maxFreeUserPointCap ?? selected?.maxFreeUserPointCap ?? 500,
      eventMultiplierEnabled: values.eventMultiplierEnabled ?? selected?.eventMultiplierEnabled ?? false,
      adminMemo: values.adminMemo ?? selected?.adminMemo,
      id: selected?.id,
    };
    await adminFetch("/api/admin/point-policies/board", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(full),
    });
    refreshAll();
  };

  return (
    <div className="space-y-4 text-sam-fg">
      <AdminPageHeader
        titleKey="admin_community_point_page_title"
        description={t("admin_community_point_page_desc")}
      />

      <p className="sam-text-body-secondary text-sam-muted">{t("admin_community_point_hold_note")}</p>
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_community_point_reclaim_note")}</p>

      <AdminCard title={t("admin_community_point_list_title")}>
        {communityPolicies.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{t("admin_community_point_empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left sam-text-body-secondary">
              <thead>
                <tr className="border-b border-sam-border text-sam-meta">
                  <th className="py-2 pr-2">{t("admin_community_point_col_board")}</th>
                  <th className="py-2 pr-2">{t("admin_community_point_col_active")}</th>
                  <th className="py-2 pr-2">{t("admin_community_point_col_post_reward")}</th>
                  <th className="py-2 pr-2">{t("admin_community_point_col_comment_reward")}</th>
                  <th className="py-2">{t("admin_posts_col_manage")}</th>
                </tr>
              </thead>
              <tbody>
                {communityPolicies.map((p) => (
                  <tr key={p.id} className="border-b border-sam-border-soft">
                    <td className="py-2 pr-2 font-medium">{p.boardName || p.boardKey}</td>
                    <td className="py-2 pr-2">{p.isActive ? "Y" : "N"}</td>
                    <td className="py-2 pr-2">
                      {p.isActive === false
                        ? t("admin_community_point_none")
                        : `${p.writeRewardType} · ${
                            p.writeRewardType === "random"
                              ? `${p.writeRandomMin}-${p.writeRandomMax}`
                              : p.writeFixedPoint
                          }`}
                    </td>
                    <td className="py-2 pr-2">
                      {p.isActive === false
                        ? t("admin_community_point_none")
                        : `${p.commentRewardType} · ${
                            p.commentRewardType === "random"
                              ? `${p.commentRandomMin}-${p.commentRandomMax}`
                              : p.commentFixedPoint
                          }`}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        className="text-sam-primary hover:underline"
                        onClick={() => setSelectedId(p.id)}
                      >
                        {t("admin_topics_btn_edit")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {selected ? (
        <AdminCard title={`${t("admin_community_point_edit_title")}: ${selected.boardKey}`}>
          <BoardPointPolicyForm
            initial={selected}
            onCancel={() => setSelectedId(null)}
            onSubmit={handleSave}
          />
        </AdminCard>
      ) : null}
    </div>
  );
}
