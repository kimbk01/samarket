"use client";

import { useEffect, type ReactNode } from "react";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import { formatPhMobileDisplay, parsePhMobileInput } from "@/lib/utils/ph-mobile";

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

/** 신청 폼 기준: district·address_line1에 동일 값이 중복 저장될 수 있음 */
export function formatAdminStoreAddressOneLine(r: AdminStoreReviewRow): string {
  const d = (r.district ?? "").trim();
  const a1 = (r.address_line1 ?? "").trim();
  const a2 = (r.address_line2 ?? "").trim();
  const detail =
    d && a1 && d === a1 ? d : [d, a1].filter(Boolean).join(" ");
  const parts = [r.region, r.city, detail, a2].map((x) => (x ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

interface AdminStoreReviewSheetProps {
  store: AdminStoreReviewRow | null;
  onClose: () => void;
  /** 관리자: 매장 관리자 기본 정보에서 매장명·업종 수정 허용 토글 */
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

  const rows: { label: string; value: ReactNode }[] = [
    { label: "매장 이름 (DB · store_name)", value: dash(store.store_name) },
    { label: "URL 슬러그", value: <span className="font-mono text-[12px]">/stores/{store.slug}</span> },
    { label: "심사 상태", value: `${statusKo} (${store.approval_status})` },
    { label: "노출", value: store.is_visible ? "Y" : "N" },
    {
      label: "1차 업종 (DB · store_categories)",
      value: catDb ? catDb : "—",
    },
    {
      label: "세부 주제 (DB · store_topics)",
      value: topicDb ? topicDb : "—",
    },
    {
      label: "업종 표기 (business_type)",
      value: dash(store.business_type),
    },
    {
      label: "오너 매장명·업종 수정 허용",
      value: store.owner_can_edit_store_identity ? "예 (관리자 허용)" : "아니오 (기본)",
    },
    { label: "시·도", value: dash(store.region) },
    { label: "시·군·구", value: dash(store.city) },
    {
      label: "읍·면·동·번지 (district)",
      value: sameDetail ? (d ? d : "—") : dash(store.district),
    },
    {
      label: "상세 주소 (address_line1)",
      value: sameDetail ? "↑ district와 동일" : dash(store.address_line1),
    },
    { label: "추가 주소 (address_line2)", value: dash(store.address_line2) },
    {
      label: "한 줄 주소 (검수용)",
      value: <span className="font-medium text-gray-900">{formatAdminStoreAddressOneLine(store)}</span>,
    },
    { label: "전화번호 (연락처)", value: dash(store.phone) },
    { label: "카카오톡 ID", value: dash(storeKakao) },
    { label: "GCash no.", value: gcashNoDisplay },
    { label: "GCash name", value: dash(store.website_url) },
    {
      label: "상점 소개 (카카오·전화 제외)",
      value: storeIntro?.trim() ? (
        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-gray-800">
          {storeIntro.trim()}
        </pre>
      ) : (
        "—"
      ),
    },
    {
      label: "좌표",
      value:
        store.lat != null && store.lng != null
          ? `${store.lat}, ${store.lng}`
          : "—",
    },
    {
      label: "오너 user id",
      value: <span className="break-all font-mono text-[11px]">{store.owner_user_id}</span>,
    },
    {
      label: "신청일",
      value: new Date(store.created_at).toLocaleString("ko-KR"),
    },
    {
      label: "승인일",
      value: store.approved_at ? new Date(store.approved_at).toLocaleString("ko-KR") : "—",
    },
  ];

  if (store.revision_note?.trim()) {
    rows.push({ label: "보완 요청 메모", value: store.revision_note.trim() });
  }
  if (store.rejected_reason?.trim()) {
    rows.push({ label: "반려 사유", value: store.rejected_reason.trim() });
  }
  if (store.suspended_reason?.trim()) {
    rows.push({ label: "정지 사유", value: store.suspended_reason.trim() });
  }

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
        className="relative flex h-full w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="store-review-sheet-title"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 id="store-review-sheet-title" className="text-[16px] font-semibold text-gray-900">
            신청 정보
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-gray-600 hover:bg-gray-100"
          >
            닫기
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <p className="mb-4 text-[12px] leading-relaxed text-gray-500">
            매장 등록 신청(
            <code className="rounded bg-gray-100 px-1">/my/business/apply</code>)과 동일한 DB 필드 기준입니다.
          </p>
          <dl className="space-y-3 text-[13px]">
            {rows.map(({ label, value }) => (
              <div key={label} className="border-b border-gray-100 pb-3 last:border-0">
                <dt className="mb-1 text-[12px] font-medium text-gray-500">{label}</dt>
                <dd className="text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
          {imgs.length > 0 ? (
            <div className="mt-6 space-y-4">
              <h3 className="text-[13px] font-semibold text-gray-800">이미지</h3>
              {imgs.map(({ label, url }) => (
                <div key={label}>
                  <p className="mb-1 text-[12px] text-gray-500">{label}</p>
                  <a
                    href={url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-gray-200"
                  >
                    { }
                    <img src={url!} alt="" className="max-h-48 w-full object-cover" />
                  </a>
                </div>
              ))}
            </div>
          ) : null}
          {onSetOwnerIdentityEditable ? (
            <div className="mt-6 border-t border-gray-200 pt-4">
              <p className="mb-2 text-[13px] font-medium text-gray-900">매장 관리자 수정 권한</p>
              <p className="mb-3 text-[12px] leading-relaxed text-gray-600">
                허용 시 해당 매장 오너는 기본 정보 화면에서 매장 이름·1차 업종·세부 주제를 직접 수정할 수
                있습니다. 공개 매장 창은 DB와 동일하게 갱신됩니다.
              </p>
              <button
                type="button"
                disabled={identityActionBusy}
                onClick={() => onSetOwnerIdentityEditable(!store.owner_can_edit_store_identity)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-[13px] font-medium text-gray-900 disabled:opacity-50"
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
      </aside>
    </div>
  );
}
