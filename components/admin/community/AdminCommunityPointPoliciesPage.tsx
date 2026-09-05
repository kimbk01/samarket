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

type TabId = "global" | "boards" | "payouts" | "reclaim";

type TopicRow = { id: string; slug: string; name: string; is_feed_sort?: boolean };

type LedgerItem = {
  ledgerId: string;
  userId: string;
  memberLabel: string;
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
  relatedId: string;
  execution: {
    id: string;
    boardKey: string;
    actionType: string;
    status: string;
    rewardType: string;
    basePoint: number;
    multiplier: number;
    finalPoint: number;
    snapshot: Record<string, unknown>;
    reversedAt: string | null;
  } | null;
};

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
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>("global");
  const [refresh, setRefresh] = useState(0);
  const { policies } = useAdminPointPolicyData(refresh);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [ledgerKind, setLedgerKind] = useState<"reward" | "reclaim">("reward");
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [detail, setDetail] = useState<LedgerItem | null>(null);

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

  useEffect(() => {
    if (tab !== "payouts" && tab !== "reclaim") return;
    const kind = tab === "reclaim" ? "reclaim" : "reward";
    setLedgerKind(kind);
    void (async () => {
      const res = await adminFetch(`/api/admin/community/point-ledger?kind=${kind}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { items?: LedgerItem[] };
      setLedger(Array.isArray(json.items) ? json.items : []);
    })();
  }, [tab, refresh]);

  const savePolicy = async (values: Partial<BoardPointPolicy>, fallback: BoardPointPolicy | null) => {
    const boardKey = String(values.boardKey ?? fallback?.boardKey ?? "general").toLowerCase();
    const full = {
      ...fallback,
      ...values,
      boardKey,
      boardName: values.boardName ?? fallback?.boardName ?? boardKey,
      id: values.id ?? fallback?.id,
    };
    await adminFetch("/api/admin/point-policies/board", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(full),
    });
    refreshAll();
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "global", label: t("admin_community_point_tab_global") },
    { id: "boards", label: t("admin_community_point_tab_boards") },
    { id: "payouts", label: t("admin_community_point_tab_payouts") },
    { id: "reclaim", label: t("admin_community_point_tab_reclaim") },
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
              labelKo: "Point 전체 운영 보기",
              labelEn: "View all Point ops",
              dataAttr: "community-point-to-finance",
            },
          ]}
          noteKo="커뮤니티 적립/회수 정책입니다. 원장은 공통 Point(board_point_policies)를 사용합니다."
          noteEn="Community earn/reclaim policies. Ledger uses shared Point (board_point_policies)."
        />
      </Suspense>
      <span className="sr-only" data-admin-writer="board_point_policies" />

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-ui-rect border px-3 py-1.5 sam-text-body ${
              tab === item.id
                ? "border-sam-primary bg-sam-primary/10 text-sam-primary"
                : "border-sam-border text-sam-muted"
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
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
                    globalPolicy
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
                    qnaPolicy
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
                        <button
                          type="button"
                          className="text-sam-primary hover:underline"
                          onClick={() => setSelectedTopic(tp.slug)}
                        >
                          {t("admin_topics_btn_edit")}
                        </button>
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
                await savePolicy(
                  {
                    ...values,
                    boardKey: selectedTopic.toLowerCase(),
                    boardName:
                      contentTopics.find((x) => x.slug === selectedTopic)?.name ?? selectedTopic,
                    policyLayer: "topic",
                    inheritGlobal: inherit,
                    id: byKey.get(selectedTopic.toLowerCase())?.id,
                  },
                  byKey.get(selectedTopic.toLowerCase()) ?? globalPolicy
                );
                setSelectedTopic(null);
              }}
            />
          ) : null}
        </AdminCard>
      ) : null}

      {tab === "payouts" || tab === "reclaim" ? (
        <AdminCard
          title={
            ledgerKind === "reclaim"
              ? t("admin_community_point_tab_reclaim")
              : t("admin_community_point_tab_payouts")
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left sam-text-body-secondary">
              <thead>
                <tr className="border-b border-sam-border text-sam-meta">
                  <th className="py-2 pr-2">{t("admin_community_point_col_time")}</th>
                  <th className="py-2 pr-2">{t("admin_community_point_col_member")}</th>
                  <th className="py-2 pr-2">{t("admin_community_point_col_board")}</th>
                  <th className="py-2 pr-2">{t("admin_community_point_col_amount")}</th>
                  <th className="py-2 pr-2">{t("admin_community_point_col_status")}</th>
                  <th className="py-2">{t("admin_posts_col_manage")}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((item) => (
                  <tr key={item.ledgerId} className="border-b border-sam-border-soft">
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {item.createdAt.replace("T", " ").slice(0, 16)}
                    </td>
                    <td className="py-2 pr-2">{item.memberLabel}</td>
                    <td className="py-2 pr-2">{item.execution?.boardKey ?? "—"}</td>
                    <td className="py-2 pr-2">
                      {item.execution
                        ? `${item.execution.basePoint} × ${item.execution.multiplier} = ${item.amount}`
                        : item.amount}
                    </td>
                    <td className="py-2 pr-2">{item.execution?.status ?? "ledger"}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        className="text-sam-primary hover:underline"
                        onClick={() => setDetail(item)}
                      >
                        {t("admin_community_point_drill")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ledger.length === 0 ? (
            <p className="mt-3 sam-text-body-secondary text-sam-muted">
              {t("admin_community_point_ledger_empty")}
            </p>
          ) : null}
          {detail ? (
            <div className="mt-4 rounded-ui-rect border border-sam-border p-3 sam-text-body-secondary">
              <p>ledger: {detail.ledgerId}</p>
              <p>execution: {detail.execution?.id ?? "—"}</p>
              <p>{detail.description}</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-sam-meta">
                {JSON.stringify(detail.execution?.snapshot ?? {}, null, 2)}
              </pre>
              <button
                type="button"
                className="mt-2 text-sam-primary hover:underline"
                onClick={() => setDetail(null)}
              >
                {t("admin_back_to_list")}
              </button>
            </div>
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
      <p className="font-medium">
        {props.name} ({props.slug})
      </p>
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
          <button
            type="button"
            className="rounded-ui-rect border border-sam-primary px-3 py-1 text-sam-primary"
            onClick={() => void props.onSave({ boardKey: props.slug }, true)}
          >
            {t("admin_community_point_save_inherit")}
          </button>
          <button type="button" className="text-sam-muted hover:underline" onClick={props.onClose}>
            {t("admin_back_to_list")}
          </button>
        </div>
      )}
    </div>
  );
}
