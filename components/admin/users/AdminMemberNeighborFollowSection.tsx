"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

type Item = {
  id: string;
  peerId: string;
  name: string;
  dibayId: string | null;
  status: string | null;
  createdAt: string;
};
type Payload = { outgoing: { total: number; items: Item[] }; incoming: { total: number; items: Item[] } };

/**
 * 어드민 회원 상세 › 커뮤니티 › 관심이웃 (관심이웃 설계 E).
 * 레거시(당근 FAQ 102): 사용자 요청에 따라 모아보기 노출을 지운다 → 운영자가 관계 행을 지우고 감사 기록을 남긴다.
 */
export function AdminMemberNeighborFollowSection({ userId, memberName }: { userId: string; memberName: string }) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ok"; data: Payload }>({
    kind: "loading",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/neighbor-relations`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as Partial<Payload> & { ok?: boolean };
      if (!res.ok || !json.ok || !json.outgoing || !json.incoming) {
        setState({ kind: "error" });
        return;
      }
      setState({ kind: "ok", data: { outgoing: json.outgoing, incoming: json.incoming } });
    } catch {
      setState({ kind: "error" });
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (item: Item, direction: "outgoing" | "incoming") => {
    const from = direction === "outgoing" ? memberName : item.name;
    const to = direction === "outgoing" ? item.name : memberName;
    /** 되돌릴 수 없는 삭제 — 사유 필수(감사 기록에 남김), 재입력 없음 */
    const confirmed = await confirmAdminAction({
      action: "delete",
      ko,
      destructive: true,
      title: t("admin_users_cc_neighbors_remove_title"),
      description: t("admin_users_cc_neighbors_remove_desc", { from, to }),
      confirmLabel: t("admin_users_cc_neighbors_remove"),
    });
    if (!confirmed.ok) return;
    setBusyId(item.id);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}/neighbor-relations?id=${encodeURIComponent(item.id)}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: confirmed.reason ?? "" }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        setActionError(t("admin_users_cc_neighbors_remove_failed"));
        return;
      }
      await load();
    } catch {
      setActionError(t("admin_users_cc_neighbors_remove_failed"));
    } finally {
      setBusyId(null);
    }
  };

  if (state.kind === "loading") {
    return <div className="py-8 text-center text-sm text-sam-muted">{t("admin_users_detail_loading")}</div>;
  }
  if (state.kind === "error") {
    return <div className="py-8 text-center text-sm font-semibold text-sam-danger">{t("admin_users_cc_load_failed")}</div>;
  }

  const block = (direction: "outgoing" | "incoming") => {
    const part = state.data[direction];
    return (
      <section className="min-w-0" data-testid={`admin-neighbor-${direction}`}>
        <h3 className="px-3 py-2 text-[13px] font-semibold text-sam-fg">
          {t(direction === "outgoing" ? "admin_users_cc_neighbors_outgoing" : "admin_users_cc_neighbors_incoming", {
            count: part.total,
          })}
        </h3>
        {part.items.length === 0 ? (
          <p className="px-3 pb-3 text-[13px] text-sam-muted">{t("admin_users_cc_neighbors_empty")}</p>
        ) : (
          <table className="min-w-full border-collapse text-[13px]">
            <tbody>
              {part.items.map((item) => (
                <tr key={item.id} className="border-t border-sam-border">
                  <td className="px-3 py-2 font-medium text-sam-fg">
                    <Link href={`/admin/users/${encodeURIComponent(item.peerId)}`} className="hover:underline">
                      {item.name}
                    </Link>
                    {item.dibayId ? <span className="ml-1 text-sam-muted">@{item.dibayId}</span> : null}
                    {item.status === "deleted" ? <span className="ml-1 text-sam-danger">({item.status})</span> : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-sam-muted">{formatAdminManilaDateTime(item.createdAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <AdminActionButton
                      variant="danger"
                      size="sm"
                      disabled={busyId === item.id}
                      onClick={() => void remove(item, direction)}
                    >
                      {t("admin_users_cc_neighbors_remove")}
                    </AdminActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-2" data-testid="admin-member-neighbor-follow">
      {actionError ? <p className="px-3 pt-2 text-[13px] font-semibold text-sam-danger">{actionError}</p> : null}
      {block("outgoing")}
      {block("incoming")}
    </div>
  );
}
