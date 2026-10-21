"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { resolveOwnerActiveStoreIdFromOwnedList } from "@/lib/delivery/owner/resolve-owner-active-store";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { ownerFetchJson } from "@/lib/business/owner-fetch-json";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { OwnerStateView } from "@/components/business/owner/OwnerStateView";
import { useOwnerToast } from "@/components/business/owner/OwnerToastHost";

type ReviewRow = {
  id: string;
  order_id: string;
  /** IA-15 — 주문번호 (API 추가 필드) */
  order_no?: string | null;
  buyer_public_label: string;
  rating: number;
  content: string;
  status: string;
  visible_to_public: boolean;
  image_urls: string[];
  created_at: string;
  owner_reply_content: string | null;
  owner_reply_created_at: string | null;
};

export function OwnerStoreReviewsView() {
  const { t, language } = useI18n();
  const toast = useOwnerToast();
  const dateLocale = catalogDateLocale(language);
  const searchParams = useSearchParams();
  const storeIdQuery = searchParams.get("storeId")?.trim() ?? "";
  const [storeId, setStoreId] = useState<string>("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** IA-15 — 항목별 저장·삭제 실패 (목록은 유지) */
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  /** `silent` — 저장·삭제 후 배경 갱신 (로딩 화면·목록 소실 없음) */
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setErr(null);
    }
    try {
      let sid = storeIdQuery;
      if (!sid) {
        const { status, json } = await fetchMeStoresListDeduped();
        const j = json as { ok?: boolean; stores?: { id: string }[] };
        if (status === 401) {
          setErr("unauthorized");
          setRows([]);
          return;
        }
        sid =
          j?.ok && Array.isArray(j.stores)
            ? resolveOwnerActiveStoreIdFromOwnedList(j.stores, null) ?? ""
            : "";
      }
      if (!sid) {
        setErr("load_failed");
        setRows([]);
        return;
      }
      setStoreId(sid);

      // Single-flight must share parsed JSON — Response body can only be read once.
      const payload = await runSingleFlight(`me:store:${sid}:owner-reviews:list`, async () => {
        const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/reviews`, {
          credentials: "include",
          cache: "no-store",
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          reviews?: ReviewRow[];
        };
        return { httpOk: res.ok, j };
      });
      if (!payload.httpOk || !payload.j?.ok) {
        if (silent) return;
        setErr(typeof payload.j?.error === "string" ? payload.j.error : "load_failed");
        setRows([]);
        return;
      }
      const list = Array.isArray(payload.j.reviews) ? payload.j.reviews : [];
      setRows(list);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const r of list) {
          if (!(r.id in next)) next[r.id] = r.owner_reply_content ?? "";
        }
        return next;
      });
    } catch {
      if (silent) return;
      setErr("network_error");
      setRows([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [storeIdQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchReply = useCallback(
    async (reviewId: string, reply: string, fallbackCode: string): Promise<boolean> => {
      const sid = storeId.trim();
      if (!sid || !reviewId) return false;
      setBusyId(reviewId);
      setRowErr((prev) => {
        if (!(reviewId in prev)) return prev;
        const next = { ...prev };
        delete next[reviewId];
        return next;
      });
      try {
        const res = await ownerFetchJson(
          `/api/me/stores/${encodeURIComponent(sid)}/reviews/${encodeURIComponent(reviewId)}/reply`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reply }),
          }
        );
        if (!res.ok) {
          const msg = resolveOwnerApiErrorMessage(
            res.code === "request_failed" || res.code === "invalid_response" ? fallbackCode : res.code,
            t
          );
          setRowErr((prev) => ({ ...prev, [reviewId]: msg }));
          toast.error(msg);
          return false;
        }
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [storeId, t, toast]
  );

  const saveReply = useCallback(
    async (reviewId: string) => {
      const draft = (drafts[reviewId] ?? "").trim();
      if (!draft) return;
      const ok = await patchReply(reviewId, draft, "reply_failed");
      if (!ok) return;
      toast.success(t("owner_s4_review_saved"));
      await load({ silent: true });
    },
    [drafts, load, patchReply, t, toast]
  );

  const deleteReply = useCallback(
    async (reviewId: string) => {
      const ok = await patchReply(reviewId, "", "delete_reply_failed");
      if (!ok) return;
      setDrafts((prev) => ({ ...prev, [reviewId]: "" }));
      toast.success(t("owner_s4_review_deleted"));
      await load({ silent: true });
    },
    [load, patchReply, t, toast]
  );

  if (loading) return <OwnerStateView kind="loading" />;
  if (err) {
    return (
      <OwnerStateView
        kind={err === "unauthorized" || err === "forbidden" ? "no_permission" : "error"}
        message={resolveOwnerApiErrorMessage(err, t)}
        onRetry={() => void load()}
      />
    );
  }
  if (rows.length === 0) return <OwnerStateView kind="empty" title={t("business_phase7_066")} />;

  return (
    <div className={OWNER_STORE_STACK_Y_CLASS}>
      <p className="sam-text-body-secondary text-sam-muted">{t("business_phase7_113")}</p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="sam-text-body font-semibold text-sam-fg">{r.buyer_public_label}</p>
              <p className="sam-text-helper text-sam-muted">{new Date(r.created_at).toLocaleDateString(dateLocale)}</p>
            </div>
            <p className="mt-1 sam-text-body-secondary text-sam-warning">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
            <p className="mt-1 whitespace-pre-wrap sam-text-body leading-relaxed text-sam-fg">{r.content}</p>
            <p className="mt-1 sam-text-helper text-sam-muted">
              {r.order_no?.trim()
                ? t("owner_s4_review_meta", {
                    orderNo: r.order_no.trim(),
                    visibility: r.visible_to_public ? t("business_phase7_470") : t("business_phase7_132"),
                  })
                : r.visible_to_public
                  ? t("business_phase7_470")
                  : t("business_phase7_132")}
            </p>

            <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-app p-2.5">
              <p className="sam-text-helper font-semibold text-sam-fg">{t("business_phase7_138")}</p>
              <textarea
                value={drafts[r.id] ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                placeholder={t("business_phase7_017")}
                rows={3}
                className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary outline-none ring-sam-primary/20 focus:ring-2"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                {r.owner_reply_content ? (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => setDeleteTargetId(r.id)}
                    className="rounded-ui-rect border border-sam-danger bg-sam-surface px-2.5 py-1.5 sam-text-helper text-sam-danger disabled:opacity-40"
                  >
                    {t("business_phase7_reply_delete")}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  disabled={busyId !== null || !(drafts[r.id] ?? "").trim()}
                  onClick={() => void saveReply(r.id)}
                  className="rounded-ui-rect bg-sam-primary px-3 py-1.5 sam-text-helper font-semibold text-sam-on-primary disabled:opacity-40"
                >
                  {busyId === r.id ? t("business_phase7_384") : t("business_phase7_471")}
                </button>
              </div>
              {rowErr[r.id] ? (
                <p role="alert" data-owner-review-row-error="1" className="mt-2 sam-text-helper text-sam-danger">
                  {rowErr[r.id]}
                </p>
              ) : null}
              {r.owner_reply_created_at ? (
                <p className="mt-1 text-right sam-text-xxs text-sam-muted">
                  {t("business_phase7_472", {
                    v1: new Date(r.owner_reply_created_at).toLocaleString(dateLocale),
                  })}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <OwnerStoreAdminConfirmModal
        open={deleteTargetId != null}
        titleId="owner-store-review-reply-delete-title"
        title={t("owner_s4_review_delete_title")}
        description={t("owner_s4_review_delete_desc")}
        confirmLabel={t("business_phase7_reply_delete")}
        busy={deleteTargetId != null && busyId === deleteTargetId}
        disableActions={busyId !== null}
        confirmTone="danger"
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={async () => {
          const id = deleteTargetId;
          if (!id) return;
          await deleteReply(id);
          setDeleteTargetId(null);
        }}
      />
    </div>
  );
}
