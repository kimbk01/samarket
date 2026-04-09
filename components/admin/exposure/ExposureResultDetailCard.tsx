"use client";

import type { ExposureCandidate } from "@/lib/types/exposure";
import type { ExposureScoreResult } from "@/lib/types/exposure";
import { MEMBER_TYPE_LABELS } from "@/lib/member-benefits/member-benefit-utils";

interface ExposureResultDetailCardProps {
  candidate: ExposureCandidate;
  result: ExposureScoreResult;
  onClose: () => void;
}

export function ExposureResultDetailCard({
  candidate,
  result,
  onClose,
}: ExposureResultDetailCardProps) {
  return (
    <div className="rounded-ui-rect border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-medium text-gray-900">
          점수 상세: {candidate.title} ({candidate.id})
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[13px] text-gray-600 hover:underline"
        >
          닫기
        </button>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-[14px] sm:grid-cols-2">
        <div>
          <dt className="text-gray-500">판매자 / 구분</dt>
          <dd>
            {candidate.sellerNickname} · {MEMBER_TYPE_LABELS[candidate.memberType]}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">광고 / 포인트 / 상점</dt>
          <dd>
            {candidate.adPromotionStatus} / {candidate.pointPromotionStatus} /{" "}
            {candidate.shopFeaturedStatus}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">baseLatestScore</dt>
          <dd>{result.baseLatestScore.toFixed(4)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">basePopularScore</dt>
          <dd>{result.basePopularScore.toFixed(4)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">baseNearbyScore</dt>
          <dd>{result.baseNearbyScore.toFixed(4)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">premiumBoostScore</dt>
          <dd>{result.premiumBoostScore}</dd>
        </div>
        <div>
          <dt className="text-gray-500">businessBoostScore</dt>
          <dd>{result.businessBoostScore}</dd>
        </div>
        <div>
          <dt className="text-gray-500">adBoostScore</dt>
          <dd>{result.adBoostScore}</dd>
        </div>
        <div>
          <dt className="text-gray-500">pointPromotionBoostScore</dt>
          <dd>{result.pointPromotionBoostScore}</dd>
        </div>
        <div>
          <dt className="text-gray-500">bumpBoostScore</dt>
          <dd>{result.bumpBoostScore}</dd>
        </div>
        <div>
          <dt className="text-gray-500">regionMatchScore</dt>
          <dd>{result.regionMatchScore}</dd>
        </div>
        <div>
          <dt className="text-gray-500">finalScore</dt>
          <dd className="font-semibold text-gray-900">{result.finalScore}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-gray-500">appliedReasons</dt>
          <dd>{result.appliedReasons.join(", ") || "-"}</dd>
        </div>
      </dl>
    </div>
  );
}
