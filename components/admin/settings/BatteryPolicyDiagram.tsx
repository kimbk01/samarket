"use client";

import { TRUST_DAILY_POSITIVE_CAP, TRUST_RECENT_POSITIVE_MULTIPLIER } from "@/lib/trust/trust-score-core";

/**
 * 신뢰 점수 산출·표시 흐름 (어드민 전용 SVG)
 */
export function BatteryPolicyFlowDiagram() {
  const cap = TRUST_DAILY_POSITIVE_CAP;
  const mult = TRUST_RECENT_POSITIVE_MULTIPLIER;
  return (
    <svg viewBox="0 0 760 132" className="h-auto w-full max-w-4xl" aria-hidden>
      <title>신뢰 점수 산출 흐름</title>
      <defs>
        <marker id="arrowTrust" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#6b7280" />
        </marker>
      </defs>

      <rect x="8" y="24" width="132" height="52" rx="8" fill="#f5f3ff" stroke="#ddd6fe" strokeWidth="1.5" />
      <text x="74" y="46" textAnchor="middle" fill="#1f2937" fontSize="11" fontWeight="600">
        거래·행동 이벤트
      </text>
      <text x="74" y="62" textAnchor="middle" fill="#6b7280" fontSize="9">
        trade_complete 등
      </text>

      <line x1="140" y1="50" x2="178" y2="50" stroke="#9ca3af" strokeWidth="1.5" markerEnd="url(#arrowTrust)" />

      <rect x="182" y="18" width="188" height="64" rx="8" fill="#fffbeb" stroke="#fde68a" strokeWidth="1.5" />
      <text x="276" y="40" textAnchor="middle" fill="#1f2937" fontSize="11" fontWeight="600">
        applyTrustScoreDelta
      </text>
      <text x="276" y="56" textAnchor="middle" fill="#4b5563" fontSize="9">
        {`가산 최근30일 ×${mult}`}
      </text>
      <text x="276" y="70" textAnchor="middle" fill="#4b5563" fontSize="9">
        {`일 가산 상한 +${cap} (UTC)`}
      </text>

      <line x1="370" y1="50" x2="408" y2="50" stroke="#9ca3af" strokeWidth="1.5" markerEnd="url(#arrowTrust)" />

      <rect x="412" y="22" width="128" height="56" rx="8" fill="#ecfeff" stroke="#a5f3fc" strokeWidth="1.5" />
      <text x="476" y="44" textAnchor="middle" fill="#1f2937" fontSize="11" fontWeight="600">
        reputation_logs
      </text>
      <text x="476" y="60" textAnchor="middle" fill="#4b5563" fontSize="9">
        감사·델타 기록
      </text>

      <line x1="540" y1="50" x2="578" y2="50" stroke="#9ca3af" strokeWidth="1.5" markerEnd="url(#arrowTrust)" />

      <rect x="582" y="26" width="170" height="48" rx="8" fill="#f0fdf4" stroke="#bbf7d0" strokeWidth="1.5" />
      <text x="667" y="48" textAnchor="middle" fill="#1f2937" fontSize="11" fontWeight="600">
        profiles.trust_score
      </text>
      <text x="667" y="62" textAnchor="middle" fill="#6b7280" fontSize="9">
        0~100 클램프
      </text>

      <text x="8" y="118" fill="#6b7280" fontSize="10">
        UI: trustScoreToUiPercent → mannerBatteryTier (고정 구간 1~6단) + 색상
      </text>
    </svg>
  );
}
