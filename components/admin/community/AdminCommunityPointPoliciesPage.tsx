"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminOpsCrossLinkBar } from "@/components/admin/AdminOpsCrossLinkBar";
import { AdminCard } from "@/components/admin/AdminCard";
import { BoardPointPolicyForm } from "@/components/admin/point-policies/BoardPointPolicyForm";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { useAdminPointPolicyData } from "@/hooks/useAdminPointPolicyData";
import {
  COMMUNITY_GLOBAL_BOARD_KEY,
  COMMUNITY_QNA_BOARD_KEY,
  communityPolicyAdminMode,
} from "@/lib/community-points/policy-resolver";
import type { BoardPointPolicy } from "@/lib/types/point-policy";
import { ARO_IA_001_FINANCE_POINT_POLICIES_PATH } from "@/lib/admin/aro-ia-001-community-common-links";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { AdminResultBanner, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";

type TabId = "global" | "boards";

type TopicRow = { id: string; slug: string; name: string; is_feed_sort?: boolean };

type SaveResult = { ok: true; message: string } | { ok: false; code: string } | null;

function formatRewardLine(
  p: BoardPointPolicy,
  which: "write" | "comment",
  labels: { none: string; random: string; fixed: string }
) {
  const type = which === "write" ? p.writeRewardType : p.commentRewardType;
  if (!p.isActive) return labels.none;
  if (type === "random") return labels.random;
  return labels.fixed;
}

export function AdminCommunityPointPoliciesPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [tab, setTab] = useState<TabId>("global");
  const [refresh, setRefresh] = useState(0);
  const { policies } = useAdminPointPolicyData(refresh);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveResult>(null);

  const byKey = useMemo(() => {
    const m = new Map<string, BoardPointPolicy>();
    for (const p of policies) m.set(String(p.boardKey).toLowerCase(), p);
    return m;
  }, [policies]);

  const globalPolicy = byKey.get(COMMUNITY_GLOBAL_BOARD_KEY) ?? null;
  const qnaPolicy = byKey.get(COMMUNITY_QNA_BOARD_KEY) ?? null;

  const contentTopics = useMemo(
    () => topics.filter((tp) => !tp.is_feed_sort),
    [topics]
  );

  const refreshAll = useCallback(() => setRefresh((r) => r + 1), []);

  useEffect(() => {
    void (async () => {
      const res = await adminFetch("/api/admin/community/topics", { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as { topics?: TopicRow[] };
      setTopics(Array.isArray(json.topics) ? json.topics : []);
    })();
  }, [refresh]);

  /**
   * 정책 저장 (설계 C-0-2 「정책 저장」 L3 · C-19) — 확인(사유 + 대상 이름 재입력) → 저장 → 응답 확인 → 결과 배너.
   * 실패하면 입력 화면을 그대로 두고 실패 배너를 보인다. 처리 중에는 다시 저장할 수 없다.
   */
  const savePolicy = async (
    values: Partial<BoardPointPolicy>,
    fallback: BoardPointPolicy | null,
    label: string
  ): Promise<boolean> => {
    if (saving) return false;
    const c = await confirmAdminAction({
      level: "L3",
      ko,
      title: ko ? "정책 저장" : "Save policy",
      description: ko
        ? `「${label}」 포인트 정책을 저장합니다. 저장하면 이후 글·댓글 보상에 바로 적용됩니다.`
        : `Save the "${label}" point policy. It applies to new rewards immediately.`,
      confirmLabel: ko ? "정책 저장" : "Save policy",
      retypeValue: label,
    });
    if (!c.ok) return false;
    const boardKey = String(values.boardKey ?? fallback?.boardKey ?? "general").toLowerCase();
    const full = {
      ...fallback,
      ...values,
      boardKey,
      boardName: values.boardName ?? fallback?.boardName ?? boardKey,
      id: values.id ?? fallback?.id,
    };
    setSaving(true);
    setResult(null);
    try {
      const res = await adminFetch("/api/admin/point-policies/board", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...full, reason: c.reason }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        audit_warning?: string;
      };
      if (!res.ok || json.ok !== true) {
        setResult({ ok: false, code: json.error || (res.status === 403 ? "forbidden" : "save_failed") });
        return false;
      }
      const saved = ko ? `「${label}」 정책을 저장했습니다.` : `Saved "${label}".`;
      setResult({
        ok: true,
        message:
          json.audit_warning === "audit_failed"
            ? `${saved} ${
                ko
                  ? "단, 작업 기록 저장에 실패했습니다. 시스템 관리자에게 알려 주세요."
                  : "However, the activity log could not be saved. Tell a system admin."
              }`
            : saved,
      });
      refreshAll();
      return true;
    } catch {
      setResult({ ok: false, code: "network_error" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "global", label: t("admin_community_point_tab_global") },
    { id: "boards", label: t("admin_community_point_tab_boards") },
  ];

  return (
    <div className="space-y-4 text-sam-fg" data-aro-ops-ux-001-w3="1" data-admin-mgmt-proof="community-point-policies">
      <AdminPageHeader
        titleKey="admin_community_point_page_title"
        description={t("admin_community_point_page_desc")}
      />
      <Suspense fallback={null}>
        <AdminOpsCrossLinkBar
          links={[
            {
              href: ARO_IA_001_FINANCE_POINT_POLICIES_PATH,
              labelKo: "포인트 전체 운영 보기",
              labelEn: "View all Point ops",
              dataAttr: "community-point-to-finance",
            },
          ]}
          noteKo="커뮤니티 글·댓글 보상 정책입니다. 포인트는 전체 서비스 공통입니다."
          noteEn="Community post/comment reward policies. Points are shared across the service."
        />
      </Suspense>
      <span className="sr-only" data-admin-writer="board_point_policies" />

      {saving ? (
        <p role="status" className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-muted">
          {ko ? "저장 중…" : "Saving…"}
        </p>
      ) : null}
      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
      <p className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-muted">
        {ko ? "지급·회수된 보상 내역은 포인트 내역 화면에서 확인합니다." : "Reward payouts and reclaims are in the point history screen."}
        <AdminActionLink href="/admin/community/points?type=community_reward" variant="ghost">
          {ko ? "포인트 내역 보기" : "Open point history"}
        </AdminActionLink>
      </p>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <AdminChipButton key={item.id} selected={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </AdminChipButton>
        ))}
      </div>

      {tab === "global" ? (
        <div className="space-y-4">
          <AdminCard title={t("admin_community_point_global_title")}>
            {globalPolicy ? (
              <BoardPointPolicyForm
                initial={globalPolicy}
                onSubmit={(values) =>
                  void savePolicy(
                    {
                      ...values,
                      boardKey: COMMUNITY_GLOBAL_BOARD_KEY,
                      policyLayer: "global",
                      inheritGlobal: false,
                    },
                    globalPolicy,
                    t("admin_community_point_global_title")
                  )
                }
              />
            ) : (
              <p className="sam-text-body-secondary text-sam-muted">{t("admin_community_point_empty")}</p>
            )}
          </AdminCard>
          <AdminCard title={t("admin_community_point_qna_title")}>
            {qnaPolicy ? (
              <BoardPointPolicyForm
                initial={qnaPolicy}
                onSubmit={(values) =>
                  void savePolicy(
                    {
                      ...values,
                      boardKey: COMMUNITY_QNA_BOARD_KEY,
                      policyLayer: "qna",
                      inheritGlobal: false,
                    },
                    qnaPolicy,
                    t("admin_community_point_qna_title")
                  )
                }
              />
            ) : (
              <p className="sam-text-body-secondary text-sam-muted">{t("admin_community_point_empty")}</p>
            )}
          </AdminCard>
        </div>
      ) : null}

      {tab === "boards" ? (
        <AdminCard title={t("admin_community_point_tab_boards")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left sam-text-body-secondary">
              <thead>
                <tr className="border-b border-sam-border text-sam-meta">
                  <th className="py-2 pr-2">{t("admin_community_point_col_board")}</th>
                  <th className="py-2 pr-2">{t("admin_community_point_col_mode")}</th>
                  <th className="py-2 pr-2">{t("admin_community_point_col_post_reward")}</th>
                  <th className="py-2 pr-2">{t("admin_community_point_col_comment_reward")}</th>
                  <th className="py-2">{t("admin_posts_col_manage")}</th>
                </tr>
              </thead>
              <tbody>
                {contentTopics.map((tp) => {
                  const row = byKey.get(tp.slug.toLowerCase()) ?? null;
                  const mode = communityPolicyAdminMode(row);
                  const shown =
                    mode === "override" && row
                      ? row
                      : tp.slug.toLowerCase() === "question" || tp.slug.toLowerCase() === "qna"
                        ? qnaPolicy ?? globalPolicy
                        : globalPolicy;
                  return (
                    <tr key={tp.id} className="border-b border-sam-border-soft">
                      <td className="py-2 pr-2 font-medium">{tp.name}</td>
                      <td className="py-2 pr-2">
                        {mode === "override"
                          ? t("admin_community_point_override")
                          : t("admin_community_point_inherit")}
                      </td>
                      <td className="py-2 pr-2">
                        {shown
                          ? formatRewardLine(shown, "write", {
                              none: t("admin_community_point_none"),
                              random: t("admin_community_point_reward_random", {
                                min: shown.writeRandomMin,
                                max: shown.writeRandomMax,
                              }),
                              fixed: t("admin_community_point_reward_fixed", {
                                n: shown.writeFixedPoint,
                              }),
                            })
                          : "—"}
                      </td>
                      <td className="py-2 pr-2">
                        {shown
                          ? formatRewardLine(shown, "comment", {
                              none: t("admin_community_point_none"),
                              random: t("admin_community_point_reward_random", {
                                min: shown.commentRandomMin,
                                max: shown.commentRandomMax,
                              }),
                              fixed: t("admin_community_point_reward_fixed", {
                                n: shown.commentFixedPoint,
                              }),
                            })
                          : "—"}
                      </td>
                      <td className="py-2">
                        <AdminActionButton variant="ghost" size="sm" onClick={() => setSelectedTopic(tp.slug)}>
                          {t("admin_topics_btn_edit")}
                        </AdminActionButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {selectedTopic ? (
            <TopicOverrideEditor
              slug={selectedTopic}
              name={contentTopics.find((x) => x.slug === selectedTopic)?.name ?? selectedTopic}
              existing={byKey.get(selectedTopic.toLowerCase()) ?? null}
              globalPolicy={globalPolicy}
              onClose={() => setSelectedTopic(null)}
              onSave={async (values, inherit) => {
                const topicName = contentTopics.find((x) => x.slug === selectedTopic)?.name ?? selectedTopic;
                const ok = await savePolicy(
                  {
                    ...values,
                    boardKey: selectedTopic.toLowerCase(),
                    boardName:
                      contentTopics.find((x) => x.slug === selectedTopic)?.name ?? selectedTopic,
                    policyLayer: "topic",
                    inheritGlobal: inherit,
                    id: byKey.get(selectedTopic.toLowerCase())?.id,
                  },
                  byKey.get(selectedTopic.toLowerCase()) ?? globalPolicy,
                  topicName
                );
                if (ok) setSelectedTopic(null);
              }}
            />
          ) : null}
        </AdminCard>
      ) : null}

    </div>
  );
}

function TopicOverrideEditor(props: {
  slug: string;
  name: string;
  existing: BoardPointPolicy | null;
  globalPolicy: BoardPointPolicy | null;
  onClose: () => void;
  onSave: (values: Partial<BoardPointPolicy>, inherit: boolean) => Promise<void>;
}) {
  const { t } = useI18n();
  const [inherit, setInherit] = useState(communityPolicyAdminMode(props.existing) !== "override");
  const initial = props.existing ?? props.globalPolicy;

  return (
    <div className="mt-4 space-y-3 rounded-ui-rect border border-sam-border p-3">
      <p className="font-medium">{props.name}</p>
      <AdminTechDetails ko>board_key: {props.slug}</AdminTechDetails>
      <div className="flex gap-3">
        <label className="flex items-center gap-2">
          <input type="radio" checked={inherit} onChange={() => setInherit(true)} />
          {t("admin_community_point_inherit")}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={!inherit} onChange={() => setInherit(false)} />
          {t("admin_community_point_override")}
        </label>
      </div>
      {!inherit && initial ? (
        <BoardPointPolicyForm
          initial={{ ...initial, boardKey: props.slug, boardName: props.name }}
          onCancel={props.onClose}
          onSubmit={(values) => void props.onSave(values, false)}
        />
      ) : (
        <div className="flex gap-2">
          <AdminActionButton variant="secondary" size="sm" onClick={() => void props.onSave({ boardKey: props.slug }, true)}>
            {t("admin_community_point_save_inherit")}
          </AdminActionButton>
          <AdminActionButton variant="quiet" size="sm" onClick={props.onClose}>
            {t("admin_back_to_list")}
          </AdminActionButton>
        </div>
      )}
    </div>
  );
}
