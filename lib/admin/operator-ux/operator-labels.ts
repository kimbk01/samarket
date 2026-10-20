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
    forbidden: { ko: "이 작업을 할 권한이 없습니다.", en: "You do not have permission for this action." },
    forbidden_permission: {
      ko: "이 작업에 필요한 관리자 권한이 없습니다. 최고 관리자에게 권한을 요청하세요.",
      en: "You lack the admin permission for this action. Ask a super admin.",
    },
    super_admin_only: { ko: "최고 관리자만 할 수 있는 작업입니다.", en: "Only a super admin can do this." },
    legacy_setting_retired: {
      ko: "더 이상 쓰지 않는 설정입니다. 수수료는 '수수료 정책'에서 관리합니다.",
      en: "This setting is retired. Fees are managed in 'Fee policies'.",
    },
    auto_action_type_retired: {
      ko: "중단된 자동 조치입니다 (레거시 정산 보류). 다른 조치를 선택하세요.",
      en: "This auto action is retired (legacy settlement hold). Choose another action.",
    },
    status_changed: {
      ko: "다른 관리자가 먼저 처리해 상태가 바뀌었습니다. 새로고침 후 다시 확인하세요.",
      en: "Another admin changed the status first. Refresh and check again.",
    },
    expected_status_required: {
      ko: "화면 정보가 오래되었습니다. 새로고침 후 다시 시도하세요.",
      en: "This screen is out of date. Refresh and try again.",
    },
    stale_lifecycle: {
      ko: "다른 관리자가 먼저 처리했습니다. 새로고침 후 다시 확인하세요.",
      en: "Another admin acted first. Refresh and check again.",
    },
    stale_updated_at: {
      ko: "다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 확인하세요.",
      en: "Another admin edited this first. Refresh and check again.",
    },
    expected_updated_at_required: {
      ko: "화면 정보가 오래되었습니다. 새로고침 후 다시 시도하세요.",
      en: "This screen is out of date. Refresh and try again.",
    },
    expected_version_required: {
      ko: "화면 정보가 오래되었습니다. 새로고침 후 다시 시도하세요.",
      en: "This screen is out of date. Refresh and try again.",
    },
    stale_policy: {
      ko: "다른 관리자가 먼저 수수료 정책을 수정했습니다. 새로고침 후 다시 확인하세요.",
      en: "Another admin edited this fee policy first. Refresh and check again.",
    },
    /** 409 충돌 후 화면이 최신 데이터를 이미 다시 불러온 경우 (adminConflictReloadedMessage). */
    stale_reloaded: {
      ko: "다른 관리자가 먼저 수정해 저장하지 않았습니다. 최신 내용을 다시 불러왔으니 확인 후 다시 저장하세요.",
      en: "Not saved: another admin edited this first. The latest data has been reloaded — review and save again.",
    },
    legacy_endpoint_disabled: {
      ko: "더 이상 쓰지 않는 처리 경로입니다. 주문 상세의 「관리자 개입」에서 처리하세요.",
      en: "This path is retired. Use 「Admin intervention」 on the order detail.",
    },
    invalid_order_id: { ko: "주문 번호 형식이 올바르지 않습니다.", en: "Invalid order reference." },
    commission_load_failed: { ko: "수수료 정보를 불러오지 못했습니다.", en: "Could not load commission details." },
    invalid_store_transition: {
      ko: "현재 매장 상태에서는 할 수 없는 처리입니다.",
      en: "This action is not allowed for the store's current status.",
    },
    invalid_coupon_transition: {
      ko: "현재 쿠폰 상태에서는 할 수 없는 처리입니다.",
      en: "This action is not allowed for the coupon's current status.",
    },
    reject_reason_required: { ko: "거절 사유를 입력해 주세요.", en: "Please enter a rejection reason." },
    revoke_reason_required: { ko: "회수 사유를 입력해 주세요.", en: "Please enter a revoke reason." },
    store_not_approved_for_sales: {
      ko: "입점 승인된 매장만 판매 상태를 바꿀 수 있습니다.",
      en: "Only approved stores can change sales status.",
    },
    store_not_approved_for_visibility: {
      ko: "입점 승인된 매장만 노출을 켤 수 있습니다.",
      en: "Only approved stores can be made visible.",
    },
    would_leave_no_default_policy: {
      ko: "적용 중인 다른 플랫폼 기본 수수료 정책이 없어 종료할 수 없습니다.",
      en: "No other default fee policy is active, so this cannot be ended.",
    },
    reject_refund_failed: {
      ko: "매장 캐시 환불에 실패해 반려하지 않았습니다. 잠시 후 다시 시도하세요.",
      en: "The store Cash refund failed, so the campaign was not rejected. Try again shortly.",
    },
    business_cash_refund_failed: {
      ko: "반려는 완료됐지만 매장 캐시 환불이 실패했습니다. 재무 화면에서 환불 상태를 확인하세요.",
      en: "Rejected, but the store Cash refund failed. Check refund status in Finance.",
    },
    as_of_date_in_future: { ko: "기준일은 오늘 이후로 지정할 수 없습니다.", en: "The as-of date cannot be in the future." },
    notification_failed: { ko: "알림을 보내지 못했습니다.", en: "Could not send the notification." },
    store_not_found: { ko: "매장을 찾을 수 없습니다.", en: "Store not found." },
    invalid_distance_mode: { ko: "거리 정책 값이 올바르지 않습니다.", en: "Invalid distance policy value." },
    invalid_store_id: { ko: "매장 주소가 올바르지 않습니다.", en: "Invalid store link." },
    order_not_found: { ko: "주문을 찾을 수 없습니다.", en: "Order not found." },
    supabase_unconfigured: { ko: "서버 설정 오류입니다. 시스템 관리자에게 문의하세요.", en: "Server configuration error. Contact a system admin." },
    db_error: { ko: "저장 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.", en: "A database error occurred. Try again later." },
    // 배달 현장 (R4-D) — 자동 조치·경고·라이더
    kill_switch_off: {
      ko: "자동 조치가 전체 중지된 상태라 실행할 수 없습니다. 자동 조치 승인 화면에서 먼저 허용하세요.",
      en: "Auto actions are stopped. Allow them on the Auto action approval screen first.",
    },
    not_pending: { ko: "이미 처리된 자동 조치입니다. 새로고침 후 확인하세요.", en: "This auto action was already handled. Refresh." },
    event_not_open: { ko: "연결된 경고가 이미 종료되어 실행할 수 없습니다.", en: "The linked alert is already closed." },
    max_retries: { ko: "재실행 가능 횟수를 모두 사용했습니다.", en: "No retries left." },
    auto_action_effect_failed: {
      ko: "결정은 기록됐지만 조치 실행에 실패했습니다. 실패 목록에서 확인 후 재실행하세요.",
      en: "The decision was recorded but the action failed to run. Check the failed list and re-run.",
    },
    not_failed: { ko: "실패한 자동 조치만 재실행할 수 있습니다. 새로고침 후 확인하세요.", en: "Only failed auto actions can be re-run. Refresh." },
    not_found: { ko: "대상을 찾을 수 없습니다. 새로고침 후 확인하세요.", en: "Not found. Refresh and check again." },
    rpc_missing: { ko: "이 기능이 아직 서버에 준비되지 않았습니다. 시스템 관리자에게 문의하세요.", en: "This feature is not ready on the server. Contact a system admin." },
    schema_missing: { ko: "이 기능이 아직 서버에 준비되지 않았습니다. 시스템 관리자에게 문의하세요.", en: "This feature is not ready on the server. Contact a system admin." },
    bad_action: { ko: "지원하지 않는 복구 작업입니다.", en: "Unsupported recovery action." },
    concurrent_recovery: {
      ko: "같은 복구 작업이 이미 실행 중입니다. 잠시 후 다시 시도하세요.",
      en: "The same recovery is already running. Try again shortly.",
    },
    retype_required: { ko: "확인 문구가 일치하지 않아 실행하지 않았습니다.", en: "The confirmation text did not match." },
    stale_version: {
      ko: "다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 확인하세요.",
      en: "Another admin edited this first. Refresh and check again.",
    },
    dangerous_action_requires_approval: {
      ko: "정산 보류·라이더 재배정·알림 끄기 자동 조치는 항상 승인 후 실행되어야 합니다.",
      en: "Hold / reassign / mute auto actions must always wait for approval.",
    },
    auto_action_requires_type_and_delay: {
      ko: "자동 조치를 켜려면 조치 종류와 지연 시간(1분 이상)을 함께 지정하세요.",
      en: "Set an action type and a delay of 1+ minutes to enable the auto action.",
    },
    rule_not_found: { ko: "규칙을 찾을 수 없습니다. 새로고침 후 확인하세요.", en: "Rule not found. Refresh." },
    event_not_found: { ko: "경고를 찾을 수 없습니다. 새로고침 후 확인하세요.", en: "Alert not found. Refresh." },
    acknowledge_requires_open: { ko: "미처리 경고만 확인 처리할 수 있습니다.", en: "Only open alerts can be acknowledged." },
    mute_requires_open_or_ack: { ko: "미처리·확인한 경고만 알림을 끌 수 있습니다.", en: "Only open or acknowledged alerts can be muted." },
    cannot_edit_resolved: { ko: "해결된 경고는 수정할 수 없습니다.", en: "Resolved alerts cannot be edited." },
    same_rider: { ko: "현재 라이더와 같은 라이더입니다.", en: "That is the current rider." },
    rider_changed: {
      ko: "그 사이 라이더 배정이 바뀌었습니다. 새로고침 후 다시 확인하세요.",
      en: "The rider assignment changed meanwhile. Refresh and check again.",
    },
    rider_already_assigned: { ko: "이미 다른 라이더가 배정되어 있습니다. 재배정을 사용하세요.", en: "Another rider is already assigned. Use reassign." },
    delivery_already_delivered: { ko: "이미 배달 완료된 주문입니다.", en: "This order is already delivered." },
    order_terminal_blocks_delivery: { ko: "종료된 주문이라 배달을 변경할 수 없습니다.", en: "The order is closed, so delivery cannot change." },
    order_status_blocks_dispatch: { ko: "현재 주문 상태에서는 배달을 진행할 수 없습니다.", en: "The current order status does not allow dispatch." },
    invalid_delivery_transition: { ko: "현재 배달 상태에서는 할 수 없는 변경입니다.", en: "Not allowed for the current delivery status." },
    release_not_applicable_for_status: { ko: "현재 배달 상태에서는 배정을 해제할 수 없습니다.", en: "Cannot release for the current delivery status." },
    rider_not_found: { ko: "라이더를 찾을 수 없습니다.", en: "Rider not found." },
    rider_offline: { ko: "오프라인 라이더입니다. 오프라인 배정 허용을 켜고 다시 시도하세요.", en: "The rider is offline. Allow offline assignment and retry." },
    rider_suspended: { ko: "정지된 라이더에게는 배정할 수 없습니다.", en: "Suspended riders cannot be assigned." },
    rider_paused: { ko: "배정이 일시 중지된 라이더입니다.", en: "This rider's assignments are paused." },
    invalid_rule_number: { ko: "분·단계 값은 1 이상의 숫자로 입력하세요.", en: "Minutes/levels must be numbers of 1 or more." },
    invalid_price: { ko: "가격은 0 이상의 숫자로 입력하세요.", en: "Enter a price of 0 or more." },
    invalid_name: { ko: "상품명은 1~120자로 입력하세요.", en: "Product name must be 1–120 characters." },
    store_name_required: { ko: "매장 이름은 2자 이상 입력하세요.", en: "Store name must be at least 2 characters." },
    invalid_phone: { ko: "전화번호 형식이 올바르지 않습니다.", en: "Invalid phone number." },
  };
  if (known[key]) return ko ? known[key].ko : known[key].en;
  if (OPERATOR_LABELS[key]) return adminOperatorLabel(key, ko);
  if (/^[a-z][a-z0-9_]*$/i.test(key) && key.includes("_")) {
    return ko ? "처리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." : "Could not complete. Please try again.";
  }
  return key;
}

/** 충돌 코드(stale_updated_at / stale_policy) → "stale_reloaded", 그 외는 그대로. 결과 배너처럼 코드만 받는 UI 용. */
export function adminConflictReloadedCode(raw: string | null | undefined): string {
  const key = String(raw ?? "").trim();
  return key === "stale_updated_at" || key === "stale_policy" ? "stale_reloaded" : key;
}

/**
 * 저장 충돌(409 stale_updated_at / stale_policy) 후 화면이 최신 데이터를 이미 다시 불러온 경우의 안내.
 * 그 외 코드는 adminOperatorErrorMessage 와 동일.
 */
export function adminConflictReloadedMessage(raw: string | null | undefined, ko: boolean): string {
  const key = String(raw ?? "").trim();
  return adminOperatorErrorMessage(adminConflictReloadedCode(key), ko);
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
