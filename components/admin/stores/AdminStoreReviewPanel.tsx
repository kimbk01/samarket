"use client";

import { useEffect, useState, type ReactNode } from "react";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import { formatPhMobileDisplay, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import {
  STORE_ADDRESS_DETAIL_LABEL,
  STORE_ADDRESS_STREET_LABEL,
  STORE_LOCATION_SECTION_HINT_APPLY,
} from "@/lib/stores/store-address-form-ui";
import {
  ADMIN_STORE_APPROVAL_LABEL,
  type AdminStoreReviewRow,
  formatAdminStoreAddressOneLine,
} from "@/components/admin/stores/admin-store-review-model";

function embedRelationName(
  v: { name?: string } | { name?: string }[] | null | undefined
): string {
  if (v == null) return "";
  if (Array.isArray(v)) return (v[0]?.name ?? "").trim();
  return (v.name ?? "").trim();
}

function dash(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return t || "—";
}

function joinComma(parts: Array<string | null | undefined>): string {
  return parts
    .map((x) => (x ?? "").trim())
    .filter((x) => x && x.toLowerCase() !== "null" && x.toLowerCase() !== "undefined")
    .join(", ");
}

function includesToken(haystack: string, needle: string): boolean {
  const h = haystack.trim().toLowerCase();
  const n = needle.trim().toLowerCase();
  if (!h || !n) return false;
  return h.includes(n);
}

function normalizeAddress1ForStore(streetRaw: string, city: string, region: string): string {
  let s = streetRaw.trim();
  if (!s) return s;
  const c = city.trim();
  const r = region.trim();
  // Remove trailing ", City" / ", Region" / " City" / " Region" patterns.
  // This keeps "주소1" focused on the street/number line.
  const removeTail = (token: string) => {
    if (!token) return;
    const re = new RegExp(String.raw`(?:,\s*|\s+)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\s*$`, "i");
    while (re.test(s)) s = s.replace(re, "").trim();
  };
  removeTail(c);
  removeTail(r);
  return s.replace(/^[,\s]+|[,\s]+$/g, "").trim();
}

function normalizeDetailForStore(street: string, detail: string, city: string, region: string): string {
  const s = street.trim();
  let d = detail.trim();
  if (!d) return d;

  // If detail accidentally contains street/full line, remove it.
  if (s) {
    const idx = d.toLowerCase().indexOf(s.toLowerCase());
    if (idx >= 0) {
      d = `${d.slice(0, idx)} ${d.slice(idx + s.length)}`.replace(/\s+/g, " ").trim();
    }
  }

  // Remove any embedded city/region tokens from detail.
  const tokens = [city, region]
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  for (const t of tokens) {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    d = d.replace(new RegExp(String.raw`(?:,\s*|\s+)${esc}(?=,|\s|$)`, "ig"), " ");
    d = d.replace(new RegExp(String.raw`^${esc}(?=,|\s|$)`, "ig"), " ");
  }

  d = d.replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "").trim();
  return d;
}

function ReviewSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-ui-rect border border-sam-border-soft bg-sam-app/60 p-3">
      <h3 className="sam-text-body-secondary font-bold text-sam-fg">{title}</h3>
      {hint ? <p className="mt-1 sam-text-xxs leading-relaxed text-sam-muted">{hint}</p> : null}
      <div className="mt-2 space-y-2.5">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="sam-text-xxs font-medium text-sam-muted">{label}</p>
      <div className="mt-0.5 sam-text-body-secondary text-sam-fg">{value}</div>
    </div>
  );
}

export type AdminStoreReviewPanelProps = {
  store: AdminStoreReviewRow | null;
  onClose?: () => void;
  onRunAction?: (action: string, payload?: { reason?: string; enabled?: boolean; store_name?: string }) => void;
  actionBusy?: boolean;
  onSetOwnerIdentityEditable?: (enabled: boolean) => void;
  identityActionBusy?: boolean;
};

export function AdminStoreReviewPanel({
  store,
  onClose,
  onRunAction,
  actionBusy,
  onSetOwnerIdentityEditable,
  identityActionBusy,
}: AdminStoreReviewPanelProps) {
  if (!store) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6">
        <p className="sam-text-body text-sam-muted">좌측에서 매장을 선택하세요.</p>
      </div>
    );
  }

  const [adminStoreName, setAdminStoreName] = useState(store.store_name ?? "");
  useEffect(() => {
    setAdminStoreName(store.store_name ?? "");
  }, [store.id, store.store_name]);

  const statusKo = ADMIN_STORE_APPROVAL_LABEL[store.approval_status] ?? store.approval_status;
  const { intro: storeIntro, kakao: storeKakao } = splitStoreDescriptionAndKakao(
    store.description,
    store.kakao_id
  );
  // address display is centralized in formatAdminStoreAddressOneLine

  const gcashNoDigits = parsePhMobileInput(store.email ?? "");
  const gcashNoDisplay =
    gcashNoDigits.length === 11 ? formatPhMobileDisplay(gcashNoDigits) : dash(store.email);

  const catDb = embedRelationName(store.store_categories);
  const topicDb = embedRelationName(store.store_topics);

  const imgs = [{ label: "프로필 이미지", url: store.profile_image_url }].filter((x) => x.url?.trim());

  const busy = Boolean(actionBusy || identityActionBusy);

  const actionBtnBase =
    "inline-flex min-h-[2.5rem] items-center justify-center rounded-ui-rect px-3 py-2 sam-text-helper font-semibold transition disabled:pointer-events-none disabled:opacity-45";
  const actionPrimary = `${actionBtnBase} bg-signature text-white hover:bg-signature/90 active:bg-signature/95`;
  const actionSecondary = `${actionBtnBase} border border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-app active:bg-sam-surface-muted`;
  const actionWarn = `${actionBtnBase} border border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100/80 active:bg-amber-100`;
  const actionDanger = `${actionBtnBase} border border-red-300 bg-red-600 text-white hover:bg-red-700 active:bg-red-800`;
  const actionDangerSoft = `${actionBtnBase} border border-red-200 bg-sam-surface text-red-800 hover:bg-red-50 active:bg-red-100/80`;
  const actionSales = `${actionBtnBase} border border-sam-primary-border bg-sam-primary text-white hover:bg-sam-primary-hover active:bg-sam-primary-active disabled:bg-sam-primary-disabled`;
  const actionSalesOutline = `${actionBtnBase} border border-sam-primary-border bg-sam-primary-soft text-sam-primary hover:bg-sam-primary-soft-2`;

  const promptReason = (title: string) => window.prompt(title, "")?.trim() ?? "";

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-sam-border-soft px-4 py-3">
        <div className="min-w-0">
          <p className="sam-text-helper font-semibold text-sam-muted">매장 관리</p>
          <h2 className="truncate sam-text-body-lg font-semibold text-sam-fg">
            {dash(store.store_name)}
          </h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-ui-rect px-3 py-1.5 sam-text-body-secondary font-medium text-sam-muted hover:bg-sam-surface-muted"
          >
            닫기
          </button>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sam-ink px-2.5 py-0.5 sam-text-xxs font-bold text-white">
              {statusKo}
            </span>
            {store.is_visible ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 sam-text-xxs font-bold text-emerald-800">
                노출 Y
              </span>
            ) : (
              <span className="rounded-full bg-sam-app px-2.5 py-0.5 sam-text-xxs font-bold text-sam-muted">
                노출 N
              </span>
            )}
          </div>
          <p className="mt-2 font-mono sam-text-xxs text-sam-muted">/stores/{store.slug}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={`/stores/${encodeURIComponent(store.slug)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper font-semibold text-sam-fg hover:bg-sam-app"
            >
              공개 페이지
            </a>
          </div>
          <p className="mt-2 sam-text-helper text-sam-muted">
            신청 {new Date(store.created_at).toLocaleString("ko-KR")}
            {store.approved_at ? <> · 승인 {new Date(store.approved_at).toLocaleString("ko-KR")}</> : null}
          </p>

          {onRunAction ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {store.approval_status === "suspended" ? (
                <button
                  type="button"
                  disabled={busy}
                  className={actionPrimary}
                  onClick={() => onRunAction("resume_store")}
                >
                  재개(노출 복구)
                </button>
              ) : store.approval_status !== "approved" ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionPrimary}
                    onClick={() => onRunAction("approve_store")}
                  >
                    매장 승인
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionWarn}
                    onClick={() => {
                      const note = promptReason("보완 요청 메모");
                      if (!note) return;
                      onRunAction("request_revision", { reason: note });
                    }}
                  >
                    보완 요청
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionDanger}
                    onClick={() => {
                      const reason = promptReason("반려 사유");
                      if (!reason) return;
                      onRunAction("reject_store", { reason });
                    }}
                  >
                    반려
                  </button>
                    {onClose ? (
                      <button
                        type="button"
                        disabled={busy}
                        className={actionSecondary}
                        onClick={() => onClose?.()}
                      >
                        닫기
                      </button>
                    ) : null}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionSales}
                    onClick={() => onRunAction("approve_sales")}
                  >
                    판매 승인
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionSalesOutline}
                    onClick={() => {
                      const reason = promptReason("판매 거절 사유");
                      if (!reason) return;
                      onRunAction("reject_sales", { reason });
                    }}
                  >
                    판매 거절
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionDangerSoft}
                    onClick={() => {
                      const reason = promptReason("매장 정지 사유");
                      if (!reason) return;
                      onRunAction("suspend_store", { reason });
                    }}
                  >
                    매장 정지
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={actionWarn}
                    onClick={() => {
                      const reason = promptReason("판매 정지 사유");
                      if (!reason) return;
                      onRunAction("suspend_sales", { reason });
                    }}
                  >
                    판매 정지
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>

        <ReviewSection title="관리 (관리자 전용)">
          <div className="grid grid-cols-1 gap-2">
            <Field
              label="매장명 (관리자)"
              value={
                <div className="flex flex-col gap-2">
                  <input
                    value={adminStoreName}
                    onChange={(e) => setAdminStoreName(e.target.value)}
                    className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary font-medium text-sam-fg"
                    placeholder="매장명"
                    disabled={busy || !onRunAction}
                  />
                  <button
                    type="button"
                    disabled={busy || !onRunAction || adminStoreName.trim().length < 2}
                    onClick={() => onRunAction?.("set_store_name", { store_name: adminStoreName.trim() })}
                    className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body-secondary font-semibold text-white disabled:opacity-50"
                  >
                    매장명 저장
                  </button>
                </div>
              }
            />
            <Field
              label="등록 ID (URL)"
              value={<span className="font-mono sam-text-xxs text-sam-muted">/stores/{store.slug}</span>}
            />
          </div>
        </ReviewSection>

        <ReviewSection title="신청자">
          <Field
            label="닉네임"
            value={<span className="font-medium">{dash(store.applicant_nickname)}</span>}
          />
          <Field
            label="오너 user id"
            value={<span className="break-all font-mono sam-text-xxs">{store.owner_user_id}</span>}
          />
        </ReviewSection>

        <ReviewSection title="연락">
          <Field label="전화" value={<span className="font-medium">{dash(store.phone)}</span>} />
          <Field label="카카오" value={<span className="font-medium">{dash(storeKakao)}</span>} />
          <Field label="이메일/GCash" value={<span className="font-medium">{gcashNoDisplay}</span>} />
          <Field label="GCash name" value={<span className="font-medium">{dash(store.website_url)}</span>} />
        </ReviewSection>

        <ReviewSection title="주소" hint={STORE_LOCATION_SECTION_HINT_APPLY}>
          <Field
            label="지역"
            value={(() => {
              const reg = (store.region ?? "").trim();
              const city = (store.city ?? "").trim();
              if (!reg && !city) return "—";
              return [reg, city].filter(Boolean).join(" · ");
            })()}
          />
          <Field
            label="주소1"
            value={(() => {
              const city = (store.city ?? "").trim();
              const region = (store.region ?? "").trim();
              const street = normalizeAddress1ForStore(String(store.address_line1 ?? ""), city, region);
              return dash(street);
            })()}
          />
          <Field
            label="세부주소"
            value={(() => {
              const city = (store.city ?? "").trim();
              const region = (store.region ?? "").trim();
              const street = normalizeAddress1ForStore(String(store.address_line1 ?? ""), city, region);
              const detail = normalizeDetailForStore(street, String(store.address_line2 ?? ""), city, region);
              return dash(detail);
            })()}
          />
          <Field
            label="전체주소"
            value={
              <span className="font-medium text-sam-fg">
                {(() => {
                  const city = (store.city ?? "").trim();
                  const region = (store.region ?? "").trim();
                  const street = normalizeAddress1ForStore(String(store.address_line1 ?? ""), city, region);
                  const detail = String(store.address_line2 ?? "").trim();
                  const cleanDetail = normalizeDetailForStore(street, detail, city, region);
                  // PH convention: detail → address1 → city → region
                  const base = joinComma([cleanDetail, street]);
                  const extraCity = city && base && !includesToken(base, city) ? city : "";
                  const extraRegion =
                    region &&
                    ((base && !includesToken(base, region)) || (extraCity && !includesToken(extraCity, region)))
                      ? region
                      : "";
                  const line = joinComma([cleanDetail, street, extraCity, extraRegion]);
                  return line || "—";
                })()}
              </span>
            }
          />
          <Field label="좌표" value={store.lat != null && store.lng != null ? `${store.lat}, ${store.lng}` : "—"} />
        </ReviewSection>

        <ReviewSection title="업종">
          <Field label="1차" value={<span className="font-medium">{catDb || "—"}</span>} />
          <Field label="2차" value={<span className="font-medium">{topicDb || "—"}</span>} />
          <Field label="business_type" value={dash(store.business_type)} />
          <Field
            label="식별 수정 허용"
            value={store.owner_can_edit_store_identity ? "예 (관리자 허용)" : "아니오 (기본)"}
          />
        </ReviewSection>

        {storeIntro?.trim() ? (
          <ReviewSection title="소개">
            <pre className="whitespace-pre-wrap break-words font-sans sam-text-body-secondary leading-relaxed text-sam-fg">
              {storeIntro.trim()}
            </pre>
          </ReviewSection>
        ) : null}

        {store.revision_note?.trim() ? (
          <ReviewSection title="보완 요청">
            <p className="whitespace-pre-wrap sam-text-body-secondary text-amber-950">{store.revision_note.trim()}</p>
          </ReviewSection>
        ) : null}
        {store.rejected_reason?.trim() ? (
          <ReviewSection title="반려 사유">
            <p className="whitespace-pre-wrap sam-text-body-secondary text-red-900">{store.rejected_reason.trim()}</p>
          </ReviewSection>
        ) : null}
        {store.suspended_reason?.trim() ? (
          <ReviewSection title="정지 사유">
            <p className="whitespace-pre-wrap sam-text-body-secondary text-sam-fg">{store.suspended_reason.trim()}</p>
          </ReviewSection>
        ) : null}

        {imgs.length > 0 ? (
          <ReviewSection title="이미지">
            {imgs.map(({ label, url }) => (
              <div key={label}>
                <p className="mb-1 sam-text-xxs text-sam-muted">{label}</p>
                <a
                  href={url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-ui-rect border border-sam-border"
                >
                  <img src={url!} alt="" className="max-h-48 w-full object-cover" />
                </a>
              </div>
            ))}
          </ReviewSection>
        ) : null}

        {onSetOwnerIdentityEditable ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
            <p className="sam-text-body-secondary font-medium text-sam-fg">오너 식별 수정</p>
            <button
              type="button"
              disabled={identityActionBusy}
              onClick={() => onSetOwnerIdentityEditable(!store.owner_can_edit_store_identity)}
              className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2.5 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-app disabled:opacity-50"
            >
              {identityActionBusy
                ? "처리 중…"
                : store.owner_can_edit_store_identity
                  ? "식별 수정 허용 해제"
                  : "식별 수정 허용하기"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

