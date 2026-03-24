"use client";

import { useState } from "react";
import type { AdminBanner, BannerPlacement, BannerStatus } from "@/lib/types/admin-banner";
import { getBannerPlacements } from "@/lib/admin-banners/mock-banner-placements";

export interface AdminBannerFormValues {
  title: string;
  description: string;
  imageUrl: string;
  mobileImageUrl: string;
  targetUrl: string;
  placement: BannerPlacement;
  priority: number;
  startAt: string;
  endAt: string;
  adminMemo: string;
  status: BannerStatus;
}

const DEFAULT_VALUES: AdminBannerFormValues = {
  title: "",
  description: "",
  imageUrl: "",
  mobileImageUrl: "",
  targetUrl: "",
  placement: "home_top",
  priority: 0,
  startAt: "",
  endAt: "",
  adminMemo: "",
  status: "draft",
};

interface AdminBannerFormProps {
  initial?: Partial<AdminBannerFormValues> | null;
  onSubmit: (values: AdminBannerFormValues) => void;
  submitLabel?: string;
}

export function AdminBannerForm({
  initial,
  onSubmit,
  submitLabel = "저장",
}: AdminBannerFormProps) {
  const [values, setValues] = useState<AdminBannerFormValues>({
    ...DEFAULT_VALUES,
    ...initial,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  const placements = getBannerPlacements();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          제목
        </label>
        <input
          type="text"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
          placeholder="배너 제목"
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          설명
        </label>
        <textarea
          value={values.description}
          onChange={(e) =>
            setValues((v) => ({ ...v, description: e.target.value }))
          }
          rows={2}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
          placeholder="내부용 설명"
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          이미지 URL (데스크톱)
        </label>
        <input
          type="text"
          value={values.imageUrl}
          onChange={(e) => setValues((v) => ({ ...v, imageUrl: e.target.value }))}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
          placeholder="이미지 URL 또는 업로드 예정"
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          이미지 URL (모바일)
        </label>
        <input
          type="text"
          value={values.mobileImageUrl}
          onChange={(e) =>
            setValues((v) => ({ ...v, mobileImageUrl: e.target.value }))
          }
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
          placeholder="모바일 이미지 URL 또는 업로드 예정"
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          클릭 URL
        </label>
        <input
          type="text"
          value={values.targetUrl}
          onChange={(e) => setValues((v) => ({ ...v, targetUrl: e.target.value }))}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
          placeholder="https://..."
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          노출 위치
        </label>
        <select
          value={values.placement}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              placement: e.target.value as BannerPlacement,
            }))
          }
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
        >
          {placements.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label} (최대 {p.maxVisibleCount}개)
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          우선순위 (숫자 작을수록 먼저)
        </label>
        <input
          type="number"
          min={0}
          value={values.priority}
          onChange={(e) =>
            setValues((v) => ({ ...v, priority: parseInt(e.target.value, 10) || 0 }))
          }
          className="w-24 rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[14px] font-medium text-gray-700">
            노출 시작일
          </label>
          <input
            type="datetime-local"
            value={values.startAt ? values.startAt.replace("Z", "").slice(0, 16) : ""}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                startAt: e.target.value ? new Date(e.target.value).toISOString() : "",
              }))
            }
            className="w-full rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
          />
        </div>
        <div>
          <label className="mb-1 block text-[14px] font-medium text-gray-700">
            노출 종료일
          </label>
          <input
            type="datetime-local"
            value={values.endAt ? values.endAt.replace("Z", "").slice(0, 16) : ""}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                endAt: e.target.value ? new Date(e.target.value).toISOString() : "",
              }))
            }
            className="w-full rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          관리자 메모
        </label>
        <textarea
          value={values.adminMemo}
          onChange={(e) =>
            setValues((v) => ({ ...v, adminMemo: e.target.value }))
          }
          rows={2}
          className="w-full rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
          placeholder="내부 메모"
        />
      </div>
      {initial && "status" in initial && (
        <div>
          <label className="mb-1 block text-[14px] font-medium text-gray-700">
            상태
          </label>
          <select
            value={values.status}
            onChange={(e) =>
              setValues((v) => ({ ...v, status: e.target.value as BannerStatus }))
            }
            className="rounded border border-gray-200 px-3 py-2 text-[14px] text-gray-800"
          >
            <option value="draft">초안</option>
            <option value="active">활성</option>
            <option value="paused">일시중지</option>
            <option value="hidden">숨김</option>
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded border border-signature bg-signature px-4 py-2 text-[14px] font-medium text-white hover:bg-signature/90"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
