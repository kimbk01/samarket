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
    <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="sam-text-body font-medium text-sam-fg">
          점수 상세: {candidate.title} ({candidate.id})
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="sam-text-body-secondary text-sam-muted hover:underline"
        >
          닫기
        </button>
      </div>
      <dl className="grid grid-cols-1 gap-2 sam-text-body sm:grid-cols-2">
        <div>
          <dt className="text-sam-muted">판매자 / 구분</dt>
          <dd>
            {candidate.sellerNickname} · {MEMBER_TYPE_LABELS[candidate.memberType]}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">광고 / 포인트 / 상점</dt>
          <dd>
            {candidate.adPromotionStatus} / {candidate.pointPromotionStatus} /{" "}
            {candidate.shopFeaturedStatus}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">baseLatestScore</dt>
          <dd>{result.baseLatestScore.toFixed(4)}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">basePopularScore</dt>
          <dd>{result.basePopularScore.toFixed(4)}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">baseNearbyScore</dt>
          <dd>{result.baseNearbyScore.toFixed(4)}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">premiumBoostScore</dt>
          <dd>{result.premiumBoostScore}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">businessBoostScore</dt>
          <dd>{result.businessBoostScore}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">adBoostScore</dt>
          <dd>{result.adBoostScore}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">pointPromotionBoostScore</dt>
          <dd>{result.pointPromotionBoostScore}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">bumpBoostScore</dt>
          <dd>{result.bumpBoostScore}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">regionMatchScore</dt>
          <dd>{result.regionMatchScore}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">finalScore</dt>
          <dd className="font-semibold text-sam-fg">{result.finalScore}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sam-muted">appliedReasons</dt>
          <dd>{result.appliedReasons.join(", ") || "-"}</dd>
        </div>
      </dl>
    </div>
  );
}
