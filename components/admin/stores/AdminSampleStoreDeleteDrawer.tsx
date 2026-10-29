"use client";

/**
 * 3-C §9-4 ③ — 샘플 매장 삭제 사전 확인 + 최종 승인.
 * 사전 확인(매장 수·메뉴 수·이미지 수·연결 데이터·삭제 불가 목록) → 「삭제」 → 확인창에서 삭제할 매장 수를 직접 입력(L3 + 사유)
 * → 서버가 미리보기 토큰을 다시 계산해 같을 때만 실행. 결과는 매장별 성공·이미 삭제됨·삭제 불가·실패로 표시.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminDetailDrawer } from "@/components/admin/ui/AdminDetailDrawer";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import {
  sampleStoreDeleteReasonLabel,
  summarizeSampleStoreDeleteResults,
  type SampleStoreDeletePreview,
  type SampleStoreDeletePreviewSummary,
  type SampleStoreDeleteResult,
} from "@/lib/admin-business/sample-store-delete-model";

function newClientRequestId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

const OUTCOME_LABEL: Record<SampleStoreDeleteResult["outcome"], { ko: string; en: string; tone: "success" | "neutral" | "warning" | "danger" }> = {
  deleted: { ko: "삭제됨", en: "Deleted", tone: "success" },
  already_deleted: { ko: "이미 삭제됨", en: "Already deleted", tone: "neutral" },
  blocked: { ko: "삭제 불가", en: "Not deletable", tone: "warning" },
  failed: { ko: "실패", en: "Failed", tone: "danger" },
};

export function AdminSampleStoreDeleteDrawer({
  open,
  storeIds,
  ko,
  onClose,
  onDone,
}: {
  open: boolean;
  storeIds: readonly string[];
  ko: boolean;
  onClose: () => void;
  /** 삭제·이미 삭제된 id (선택에서 빼고 목록 새로고침) */
  onDone: (removedIds: string[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; status?: number } | null>(null);
  const [previews, setPreviews] = useState<SampleStoreDeletePreview[]>([]);
  const [summary, setSummary] = useState<SampleStoreDeletePreviewSummary | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [results, setResults] = useState<SampleStoreDeleteResult[] | null>(null);
  const [executing, setExecuting] = useState(false);
  const clientRequestIdRef = useRef<string>(newClientRequestId());

  const runPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setResults(null);
    clientRequestIdRef.current = newClientRequestId();
    try {
      const res = await fetch("/api/admin/stores/sample-delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", store_ids: storeIds }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        previews?: SampleStoreDeletePreview[];
        summary?: SampleStoreDeletePreviewSummary;
        confirm_token?: string;
      } | null;
      if (!json?.ok) {
        setError({ code: json?.error ?? "load_failed", status: res.status });
        return;
      }
      setPreviews(json.previews ?? []);
      setSummary(json.summary ?? null);
      setToken(json.confirm_token ?? null);
    } catch {
      setError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [storeIds]);

  useEffect(() => {
    if (open && storeIds.length > 0) void runPreview();
  }, [open, runPreview, storeIds.length]);

  const deletable = previews.filter((p) => p.deletable);
  const blocked = previews.filter((p) => p.exists && !p.deletable);
  const missing = previews.filter((p) => !p.exists);

  const execute = async () => {
    if (!token || deletable.length === 0 || executing) return;
    const n = deletable.length;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("delete"),
      ko,
      title: ko ? "샘플 매장 삭제" : "Delete sample stores",
      description: ko
        ? [
            `샘플 매장 ${formatAdminNumber(n)}곳과 메뉴 ${formatAdminNumber(summary?.menu_count)}개·이미지 ${formatAdminNumber(
              (summary?.image_count ?? 0) - (summary?.shared_image_count ?? 0)
            )}개를 삭제합니다. 되돌릴 수 없습니다.`,
            blocked.length ? `삭제 불가 ${formatAdminNumber(blocked.length)}곳은 제외됩니다.` : "",
            "실제·테스트 매장은 서버와 DB 가 다시 막습니다.",
          ]
            .filter(Boolean)
            .join("\n")
        : `Delete ${n} sample stores. This cannot be undone.`,
      confirmLabel: adminCta("delete", ko),
      destructive: true,
      retypeValue: String(n),
    });
    if (!confirmed.ok) return;
    setExecuting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/stores/sample-delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "execute",
          store_ids: storeIds,
          confirm_token: token,
          client_request_id: clientRequestIdRef.current,
          reason: confirmed.reason ?? "",
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        results?: SampleStoreDeleteResult[];
        previews?: SampleStoreDeletePreview[];
        summary?: SampleStoreDeletePreviewSummary;
        confirm_token?: string;
      } | null;
      if (!json?.ok) {
        if (json?.error === "preview_changed") {
          setPreviews(json.previews ?? []);
          setSummary(json.summary ?? null);
          setToken(json.confirm_token ?? null);
        }
        setNotice(adminOperatorErrorMessage(json?.error ?? "action_failed", ko));
        return;
      }
      const list = json.results ?? [];
      setResults(list);
      onDone(list.filter((r) => r.outcome === "deleted" || r.outcome === "already_deleted").map((r) => r.store_id));
    } catch {
      setNotice(adminOperatorErrorMessage("network_error", ko));
    } finally {
      setExecuting(false);
    }
  };

  const resultSummary = results ? summarizeSampleStoreDeleteResults(results) : null;

  return (
    <AdminDetailDrawer
      open={open}
      onClose={onClose}
      ko={ko}
      pending={executing}
      title={ko ? "샘플 매장 삭제 — 사전 확인" : "Delete sample stores — preview"}
      subtitle={ko ? `선택 ${formatAdminNumber(storeIds.length)}곳` : `${storeIds.length} selected`}
      dangerActions={
        results ? null : (
          <AdminActionButton
            variant="danger"
            size="sm"
            disabled={loading || executing || !token || deletable.length === 0}
            onClick={() => void execute()}
            data-admin-sample-delete-execute="1"
          >
            {ko ? `${formatAdminNumber(deletable.length)}곳 ${adminCta("delete", ko)}` : `Delete ${deletable.length}`}
          </AdminActionButton>
        )
      }
      primaryActions={
        <AdminActionButton variant="secondary" size="sm" disabled={loading || executing} onClick={() => void runPreview()}>
          {adminCta("refresh", ko)}
        </AdminActionButton>
      }
    >
      <div className="space-y-4" data-admin-sample-delete-drawer="1">
        {loading ? <AdminLoadingState ko={ko} /> : null}
        {error ? <AdminErrorState ko={ko} code={error.code} httpStatus={error.status} onRetry={() => void runPreview()} /> : null}
        {notice ? (
          <p role="alert" className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 sam-text-helper text-sam-fg">
            {notice}
          </p>
        ) : null}

        {resultSummary && results ? (
          <section className="space-y-2" data-admin-sample-delete-results="1">
            <p className="sam-text-body font-semibold text-sam-fg">
              {ko
                ? `결과: 삭제 ${formatAdminNumber(resultSummary.deleted)} · 이미 삭제됨 ${formatAdminNumber(
                    resultSummary.already_deleted
                  )} · 삭제 불가 ${formatAdminNumber(resultSummary.blocked)} · 실패 ${formatAdminNumber(resultSummary.failed)}`
                : `Deleted ${resultSummary.deleted} · already ${resultSummary.already_deleted} · blocked ${resultSummary.blocked} · failed ${resultSummary.failed}`}
            </p>
            <ul className="max-h-72 space-y-1 overflow-auto sam-text-helper text-sam-muted">
              {results.map((r) => {
                const meta = OUTCOME_LABEL[r.outcome];
                return (
                  <li key={r.store_id} className="flex flex-wrap items-center gap-2">
                    <AdminToneBadge tone={meta.tone}>{ko ? meta.ko : meta.en}</AdminToneBadge>
                    <span className="text-sam-fg">{(r.store_name ?? "").trim() || "—"}</span>
                    <AdminTechId id={r.store_id} />
                    {r.reasons?.length ? <span>{r.reasons.map((c) => sampleStoreDeleteReasonLabel(c, ko)).join(", ")}</span> : null}
                    {r.storage_failed?.length ? (
                      <span className="text-sam-danger">
                        {ko ? `이미지 삭제 실패 ${formatAdminNumber(r.storage_failed.length)}` : `Image delete failed ${r.storage_failed.length}`}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {!results && summary ? (
          <>
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-admin-sample-delete-summary="1">
              {[
                [ko ? "삭제 대상 매장" : "Stores to delete", summary.deletable],
                [ko ? "메뉴" : "Menus", summary.menu_count],
                [ko ? "옵션" : "Options", summary.option_count],
                [ko ? "메뉴 카테고리" : "Sections", summary.section_count],
                [ko ? "이미지" : "Images", summary.image_count],
                [ko ? "공유 이미지(보존)" : "Shared images (kept)", summary.shared_image_count],
                [ko ? "찜" : "Favorites", summary.favorite_count],
                [ko ? "배너 캠페인" : "Banner campaigns", summary.banner_campaign_count],
                [ko ? "쿠폰" : "Coupons", summary.coupon_count],
                [ko ? "프로모션" : "Promotions", summary.promotion_count],
                [ko ? "삭제 불가" : "Not deletable", summary.blocked],
                [ko ? "이미 없음" : "Missing", summary.missing],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                  <p className="sam-text-helper text-sam-muted">{label}</p>
                  <p className="sam-text-body font-semibold text-sam-fg">{formatAdminNumber(value as number)}</p>
                </div>
              ))}
            </section>

            {blocked.length > 0 ? (
              <section className="space-y-1" data-admin-sample-delete-blocked="1">
                <p className="sam-text-body font-semibold text-sam-fg">
                  {ko ? `삭제 불가 ${formatAdminNumber(blocked.length)}곳` : `Not deletable (${blocked.length})`}
                </p>
                <ul className="max-h-48 space-y-1 overflow-auto sam-text-helper text-sam-muted">
                  {blocked.map((p) => (
                    <li key={p.store_id} className="flex flex-wrap items-center gap-2">
                      <span className="text-sam-fg">{(p.store_name ?? "").trim() || "—"}</span>
                      <AdminTechId id={p.store_id} />
                      <span>{p.reasons.map((c) => sampleStoreDeleteReasonLabel(c, ko)).join(", ")}</span>
                      {p.blocking_refs?.length ? (
                        <span>
                          ({p.blocking_refs.map((r) => `${r.table} ${formatAdminNumber(r.count)}`).join(", ")})
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {missing.length > 0 ? (
              <p className="sam-text-helper text-sam-muted">
                {ko
                  ? `이미 없는 매장 ${formatAdminNumber(missing.length)}곳은 「이미 삭제됨」으로 처리됩니다.`
                  : `${missing.length} stores are already gone.`}
              </p>
            ) : null}

            <section className="space-y-1">
              <p className="sam-text-body font-semibold text-sam-fg">{ko ? "삭제 대상" : "To delete"}</p>
              <ul className="max-h-48 space-y-1 overflow-auto sam-text-helper text-sam-muted">
                {deletable.map((p) => (
                  <li key={p.store_id} className="flex flex-wrap items-center gap-2">
                    <span className="text-sam-fg">{(p.store_name ?? "").trim() || "—"}</span>
                    <AdminTechId id={p.store_id} />
                    <span>
                      {ko
                        ? `메뉴 ${formatAdminNumber(p.menu_count)} · 이미지 ${formatAdminNumber(p.image_count)}`
                        : `menus ${p.menu_count} · images ${p.image_count}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </AdminDetailDrawer>
  );
}
