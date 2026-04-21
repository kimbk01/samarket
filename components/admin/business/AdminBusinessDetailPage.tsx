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
      <div className="py-8 text-center sam-text-body text-sam-muted">
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
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">ID</dt>
            <dd className="font-medium text-sam-fg">{profile.id}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">상점명</dt>
            <dd>{profile.shopName}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">slug</dt>
            <dd className="text-sam-fg">{profile.slug}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">소유자</dt>
            <dd>
              {profile.ownerNickname} ({profile.ownerUserId})
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">상태</dt>
            <dd>
              <span
                className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                  profile.status === "pending"
                    ? "bg-amber-100 text-amber-800"
                    : profile.status === "active"
                      ? "bg-emerald-50 text-emerald-800"
                      : profile.status === "paused"
                        ? "bg-sam-border-soft text-sam-fg"
                        : "bg-red-50 text-red-700"
                }`}
              >
                {BUSINESS_STATUS_LABELS[profile.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">소개</dt>
            <dd className="whitespace-pre-wrap text-sam-fg">
              {profile.description || "-"}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">연락처 / 카카오ID</dt>
            <dd className="text-sam-fg">
              {profile.phone || "-"} / {profile.kakaoId || "-"}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">지역·주소</dt>
            <dd className="space-y-1 text-sam-fg">
              <div>
                {[profile.region, profile.city].filter((x) => String(x ?? "").trim()).join(" · ") ||
                  "—"}
              </div>
              {(profile.addressStreetLine ?? "").trim() ||
              (profile.addressDetail ?? "").trim() ? (
                <>
                  {(profile.addressStreetLine ?? "").trim() ? (
                    <div className="sam-text-body-secondary">{(profile.addressStreetLine ?? "").trim()}</div>
                  ) : null}
                  {(profile.addressDetail ?? "").trim() ? (
                    <div className="sam-text-body-secondary text-sam-muted">
                      {(profile.addressDetail ?? "").trim()}
                    </div>
                  ) : null}
                </>
              ) : (profile.addressLabel ?? "").trim() ? (
                <div className="sam-text-body-secondary">{(profile.addressLabel ?? "").trim()}</div>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">상품 / 후기 / 평점</dt>
            <dd>
              {profile.productCount} / {profile.reviewCount} / ★
              {profile.averageRating.toFixed(1)}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">신청일 / 승인일</dt>
            <dd className="sam-text-body-secondary text-sam-muted">
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
            className="flex-1 rounded border border-sam-border px-3 py-2 sam-text-body"
          />
          <button
            type="button"
            onClick={handleSaveMemo}
            className="rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-surface-muted"
          >
            저장
          </button>
        </div>
        {profile.adminMemo && (
          <p className="mt-2 sam-text-body-secondary text-sam-muted">{profile.adminMemo}</p>
        )}
      </AdminCard>
      <AdminCard title="변경 이력">
        <AdminBusinessLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
