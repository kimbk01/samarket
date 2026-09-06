/**
 * Operator-facing labels for Admin presentation.
 * Canonical enums/tables stay in backend; UI must not dump them as primary copy.
 */

export function adminOperatorLabel(
  raw: string | null | undefined,
  ko: boolean
): string {
  const key = String(raw ?? "").trim();
  if (!key) return "—";
  if (key.includes(" / ")) {
    return key
      .split(" / ")
      .map((part) => adminOperatorLabel(part.trim(), ko))
      .join(" · ");
  }
  if (key.includes(" · ")) {
    return key
      .split(" · ")
      .map((part) => adminOperatorLabel(part.trim(), ko))
      .join(" · ");
  }
  const map = OPERATOR_LABELS[key] ?? OPERATOR_LABELS[key.toUpperCase()];
  if (map) return ko ? map.ko : map.en;
  // Soften snake/screaming cases that slipped through
  if (/^[A-Z][A-Z0-9_./-]+$/.test(key) || key.includes("_") || key.includes("/")) {
    return humanizeToken(key, ko);
  }
  return key;
}

function humanizeToken(key: string, ko: boolean): string {
  const lower = key.toLowerCase().replace(/[./]/g, " ").replace(/_/g, " ");
  if (ko) return `${lower} (확인)`;
  return lower.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Looks like UUID — never use as primary title. */
export function isAdminTechnicalId(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function adminRecentTitle(
  title: string,
  metaKo: string,
  metaEn: string,
  ko: boolean
): string {
  if (isAdminTechnicalId(title) || !title.trim()) {
    return ko ? metaKo || "최근 활동" : metaEn || "Recent activity";
  }
  if (/^\[QA\]/i.test(title) || /__QA_/i.test(title)) {
    const bare = title.replace(/^\[QA\]\s*/i, "").replace(/^__QA_[^_]+_/i, "");
    return ko ? `[테스트] ${bare.slice(0, 48)}` : `[Test] ${bare.slice(0, 48)}`;
  }
  return title;
}

const OPERATOR_LABELS: Record<string, { ko: string; en: string }> = {
  WAITING_ADMIN: { ko: "관리자 검토 대기", en: "Awaiting admin review" },
  SUBMITTED: { ko: "신청 접수", en: "Submitted" },
  ACTIVE: { ko: "집행 중", en: "Active" },
  PENDING: { ko: "대기", en: "Pending" },
  PENDING_REVIEW: { ko: "검토 대기", en: "Pending review" },
  UNDER_REVIEW: { ko: "검수 중", en: "Under review" },
  SCHEDULED: { ko: "정산 예정", en: "Scheduled" },
  HELD: { ko: "보류", en: "Held" },
  SALE_EARN: { ko: "판매 Coin 적립", en: "Sale Coin credit" },
  CONVERT_TO_BUSINESS_CASH: { ko: "Coin → Cash 전환", en: "Coin → Cash conversion" },
  ledger: { ko: "원장 기록", en: "Ledger entry" },
  debit: { ko: "차감", en: "Debit" },
  credit: { ko: "적립", en: "Credit" },
  "SALE_FEE/debit": { ko: "판매 수수료 차감", en: "Sale fee debit" },
  "PARTNER_SPEND/debit": { ko: "Partner 이용료", en: "Partner fee debit" },
  "TOP_UP/credit": { ko: "Cash 충전", en: "Cash top-up" },
  "AD_SPEND/debit": { ko: "광고비 차감", en: "Ad spend debit" },
  SALE_FEE: { ko: "판매 수수료", en: "Sale fee" },
  PARTNER_SPEND: { ko: "Partner 이용료", en: "Partner spend" },
  TOP_UP: { ko: "Cash 충전", en: "Cash top-up" },
  AD_SPEND: { ko: "광고비", en: "Ad spend" },
  DELIVERY: { ko: "배달 광고", en: "Delivery ads" },
  FEED: { ko: "피드 광고", en: "Feed ads" },
  POPUP: { ko: "팝업", en: "Popup" },
  store_sponsored: { ko: "매장 홍보", en: "Store promotion" },
  banner: { ko: "배너", en: "Banner" },
  general_direct: { ko: "일반 1:1 채팅", en: "General 1:1 chat" },
  group: { ko: "그룹 채팅", en: "Group chat" },
  community_reports: { ko: "커뮤니티 신고", en: "Community reports" },
  DAILY_CRITICAL: { ko: "지금 처리할 일", en: "Handle now" },
  FREQUENT: { ko: "자주 쓰는 관리", en: "Frequent ops" },
  OCCASIONAL: { ko: "보조 관리", en: "Occasional" },
  CONFIGURATION: { ko: "설정", en: "Settings" },
  ARCHIVE: { ko: "기록", en: "Archive" },
  POINT_CHARGE: { ko: "Point 충전 요청", en: "Point top-up request" },
  point_charge: { ko: "Point 충전 요청", en: "Point top-up request" },
  CASH_CHARGE: { ko: "Cash 충전 요청", en: "Cash top-up request" },
  cash_topup: { ko: "Cash 충전 요청", en: "Cash top-up request" },
  SETTLEMENT: { ko: "정산", en: "Settlement" },
  settlement: { ko: "정산 예정", en: "Settlement scheduled" },
  FEE_OBLIGATION: { ko: "미납 판매수수료", en: "Unpaid sale fee" },
  fee_obligation: { ko: "미납 판매수수료", en: "Unpaid sale fee" },
  COIN_WITHDRAWAL: { ko: "Coin 출금", en: "Coin withdrawal" },
  coin_withdrawal: { ko: "Coin 출금", en: "Coin withdrawal" },
  refund: { ko: "환불 / 조정", en: "Refund / adjustment" },
  waiting_confirm: { ko: "입금 확인 대기", en: "Awaiting deposit confirm" },
  scheduled: { ko: "정산 예정", en: "Scheduled" },
  store_settlements: { ko: "정산", en: "Settlements" },
  store_sale_fee_obligations: { ko: "미납 수수료", en: "Fee obligations" },
  point_charge_requests: { ko: "Point 충전", en: "Point charges" },
  business_cash_charge_requests: { ko: "Cash 충전", en: "Cash charges" },
  delivery: { ko: "배달 광고", en: "Delivery ads" },
  feed: { ko: "피드 광고", en: "Feed ads" },
  popup: { ko: "팝업", en: "Popup" },
  trade_promote: { ko: "거래 홍보", en: "Trade promote" },
  active: { ko: "활성", en: "Active" },
  "APPLICATION REVIEW": { ko: "신청 검토", en: "Application review" },
  "CREATIVE REVIEW": { ko: "소재 검토", en: "Creative review" },
  "SCHEDULE / EXECUTION": { ko: "일정·집행", en: "Schedule / execution" },
  "ENDED / HISTORY": { ko: "종료·이력", en: "Ended / history" },
  STORES_HOME_FEED: { ko: "배달 홈 매장 광고", en: "Stores home feed" },
  reason_required: { ko: "사유를 입력해 주세요.", en: "Please enter a reason." },
  "applied_rate=NOT_AVAILABLE": { ko: "당시 적용 환율 기록 없음", en: "Applied rate not recorded" },
  NOT_AVAILABLE: { ko: "기록 없음", en: "Not available" },
};

export function adminFinanceActionTitle(type: string, ko: boolean): string {
  return adminOperatorLabel(type, ko);
}

export function adminStripTechnicalMeta(meta: string | null | undefined, ko: boolean): string {
  const m = String(meta ?? "").trim();
  if (!m) return "";
  if (/applied_rate\s*=\s*NOT_AVAILABLE/i.test(m)) {
    return ko ? "당시 적용 환율 기록 없음" : "Applied rate not recorded";
  }
  if (/^[a-z_]+:[0-9a-f-]{8,}$/i.test(m)) return "";
  return adminOperatorLabel(m, ko);
}

/** Map API/validation keys to operator-facing sentences. Never render raw keys. */
export function adminOperatorErrorMessage(
  raw: string | null | undefined,
  ko: boolean
): string {
  const key = String(raw ?? "").trim();
  if (!key) return ko ? "처리하지 못했습니다." : "Could not complete the action.";
  const known: Record<string, { ko: string; en: string }> = {
    reason_required: {
      ko: "사유를 입력해 주세요.",
      en: "Please enter a reason.",
    },
    network_error: {
      ko: "네트워크 오류가 발생했습니다. 다시 시도해 주세요.",
      en: "Network error. Please try again.",
    },
    load_failed: {
      ko: "불러오지 못했습니다.",
      en: "Could not load.",
    },
    action_failed: {
      ko: "조치를 완료하지 못했습니다.",
      en: "Action failed.",
    },
    update_failed: {
      ko: "저장하지 못했습니다.",
      en: "Update failed.",
    },
    funding_required: {
      ko: "결제(Cash)가 확보되지 않아 승인할 수 없습니다.",
      en: "Cannot approve until Cash funding is secured.",
    },
  };
  if (known[key]) return ko ? known[key].ko : known[key].en;
  if (OPERATOR_LABELS[key]) return adminOperatorLabel(key, ko);
  if (/^[a-z][a-z0-9_]*$/i.test(key) && key.includes("_")) {
    return ko ? "처리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." : "Could not complete. Please try again.";
  }
  return key;
}

export function adminAdsEligibilityNote(
  eligibility: string | null | undefined,
  ko: boolean
): string {
  const e = String(eligibility ?? "").trim();
  if (!e) return "";
  if (/organic ranking/i.test(e) || /store sponsored/i.test(e)) {
    return ko
      ? "일반 노출(광고 아님)과 별개로 검토가 필요합니다."
      : "Separate from organic ranking — admin review required.";
  }
  if (/payment\s*!=\s*approval/i.test(e) || /payment≠approval/i.test(e) || /payment != approval/i.test(e)) {
    return ko
      ? "결제 완료만으로 승인되지 않습니다. 관리자 심사가 필요합니다."
      : "Payment alone is not approval — admin review required.";
  }
  if (/requires admin approval/i.test(e) || /WAITING_ADMIN/i.test(e)) {
    return ko ? "관리자 검토가 필요합니다." : "Admin review required.";
  }
  if (/BANNER product/i.test(e) || /Placement Map/i.test(e)) {
    return ko ? "배너 소재·노출 위치를 상세에서 확인하세요." : "Check banner creative and placement on detail.";
  }
  if (/NOT_ELIGIBLE|not eligible/i.test(e)) {
    return ko ? "지금은 고객 화면에 노출되지 않습니다." : "Not currently eligible for customer exposure.";
  }
  // Avoid dumping long English developer notes
  if (/[=≠>]/.test(e) || /_[A-Z]/.test(e) || e.length > 80) {
    return ko ? "상세에서 처리 조건을 확인하세요." : "See detail for processing conditions.";
  }
  return adminOperatorLabel(e, ko);
}

export function adminFinancePrimaryCta(
  type: string,
  ko: boolean
): string {
  switch (type) {
    case "point_charge":
      return ko ? "충전 요청 확인" : "Review Point top-up";
    case "cash_topup":
      return ko ? "충전 요청 확인" : "Review Cash top-up";
    case "settlement":
      return ko ? "정산 확인" : "Review settlement";
    case "fee_obligation":
      return ko ? "미납 확인" : "Review unpaid fee";
    case "coin_withdrawal":
      return ko ? "출금 검토" : "Review withdrawal";
    case "refund":
      return ko ? "환불 검토" : "Review refund";
    default:
      return ko ? "검토하기" : "Review";
  }
}

export function adminDisplayApplicantLabel(label: string, ko: boolean): string {
  return adminRecentTitle(label, ko ? "광고 신청" : "Ad application", "Ad application", ko);
}
