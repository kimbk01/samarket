"use client";

import type { BusinessProfile } from "@/lib/types/business";
import { BUSINESS_STATUS_LABELS } from "@/lib/business/business-utils";

interface BusinessProfileViewProps {
  profile: BusinessProfile;
  isOwner?: boolean;
}

export function BusinessProfileView({ profile, isOwner }: BusinessProfileViewProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-gray-200">
            {profile.logoUrl ? (
               
              <img src={profile.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-semibold text-gray-900">
              {profile.shopName}
            </h1>
            {profile.addressLabel && (
              <p className="mt-0.5 text-[13px] text-gray-500">
                {profile.addressLabel}
              </p>
            )}
            {isOwner && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-[12px] text-gray-600">
                  {BUSINESS_STATUS_LABELS[profile.status]}
                </span>
                {profile.approvalStatusRaw === "approved" && (
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[12px] ${
                      profile.isVisible ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
                    }`}
                  >
                    {profile.isVisible ? "공개 노출" : "비공개"}
                  </span>
                )}
              </div>
            )}
            {isOwner && (profile.storeCategoryName || profile.storeTopicName) && (
              <p className="mt-1.5 text-[12px] text-gray-500">
                노출 분류:{" "}
                {[profile.storeCategoryName, profile.storeTopicName].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
        {profile.description && (
          <p className="mt-3 text-[14px] text-gray-700 whitespace-pre-wrap">
            {profile.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-[13px] text-gray-500">
          <span>상품 {profile.productCount}개</span>
          <span>팔로워 {profile.followerCount}</span>
          {profile.reviewCount > 0 && (
            <span>
              후기 {profile.reviewCount} · ★ {profile.averageRating.toFixed(1)}
            </span>
          )}
        </div>
        {(profile.phone || profile.kakaoId) && (
          <div className="mt-3 border-t border-gray-100 pt-3 text-[13px] text-gray-600">
            {profile.phone && <p>연락처: {profile.phone}</p>}
            {profile.kakaoId && (
              <p>카카오톡 ID: {profile.kakaoId} (placeholder)</p>
            )}
          </div>
        )}
      </div>
      {/* 상점 후기 요약 placeholder */}
      {profile.reviewCount > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-[15px] font-medium text-gray-900">후기 요약</h2>
          <p className="mt-1 text-[13px] text-gray-500">
            후기 {profile.reviewCount}개 · 평균 ★ {profile.averageRating.toFixed(1)}
            (상세 후기 목록 연결 예정)
          </p>
        </div>
      )}
    </div>
  );
}
