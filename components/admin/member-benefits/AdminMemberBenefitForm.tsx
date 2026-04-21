"use client";

import { useState } from "react";
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { MEMBER_TYPE_OPTIONS } from "@/lib/member-benefits/member-benefit-utils";

interface AdminMemberBenefitFormProps {
  initial?: Partial<MemberBenefitPolicy> | null;
  onSubmit: (values: Partial<MemberBenefitPolicy>) => void;
  onCancel?: () => void;
}

export function AdminMemberBenefitForm({
  initial,
  onSubmit,
  onCancel,
}: AdminMemberBenefitFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [memberType, setMemberType] = useState<"normal" | "premium" | "admin">(
    initial?.memberType ?? "normal"
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [profileFrameType, setProfileFrameType] = useState(initial?.profileFrameType ?? "dark");
  const [badgeLabel, setBadgeLabel] = useState(initial?.badgeLabel ?? "");
  const [homePriorityBoost, setHomePriorityBoost] = useState(
    initial?.homePriorityBoost ?? 0
  );
  const [searchPriorityBoost, setSearchPriorityBoost] = useState(
    initial?.searchPriorityBoost ?? 0
  );
  const [shopFeaturedPriorityBoost, setShopFeaturedPriorityBoost] = useState(
    initial?.shopFeaturedPriorityBoost ?? 0
  );
  const [pointRewardBonusRate, setPointRewardBonusRate] = useState(
    initial?.pointRewardBonusRate ?? 0
  );
  const [adDiscountRate, setAdDiscountRate] = useState(
    initial?.adDiscountRate ?? 0
  );
  const [canOpenBusinessProfile, setCanOpenBusinessProfile] = useState(
    initial?.canOpenBusinessProfile ?? true
  );
  const [canAccessPremiumPromotion, setCanAccessPremiumPromotion] = useState(
    initial?.canAccessPremiumPromotion ?? false
  );
  const [adminMemo, setAdminMemo] = useState(initial?.adminMemo ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: initial?.id,
      memberType,
      title,
      description,
      isActive,
      profileFrameType: profileFrameType as "dark" | "gold" | "admin_special",
      badgeLabel,
      homePriorityBoost,
      searchPriorityBoost,
      shopFeaturedPriorityBoost,
      pointRewardBonusRate,
      adDiscountRate,
      canOpenBusinessProfile,
      canAccessPremiumPromotion,
      adminMemo,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          회원 구분
        </label>
        <select
          value={memberType}
          onChange={(e) =>
            setMemberType(e.target.value as "normal" | "premium" | "admin")
          }
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {MEMBER_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          제목
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          설명
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="benefitActive"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="benefitActive" className="sam-text-body text-sam-fg">
          활성
        </label>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          프로필 액자
        </label>
        <select
          value={profileFrameType}
          onChange={(e) =>
            setProfileFrameType(e.target.value as "dark" | "gold" | "admin_special")
          }
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="dark">dark (기본)</option>
          <option value="gold">gold</option>
          <option value="admin_special">admin_special</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          배지 라벨
        </label>
        <input
          type="text"
          value={badgeLabel}
          onChange={(e) => setBadgeLabel(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
          placeholder="특별회원, 관리자 등"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-0.5 block sam-text-helper text-sam-muted">
            홈 우선
          </label>
          <input
            type="number"
            min={0}
            value={homePriorityBoost}
            onChange={(e) =>
              setHomePriorityBoost(parseInt(e.target.value, 10) || 0)
            }
            className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body"
          />
        </div>
        <div>
          <label className="mb-0.5 block sam-text-helper text-sam-muted">
            검색 우선
          </label>
          <input
            type="number"
            min={0}
            value={searchPriorityBoost}
            onChange={(e) =>
              setSearchPriorityBoost(parseInt(e.target.value, 10) || 0)
            }
            className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body"
          />
        </div>
        <div>
          <label className="mb-0.5 block sam-text-helper text-sam-muted">
            상점 featured
          </label>
          <input
            type="number"
            min={0}
            value={shopFeaturedPriorityBoost}
            onChange={(e) =>
              setShopFeaturedPriorityBoost(parseInt(e.target.value, 10) || 0)
            }
            className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-0.5 block sam-text-helper text-sam-muted">
            포인트 보너스 비율 (0~1)
          </label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={pointRewardBonusRate}
            onChange={(e) =>
              setPointRewardBonusRate(parseFloat(e.target.value) || 0)
            }
            className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body"
          />
        </div>
        <div>
          <label className="mb-0.5 block sam-text-helper text-sam-muted">
            광고 할인율 (0~1)
          </label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={adDiscountRate}
            onChange={(e) =>
              setAdDiscountRate(parseFloat(e.target.value) || 0)
            }
            className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-1 sam-text-body">
          <input
            type="checkbox"
            checked={canOpenBusinessProfile}
            onChange={(e) => setCanOpenBusinessProfile(e.target.checked)}
            className="rounded border-sam-border"
          />
          상점 개설 가능
        </label>
        <label className="flex items-center gap-1 sam-text-body">
          <input
            type="checkbox"
            checked={canAccessPremiumPromotion}
            onChange={(e) => setCanAccessPremiumPromotion(e.target.checked)}
            className="rounded border-sam-border"
          />
          프리미엄 노출 신청 가능
        </label>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          관리자 메모
        </label>
        <textarea
          value={adminMemo}
          onChange={(e) => setAdminMemo(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          저장
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}
