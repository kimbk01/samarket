"use client";

import { useEffect, type ReactNode } from "react";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import { formatPhMobileDisplay, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import {
  STORE_ADDRESS_DETAIL_LABEL,
  STORE_ADDRESS_STREET_LABEL,
  STORE_LOCATION_SECTION_HINT_APPLY,
} from "@/lib/stores/store-address-form-ui";

function embedRelationName(
  v: { name?: string } | { name?: string }[] | null | undefined
): string {
  if (v == null) return "";
  if (Array.isArray(v)) return (v[0]?.name ?? "").trim();
  return (v.name ?? "").trim();
}

export type AdminStoreReviewRow = {
  id: string;
  store_name: string;
  slug: string;
  owner_user_id: string;
  applicant_nickname?: string | null;
  approval_status: string;
  is_visible: boolean;
  business_type: string | null;
  store_category_id?: string | null;
  store_topic_id?: string | null;
  owner_can_edit_store_identity?: boolean;
  store_categories?: { name?: string } | { name?: string }[] | null;
  store_topics?: { name?: string } | { name?: string }[] | null;
  description: string | null;
  kakao_id: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  address_line1: string | null;
  address_line2: string | null;
  lat: number | null;
  lng: number | null;
  profile_image_url: string | null;
  created_at: string;
  approved_at: string | null;
  rejected_reason: string | null;
  revision_note: string | null;
  suspended_reason: string | null;
};

export const ADMIN_STORE_APPROVAL_LABEL: Record<string, string> = {
  pending: "신청대기",
  under_review: "검토중",
  revision_requested: "보완요청",
  approved: "승인",
  rejected: "반려",
  suspended: "정지",
};

function dash(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return t || "—";
}

/** 신청 폼 기준: 주소 한 줄이 district·address_line1에 동기 저장 */
export function formatAdminStoreAddressOneLine(r: AdminStoreReviewRow): string {
  const d = (r.district ?? "").trim();
  const a1 = (r.address_line1 ?? "").trim();
  const a2 = (r.address_line2 ?? "").trim();
  const detail = d && a1 && d === a1 ? d : [d, a1].filter(Boolean).join(" ");
  const parts = [r.region, r.city, detail, a2].map((x) => (x ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
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
      <h3 className="text-[13px] font-bold text-sam-fg">{title}</h3>
      {hint ? <p className="mt-1 text-[11px] leading-relaxed text-sam-muted">{hint}</p> : null}
      <div className="mt-2 space-y-2.5">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-sam-muted">{label}</p>
      <div className="mt-0.5 text-[13px] text-sam-fg">{value}</div>
    </div>
  );
}

interface AdminStoreReviewSheetProps {
  store: AdminStoreReviewRow | null;
  onClose: () => void;
  onSetOwnerIdentityEditable?: (enabled: boolean) => void;
  identityActionBusy?: boolean;
}

export function AdminStoreReviewSheet({
  store,
  onClose,
  onSetOwnerIdentityEditable,
  identityActionBusy,
}: AdminStoreReviewSheetProps) {
  useEffect(() => {
    if (!store) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, onClose]);

  if (!store) return null;

  const statusKo = ADMIN_STORE_APPROVAL_LABEL[store.approval_status] ?? store.approval_status;
  const { intro: storeIntro, kakao: storeKakao } = splitStoreDescriptionAndKakao(
    store.description,
    store.kakao_id
  );
  const d = (store.district ?? "").trim();
  const a1 = (store.address_line1 ?? "").trim();
  const sameDetail = d && a1 && d === a1;

  const gcashNoDigits = parsePhMobileInput(store.email ?? "");
  const gcashNoDisplay =
    gcashNoDigits.length === 11 ? formatPhMobileDisplay(gcashNoDigits) : dash(store.email);

  const catDb = embedRelationName(store.store_categories);
  const topicDb = embedRelationName(store.store_topics);

  const imgs = [{ label: "프로필 이미지", url: store.profile_image_url }].filter((x) => x.url?.trim());

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="닫기"
        onClick={onClose}
      />
      <aside
        className="relative flex h-full w-full max-w-lg flex-col border-l border-sam-border bg-sam-surface shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="store-review-sheet-title"
      >
        <div className="flex items-center justify-between border-b border-sam-border-soft px-4 py-3">
          <h2 id="store-review-sheet-title" className="text-[16px] font-semibold text-sam-fg">
            매장 신청 심사
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-ui-rect px-3 py-1.5 text-[13px] font-medium text-sam-muted hover:bg-sam-surface-muted"
          >
            닫기
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="rounded-ui-rect border border-signature/20 bg-signature/5 px-3 py-3">
            <p className="text-[12px] text-sam-muted">
              아래 순서는 <code className="rounded bg-sam-surface/80 px-1">/my/business/apply</code> 신청 폼과
              동일합니다. DB 컬럼 <code className="rounded bg-sam-surface/80 px-1">applicant_nickname</code>이
              없으면 오너 <code className="rounded bg-sam-surface/80 px-1">profiles.nickname</code>으로 표시됩니다.
            </p>
          </div>

          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sam-ink px-2.5 py-0.5 text-[11px] font-bold text-white">
                {statusKo}
              </span>
              {store.is_visible ?
                <span className="text-[11px] font-medium text-emerald-700">노출 Y</span>
              : <span className="text-[11px] font-medium text-sam-muted">노출 N</span>}
            </div>
            <p className="mt-2 text-[17px] font-bold text-sam-fg">{dash(store.store_name)}</p>
            <p className="mt-1 font-mono text-[11px] text-sam-muted">/stores/{store.slug}</p>
            <p className="mt-2 text-[12px] text-sam-muted">
              신청 {new Date(store.created_at).toLocaleString("ko-KR")}
              {store.approved_at ?
                <> · 승인 {new Date(store.approved_at).toLocaleString("ko-KR")}</>
              : null}
            </p>
          </div>

          <ReviewSection
            title="1. 신청자 정보"
            hint="신청 폼의 「신청자 닉네임」과 동일 의미입니다."
          >
            <Field
              label="신청자 닉네임 *"
              value={
                <span className="font-medium">
                  {dash(store.applicant_nickname)}
                  {!store.applicant_nickname?.trim() ?
                    <span className="ml-1 text-[11px] font-normal text-sam-meta">(미전달)</span>
                  : null}
                </span>
              }
            />
          </ReviewSection>

          <ReviewSection title="2. 매장 정보" hint="신청 폼의 상점 이름·소개·연락처·카카오 블록과 대응합니다.">
            <Field label="상점 이름 *" value={<span className="font-medium">{dash(store.store_name)}</span>} />
            <Field
              label="상점 소개"
              value={
                storeIntro?.trim() ?
                  <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed">
                    {storeIntro.trim()}
                  </pre>
                : (
                  "—"
                )
              }
            />
            <Field label="연락처" value={dash(store.phone)} />
            <Field label="카카오톡 ID (선택)" value={dash(storeKakao)} />
          </ReviewSection>

          <ReviewSection title="3. 위치" hint={STORE_LOCATION_SECTION_HINT_APPLY}>
            <Field
              label="지역 · 동네 (표시명)"
              value={(() => {
                const reg = (store.region ?? "").trim();
                const city = (store.city ?? "").trim();
                if (!reg && !city) return "—";
                return [reg, city].filter(Boolean).join(" · ");
              })()}
            />
            <Field
              label={STORE_ADDRESS_STREET_LABEL}
              value={sameDetail ? (d ? d : "—") : dash(store.district) || dash(store.address_line1)}
            />
            {!sameDetail ?
              <Field label="address_line1 (DB)" value={dash(store.address_line1)} />
            : null}
            <Field label={STORE_ADDRESS_DETAIL_LABEL} value={dash(store.address_line2)} />
            <Field
              label="한 줄 주소 (검수)"
              value={<span className="font-medium text-sam-fg">{formatAdminStoreAddressOneLine(store)}</span>}
            />
          </ReviewSection>

          <ReviewSection title="4. 업종" hint="신청 폼 1차·2차 업종 선택과 DB taxonomy 연결">
            <Field label="1차 업종 (store_categories)" value={catDb || "—"} />
            <Field label="2차 업종 (store_topics)" value={topicDb || "—"} />
            <Field label="업종 표기 (business_type)" value={dash(store.business_type)} />
            <Field
              label="오너 매장명·업종 수정 허용"
              value={store.owner_can_edit_store_identity ? "예 (관리자 허용)" : "아니오 (기본)"}
            />
          </ReviewSection>

          <ReviewSection title="5. 정산·연동 필드 (DB 기타)" hint="신청 폼에 없을 수 있는 기존 스키마 필드입니다.">
            <Field label="GCash no. (email 칼럼 활용 시)" value={gcashNoDisplay} />
            <Field label="GCash name (website_url)" value={dash(store.website_url)} />
            <Field
              label="좌표"
              value={
                store.lat != null && store.lng != null ? `${store.lat}, ${store.lng}` : "—"
              }
            />
            <Field
              label="오너 user id"
              value={<span className="break-all font-mono text-[11px]">{store.owner_user_id}</span>}
            />
          </ReviewSection>

          {store.revision_note?.trim() ?
            <ReviewSection title="보완 요청">
              <p className="whitespace-pre-wrap text-[13px] text-amber-950">{store.revision_note.trim()}</p>
            </ReviewSection>
          : null}
          {store.rejected_reason?.trim() ?
            <ReviewSection title="반려 사유">
              <p className="whitespace-pre-wrap text-[13px] text-red-900">{store.rejected_reason.trim()}</p>
            </ReviewSection>
          : null}
          {store.suspended_reason?.trim() ?
            <ReviewSection title="정지 사유">
              <p className="whitespace-pre-wrap text-[13px] text-sam-fg">{store.suspended_reason.trim()}</p>
            </ReviewSection>
          : null}

          {imgs.length > 0 ?
            <ReviewSection title="이미지">
              {imgs.map(({ label, url }) => (
                <div key={label}>
                  <p className="mb-1 text-[11px] text-sam-muted">{label}</p>
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
          : null}

          {onSetOwnerIdentityEditable ?
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              <p className="text-[13px] font-medium text-sam-fg">매장 관리자 수정 권한</p>
              <p className="mt-1 text-[12px] leading-relaxed text-sam-muted">
                허용 시 오너는 기본 정보에서 매장 이름·1차·2차 업종을 직접 수정할 수 있습니다.
              </p>
              <button
                type="button"
                disabled={identityActionBusy}
                onClick={() => onSetOwnerIdentityEditable(!store.owner_can_edit_store_identity)}
                className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2.5 text-[13px] font-medium text-sam-fg disabled:opacity-50"
              >
                {identityActionBusy ?
                  "처리 중…"
                : store.owner_can_edit_store_identity ?
                  "식별 수정 허용 해제"
                : "식별 수정 허용하기"}
              </button>
            </div>
          : null}
        </div>
      </aside>
    </div>
  );
}
