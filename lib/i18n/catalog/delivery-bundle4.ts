/**
 * 묶음 4 (O-04 관리자 숨김 잠금 · S-12/DB-2 통계 테스트 포함 보기) i18n.
 * Separate top-level catalog — `adminMessages` 는 TS 직렬화 한도(TS7056)에 닿아 키를 더 넣을 수 없다.
 */

export const deliveryBundle4Messages = {
  ko: {
    business_ops4_err_admin_visibility_locked:
      "관리자가 숨긴 매장이라 사장님이 직접 노출을 켤 수 없습니다. 다시 노출하려면 관리자(고객센터)에 문의해 주세요.",
    admin_del_ops_include_test: "테스트 포함 보기",
    admin_del_ops_scope_real: "실매장 주문만 집계",
    admin_del_ops_scope_all: "테스트·샘플 매장 주문 포함",
  },
  en: {
    business_ops4_err_admin_visibility_locked:
      "This store was hidden by an administrator, so you cannot turn visibility back on yourself. Contact the administrator (support) to show it again.",
    admin_del_ops_include_test: "Include test stores",
    admin_del_ops_scope_real: "Real stores only",
    admin_del_ops_scope_all: "Including test and sample stores",
  },
} as const;
