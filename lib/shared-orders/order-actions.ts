/**
 * 3자 공통 주문 액션 — UI는 이 모듈(또는 shared-order-store)만 호출하는 것을 권장.
 * Supabase 연동 시 이 파일의 구현을 서버 액션/RPC 호출로 교체하기 쉽습니다.
 */
export {
  sharedOwnerAccept as acceptOrderByOwner,
  sharedOwnerReject as rejectOrderByOwner,
  sharedOwnerStartPreparing as startPreparingByOwner,
  sharedOwnerStartDelivery as startDeliveryByOwner,
  sharedOwnerMarkPickupReady as markReadyForPickupByOwner,
  sharedOwnerMarkArrived as markArrivedByOwner,
  sharedOwnerComplete as completeOrderByOwner,
  sharedOwnerMarkProblem as markProblemByOwner,
  sharedMemberRequestCancel as requestCancelByMember,
  sharedMemberRequestRefund as requestRefundByMember,
  sharedAdminSetOrderStatus as adminSetOrderStatus,
  sharedAdminApproveCancel as adminApproveCancel,
  sharedAdminRejectCancel as adminRejectCancel,
  sharedAdminApproveRefund as adminApproveRefund,
  sharedAdminRejectRefund as adminRejectRefund,
  sharedAdminHoldSettlement as adminHoldSettlement,
  sharedAdminReleaseSettlement as adminReleaseSettlement,
  sharedAdminMarkSettlementPaid as adminMarkSettlementPaid,
  sharedAdminSetMemo as adminSetMemo,
} from "./shared-order-store";
