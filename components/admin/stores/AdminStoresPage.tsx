"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AdminStoreReviewSheet,
  ADMIN_STORE_APPROVAL_LABEL,
  type AdminStoreReviewRow,
  formatAdminStoreAddressOneLine,
} from "@/components/admin/stores/AdminStoreReviewSheet";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";

type SalesPerm = {
  allowed_to_sell?: boolean;
  sales_status?: string;
  approved_at?: string | null;
  rejection_reason?: string | null;
  suspension_reason?: string | null;
} | null;

type AdminStoreRow = AdminStoreReviewRow & { sales_permission: SalesPerm };

const STATUS_FILTER: { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "pending", label: "신청대기" },
  { value: "under_review", label: "검토중" },
  { value: "revision_requested", label: "보완요청" },
  { value: "approved", label: "승인" },
  { value: "rejected", label: "반려" },
  { value: "suspended", label: "정지" },
];

function adminEmbedName(
  v: { name?: string } | { name?: string }[] | null | undefined
): string {
  if (v == null) return "";
  if (Array.isArray(v)) return (v[0]?.name ?? "").trim();
  return (v.name ?? "").trim();
}

function adminDbTaxonomyLine(r: AdminStoreReviewRow): string {
  const c = adminEmbedName(r.store_categories);
  const t = adminEmbedName(r.store_topics);
  if (c && t) return `${c} · ${t}`;
  if (c) return c;
  return (r.business_type ?? "").trim() || "—";
}

function previewText(text: string | null | undefined, max = 56): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 관리자 테이블 액션 — Primary / Secondary / Warning / Danger CTA 정렬 */
function ActionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">{title}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

const ctaBase =
  "inline-flex w-full min-h-[2.25rem] shrink-0 items-center justify-center rounded-lg px-3 py-2 text-center text-[12px] font-semibold leading-tight transition disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signature/40 focus-visible:ring-offset-1";

const ctaPrimary = `${ctaBase} bg-signature text-white shadow-sm hover:bg-signature/90 active:bg-signature/95`;
const ctaSecondary = `${ctaBase} border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 active:bg-gray-100`;
const ctaWarning = `${ctaBase} border border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100/80 active:bg-amber-100`;
const ctaDanger = `${ctaBase} border border-red-200 bg-white text-red-800 hover:bg-red-50 active:bg-red-100/80`;
const ctaDangerSolid = `${ctaBase} border border-red-300 bg-red-600 text-white hover:bg-red-700 active:bg-red-800`;
const ctaAccent = `${ctaBase} border border-signature/35 bg-signature/10 text-signature hover:bg-signature/15 active:bg-signature/20`;
const ctaSales = `${ctaBase} border border-blue-200 bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800`;
const ctaSalesOutline = `${ctaBase} border border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-100/90`;
const ctaOrange = `${ctaBase} border border-orange-200 bg-orange-50 text-orange-950 hover:bg-orange-100/80`;

export function AdminStoresPage() {
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<AdminStoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sheetStore, setSheetStore] = useState<AdminStoreReviewRow | null>(null);

  const qs = useMemo(
    () => (filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`),
    [filter]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stores${qs}`, { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("관리자 권한이 없습니다.");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error ?? "load_failed");
        setRows([]);
        return;
      }
      setRows(json.stores ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (storeId: string, body: Record<string, unknown>) => {
    setBusyId(storeId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stores/${storeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error ?? `action_failed_${res.status}`);
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusyId(null);
    }
  };

  const promptReason = (title: string) => window.prompt(title, "")?.trim() ?? "";

  return (
    <div className="space-y-4">
      {sheetStore ? (
        <AdminStoreReviewSheet
          store={sheetStore}
          onClose={() => setSheetStore(null)}
          onSetOwnerIdentityEditable={(enabled) => {
            const id = sheetStore.id;
            void runAction(id, { action: "set_owner_identity_editable", enabled });
          }}
          identityActionBusy={busyId === sheetStore.id}
        />
      ) : null}
      <AdminPageHeader title="매장 심사 (커머스)" />
      <p className="text-[13px] text-gray-600">
        DB <code className="rounded bg-gray-100 px-1">stores</code> ·{" "}
        <code className="rounded bg-gray-100 px-1">store_sales_permissions</code> 연동. 매장 승인 후
        판매 권한을 별도로 승인할 수 있습니다.
      </p>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTER.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
              filter === f.value
                ? "bg-gray-900 text-white"
                : "border border-gray-200 bg-white text-gray-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-[14px] text-gray-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          매장이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-[1420px] w-full border-collapse text-left text-[13px]">
            <thead className="border-b border-gray-200 bg-gray-50 text-[12px] text-gray-600">
              <tr>
                <th className="min-w-[180px] px-3 py-2 font-medium">매장</th>
                <th className="min-w-[100px] max-w-[140px] px-3 py-2 font-medium">신청자</th>
                <th className="min-w-[140px] max-w-[200px] px-3 py-2 font-medium">등록 ID</th>
                <th className="min-w-[140px] px-3 py-2 font-medium">연락</th>
                <th className="min-w-[168px] px-3 py-2 font-medium">업종 (DB)</th>
                <th
                  className="w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] whitespace-normal px-1 py-2 text-center align-bottom text-[11px] font-medium leading-tight"
                  title="오너 기본 정보에서 매장명·업종·세부 주제 수정 허용 여부"
                >
                  식별
                  <br />
                  수정
                </th>
                <th className="min-w-[200px] px-3 py-2 font-medium">주소(신청)</th>
                <th className="min-w-[140px] px-3 py-2 font-medium">소개</th>
                <th className="min-w-[4.5rem] whitespace-nowrap px-2 py-2 font-medium">매장상태</th>
                <th className="w-12 min-w-[3rem] px-2 py-2 font-medium">노출</th>
                <th className="min-w-[7rem] px-2 py-2 font-medium">판매권한</th>
                <th className="min-w-[5rem] px-2 py-2 font-medium">오너</th>
                <th className="min-w-[15.5rem] w-[15.5rem] px-3 py-2 font-medium">관리 액션</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sp = r.sales_permission;
                const salesLabel = sp
                  ? `${sp.sales_status}${sp.allowed_to_sell ? "·판매가능" : ""}`
                  : "-";
                const disabled = busyId === r.id;
                const addressLine = formatAdminStoreAddressOneLine(r);
                const { intro: introForList, kakao: kakaoForList } = splitStoreDescriptionAndKakao(
                  r.description,
                  r.kakao_id
                );
                return (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-gray-900">{r.store_name}</div>
                      <a
                        href={`/stores/${encodeURIComponent(r.slug)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-block text-[12px] text-signature underline"
                      >
                        공개 페이지 열기 →
                      </a>
                      <button
                        type="button"
                        className="mt-1 block text-[12px] font-medium text-signature hover:underline"
                        onClick={() => setSheetStore(r)}
                      >
                        신청 정보 시트
                      </button>
                      {r.revision_note ? (
                        <div className="mt-1 text-[11px] text-amber-800">보완: {r.revision_note}</div>
                      ) : null}
                      {r.rejected_reason ? (
                        <div className="mt-1 text-[11px] text-red-700">반려: {r.rejected_reason}</div>
                      ) : null}
                    </td>
                    <td className="max-w-[140px] px-3 py-2 align-top text-[12px] text-gray-800">
                      {r.applicant_nickname?.trim() || (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="max-w-[200px] px-3 py-2 align-top">
                      <p className="break-all font-mono text-[12px] leading-snug text-gray-900">
                        {r.slug}
                      </p>
                      <button
                        type="button"
                        className="mt-1 text-[11px] font-medium text-signature hover:underline"
                        onClick={() => {
                          void navigator.clipboard.writeText(r.slug).catch(() => {});
                        }}
                      >
                        등록 ID 복사
                      </button>
                      <p className="mt-1 text-[10px] leading-snug text-gray-400">
                        신청 시 정한 URL용 식별자(slug). 매장 전용 로그인 ID는 추후 정리 예정.
                      </p>
                    </td>
                    <td className="max-w-[160px] px-3 py-2 align-top text-[12px] leading-snug text-gray-800">
                      <div>
                        <span className="text-gray-500">전화</span>{" "}
                        {r.phone?.trim() ? (
                          <span className="text-gray-900">{r.phone.trim()}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                      <div className="mt-1">
                        <span className="text-gray-500">카카오</span>{" "}
                        {kakaoForList?.trim() ? (
                          <span className="text-gray-900">{kakaoForList.trim()}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-[12px] leading-snug text-gray-800 break-words">
                      {adminDbTaxonomyLine(r)}
                    </td>
                    <td className="px-2 py-2 align-middle text-center text-[12px] text-gray-800">
                      {r.owner_can_edit_store_identity ? (
                        <span className="font-medium text-green-800">허용</span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="max-w-[240px] px-3 py-2 align-top text-[12px] leading-snug text-gray-800">
                      {addressLine}
                    </td>
                    <td className="max-w-[180px] px-3 py-2 align-top text-[12px] text-gray-600">
                      {previewText(introForList)}
                    </td>
                    <td className="px-3 py-2 align-top text-gray-800">
                      {ADMIN_STORE_APPROVAL_LABEL[r.approval_status] ?? r.approval_status}
                    </td>
                    <td className="px-3 py-2 align-top">{r.is_visible ? "Y" : "N"}</td>
                    <td className="px-3 py-2 align-top text-[12px] text-gray-700">{salesLabel}</td>
                    <td className="px-3 py-2 align-top font-mono text-[11px] text-gray-500">
                      {r.owner_user_id.slice(0, 8)}…
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex min-w-0 flex-col gap-3">
                        {r.approval_status === "suspended" ? (
                          <ActionGroup title="매장 심사">
                            <button
                              type="button"
                              disabled={disabled}
                              className={ctaPrimary}
                              onClick={() => void runAction(r.id, { action: "resume_store" })}
                            >
                              매장 재개 · 노출 복구
                            </button>
                          </ActionGroup>
                        ) : r.approval_status !== "approved" ? (
                          <ActionGroup title="매장 심사">
                            <button
                              type="button"
                              disabled={disabled}
                              className={ctaPrimary}
                              onClick={() => void runAction(r.id, { action: "approve_store" })}
                            >
                              매장 승인
                            </button>
                            {r.approval_status === "pending" ||
                            r.approval_status === "under_review" ||
                            r.approval_status === "revision_requested" ? (
                              <>
                                <button
                                  type="button"
                                  disabled={disabled}
                                  className={ctaWarning}
                                  onClick={() => {
                                    const note = promptReason("보완 요청 메모");
                                    if (note) void runAction(r.id, { action: "request_revision", note });
                                  }}
                                >
                                  보완 요청
                                </button>
                                <button
                                  type="button"
                                  disabled={disabled}
                                  className={ctaDangerSolid}
                                  onClick={() => {
                                    const reason = promptReason("반려 사유");
                                    if (reason) void runAction(r.id, { action: "reject_store", reason });
                                  }}
                                >
                                  매장 반려
                                </button>
                              </>
                            ) : null}
                          </ActionGroup>
                        ) : (
                          <>
                            <ActionGroup title="판매 권한">
                              {sp?.sales_status !== "approved" ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={disabled}
                                    className={ctaSales}
                                    onClick={() => void runAction(r.id, { action: "approve_sales" })}
                                  >
                                    판매 승인
                                  </button>
                                  <button
                                    type="button"
                                    disabled={disabled}
                                    className={ctaSalesOutline}
                                    onClick={() => {
                                      const reason = promptReason("판매 거절 사유");
                                      if (reason) void runAction(r.id, { action: "reject_sales", reason });
                                    }}
                                  >
                                    판매 거절
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  disabled={disabled}
                                  className={ctaOrange}
                                  onClick={() => {
                                    const reason = promptReason("판매 정지 사유");
                                    if (reason) void runAction(r.id, { action: "suspend_sales", reason });
                                  }}
                                >
                                  판매 정지
                                </button>
                              )}
                            </ActionGroup>
                            <ActionGroup title="매장 운영">
                              <button
                                type="button"
                                disabled={disabled}
                                className={ctaAccent}
                                onClick={() =>
                                  void runAction(r.id, {
                                    action: "set_owner_identity_editable",
                                    enabled: !r.owner_can_edit_store_identity,
                                  })
                                }
                                title={
                                  r.owner_can_edit_store_identity
                                    ? "기본 정보에서 매장명·업종 수정 불가로 되돌림"
                                    : "기본 정보에서 매장명·업종·세부 주제 수정 허용"
                                }
                              >
                                {r.owner_can_edit_store_identity
                                  ? "식별 수정 허용 해제"
                                  : "오너 식별 수정 허용"}
                              </button>
                              <button
                                type="button"
                                disabled={disabled}
                                className={ctaDanger}
                                onClick={() => {
                                  const reason = promptReason("매장 정지 사유");
                                  if (reason) void runAction(r.id, { action: "suspend_store", reason });
                                }}
                              >
                                매장 정지
                              </button>
                            </ActionGroup>
                          </>
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
    </div>
  );
}
