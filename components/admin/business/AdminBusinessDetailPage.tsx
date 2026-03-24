"use client";

import { useCallback, useState } from "react";
import type { BusinessProfile } from "@/lib/types/business";
import {
  getBusinessProfileById,
  setBusinessProfileAdminMemo,
} from "@/lib/business/mock-business-profiles";
import { getBusinessProfileLogs } from "@/lib/business/mock-business-logs";
import { BUSINESS_STATUS_LABELS } from "@/lib/business/business-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminBusinessActionPanel } from "./AdminBusinessActionPanel";
import { AdminBusinessLogList } from "./AdminBusinessLogList";

interface AdminBusinessDetailPageProps {
  profileId: string;
}

export function AdminBusinessDetailPage({ profileId }: AdminBusinessDetailPageProps) {
  const [refresh, setRefresh] = useState(0);
  const [memoInput, setMemoInput] = useState("");
  const profile = getBusinessProfileById(profileId);
  const logs = getBusinessProfileLogs(profileId);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  if (!profile) {
    return (
      <div className="py-8 text-center text-[14px] text-gray-500">
        상점을 찾을 수 없습니다.
      </div>
    );
  }

  const handleSaveMemo = () => {
    setBusinessProfileAdminMemo(profileId, memoInput);
    setMemoInput("");
    refreshDetail();
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="상점 상세" backHref="/admin/business" />
      <AdminBusinessActionPanel profile={profile} onActionSuccess={refreshDetail} />
      <AdminCard title="상점 정보">
        <dl className="grid gap-2 text-[14px]">
          <div>
            <dt className="text-gray-500">ID</dt>
            <dd className="font-medium text-gray-900">{profile.id}</dd>
          </div>
          <div>
            <dt className="text-gray-500">상점명</dt>
            <dd>{profile.shopName}</dd>
          </div>
          <div>
            <dt className="text-gray-500">slug</dt>
            <dd className="text-gray-700">{profile.slug}</dd>
          </div>
          <div>
            <dt className="text-gray-500">소유자</dt>
            <dd>
              {profile.ownerNickname} ({profile.ownerUserId})
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">상태</dt>
            <dd>
              <span
                className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                  profile.status === "pending"
                    ? "bg-amber-100 text-amber-800"
                    : profile.status === "active"
                      ? "bg-emerald-50 text-emerald-800"
                      : profile.status === "paused"
                        ? "bg-gray-200 text-gray-700"
                        : "bg-red-50 text-red-700"
                }`}
              >
                {BUSINESS_STATUS_LABELS[profile.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">소개</dt>
            <dd className="whitespace-pre-wrap text-gray-700">
              {profile.description || "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">연락처 / 카카오ID</dt>
            <dd className="text-gray-700">
              {profile.phone || "-"} / {profile.kakaoId || "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">지역</dt>
            <dd>{profile.addressLabel || `${profile.region} ${profile.city}` || "-"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">상품 / 후기 / 평점</dt>
            <dd>
              {profile.productCount} / {profile.reviewCount} / ★
              {profile.averageRating.toFixed(1)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">신청일 / 승인일</dt>
            <dd className="text-[13px] text-gray-500">
              {new Date(profile.createdAt).toLocaleString("ko-KR")}
              {profile.approvedAt &&
                ` / ${new Date(profile.approvedAt).toLocaleString("ko-KR")}`}
            </dd>
          </div>
        </dl>
      </AdminCard>
      <AdminCard title="관리자 메모 (placeholder)">
        <div className="flex gap-2">
          <input
            type="text"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            placeholder="메모 입력"
            className="flex-1 rounded border border-gray-200 px-3 py-2 text-[14px]"
          />
          <button
            type="button"
            onClick={handleSaveMemo}
            className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[14px] text-gray-700 hover:bg-gray-100"
          >
            저장
          </button>
        </div>
        {profile.adminMemo && (
          <p className="mt-2 text-[13px] text-gray-600">{profile.adminMemo}</p>
        )}
      </AdminCard>
      <AdminCard title="변경 이력">
        <AdminBusinessLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
