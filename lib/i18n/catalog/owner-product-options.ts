/**
 * Phase 12b: owner product option group validation (`owner-product-options-validate.ts`)
 * + 3-E (PRD-10·13·14·15) 오너 상품·메뉴 카테고리 서버 검증·안내 문구.
 */

export const ownerProductOptionsMessages = {
  ko: {
    store_owner_opt_group_label: "옵션 그룹 {index}",
    store_owner_opt_name_required: "{group}: 그룹명을 입력해 주세요.",
    store_owner_opt_single_required_bounds:
      "{group}: 단일 선택·필수일 때는 최소·최대 선택 수가 각각 1이어야 합니다.",
    store_owner_opt_single_optional_bounds:
      "{group}: 단일 선택(선택)은 0~1개 범위로 설정해 주세요.",
    store_owner_opt_multiple_required_min:
      "{group}: 복수 선택·필수일 때는 최소 선택 수가 1 이상이어야 합니다.",
    store_owner_opt_max_gte_min: "{group}: 최대 선택 수는 최소 선택 수 이상이어야 합니다.",
    store_owner_opt_multiple_max_min_one:
      "{group}: 복수 선택에서는 최대 선택 수가 1 이상이어야 합니다.",
    store_owner_opt_quantity_max_min_one:
      "{group}: 수량형은 최대 선택(수량 상한)이 1 이상이어야 합니다.",
    store_owner_opt_quantity_max_gte_min: "{group}: 수량형에서 최대는 최소 이상이어야 합니다.",
    store_owner_opt_quantity_required_min:
      "{group}: 수량형·필수일 때는 최소 선택 수가 1 이상이어야 합니다.",
    store_owner_opt_choices_required: "{group}: 선택지를 한 개 이상 추가해 주세요.",
    store_owner_opt_choice_name_required: "{group}: 선택지 {index}의 이름을 입력해 주세요.",
    store_owner_opt_choice_price_invalid:
      '{group}: 「{name}」의 추가 금액은 0 이상 숫자만 입력해 주세요.',
    store_owner_opt_choice_sold_out_default:
      '{group}: 품절인 「{name}」은 기본 선택으로 지정할 수 없습니다.',
    store_owner_opt_choices_named_required: "{group}: 선택지를 한 개 이상 입력해 주세요.",
    store_owner_opt_single_default_one:
      "{group}: 단일 선택 그룹에서는 기본 선택은 한 개만 지정할 수 있습니다.",
    store_owner_opt_invalid_json: "옵션 형식이 올바르지 않습니다.",
    store_owner_opt_duplicate_group_id: "{group}: 옵션 그룹 식별자가 중복되었습니다. 그룹을 삭제한 뒤 다시 추가해 주세요.",
    store_owner_opt_duplicate_choice_name: "{group}: 「{name}」 선택지가 중복되었습니다. 이름을 다르게 입력해 주세요.",
    store_owner_opt_choice_price_too_large: "{group}: 「{name}」의 추가 금액은 {max} 이하로 입력해 주세요.",
    store_owner_prd_title_too_long: "상품명은 {max}자 이하로 입력해 주세요.",
    store_owner_prd_summary_too_long: "한 줄 소개는 {max}자 이하로 입력해 주세요.",
    store_owner_prd_price_too_large: "판매가는 {max} 이하로 입력해 주세요.",
    store_owner_prd_stock_too_large: "재고는 {max}개 이하로 입력해 주세요.",
    store_owner_prd_auto_sold_out: "재고가 0개라 품절로 저장했습니다. 재고를 채운 뒤 판매중으로 바꿔 주세요.",
    store_owner_prd_filter_recommended: "추천 메뉴",
    store_owner_section_has_products: "「{name}」 카테고리에 메뉴가 {count}개 있습니다. 메뉴를 옮길 카테고리를 고르면 옮긴 뒤 삭제합니다.",
    store_owner_section_move_to_label: "메뉴를 옮길 카테고리",
    store_owner_section_move_and_delete: "옮기고 삭제",
    store_owner_section_move_target_required: "메뉴를 옮길 카테고리를 선택해 주세요.",
    store_owner_section_no_move_target: "메뉴를 옮길 다른 카테고리가 없습니다. 카테고리를 먼저 추가해 주세요.",
    /** OA-14 — 상품 수정 관리자 잠금·검수 안내 (Owner 재설계안 승인 2026-11-03) */
    owner_product_lock_kind_hidden: "숨김",
    owner_product_lock_kind_sold_out: "품절",
    owner_product_lock_kind_blocked: "판매 차단",
    owner_product_lock_admin: "관리자 {lock} 조치 상품입니다. 관리자가 해제하기 전까지 판매 상태를 바꿀 수 없습니다.",
    owner_product_lock_blocked: "관리자가 판매를 차단한 상품입니다. 고객센터로 문의해 주세요.",
    owner_product_lock_review_rejected:
      "관리자 검수에서 반려된 상품입니다. 내용을 수정해 저장하면 재검수 요청이 되고, 승인 후 판매할 수 있습니다.",
    owner_product_lock_review_pending: "재검수 대기 중입니다. 관리자 검수 승인 후 판매할 수 있습니다.",
    owner_product_lock_reason_suffix: " (사유: {memo})",
  },
  en: {
    store_owner_opt_group_label: "Option group {index}",
    store_owner_opt_name_required: "{group}: Enter a group name.",
    store_owner_opt_single_required_bounds:
      "{group}: For required single-select, min and max must both be 1.",
    store_owner_opt_single_optional_bounds:
      "{group}: For optional single-select, set min/max between 0 and 1.",
    store_owner_opt_multiple_required_min:
      "{group}: For required multi-select, minimum choices must be at least 1.",
    store_owner_opt_max_gte_min: "{group}: Maximum choices must be at least the minimum.",
    store_owner_opt_multiple_max_min_one:
      "{group}: For multi-select, maximum choices must be at least 1.",
    store_owner_opt_quantity_max_min_one:
      "{group}: For quantity type, the max (quantity cap) must be at least 1.",
    store_owner_opt_quantity_max_gte_min: "{group}: For quantity type, max must be at least min.",
    store_owner_opt_quantity_required_min:
      "{group}: For required quantity type, minimum must be at least 1.",
    store_owner_opt_choices_required: "{group}: Add at least one choice.",
    store_owner_opt_choice_name_required: "{group}: Enter a name for choice {index}.",
    store_owner_opt_choice_price_invalid:
      "{group}: Extra price for “{name}” must be a number ≥ 0.",
    store_owner_opt_choice_sold_out_default:
      "{group}: Sold-out choice “{name}” cannot be the default.",
    store_owner_opt_choices_named_required: "{group}: Enter at least one choice.",
    store_owner_opt_single_default_one:
      "{group}: Only one default choice is allowed in a single-select group.",
    store_owner_opt_invalid_json: "Invalid options format.",
    store_owner_opt_duplicate_group_id: "{group}: Duplicate option group id. Remove the group and add it again.",
    store_owner_opt_duplicate_choice_name: "{group}: Choice “{name}” is duplicated. Use a different name.",
    store_owner_opt_choice_price_too_large: "{group}: Extra price for “{name}” must be at most {max}.",
    store_owner_prd_title_too_long: "Item name must be at most {max} characters.",
    store_owner_prd_summary_too_long: "Short description must be at most {max} characters.",
    store_owner_prd_price_too_large: "Price must be at most {max}.",
    store_owner_prd_stock_too_large: "Stock must be at most {max}.",
    store_owner_prd_auto_sold_out: "Stock is 0, so the item was saved as sold out. Add stock, then set it on sale.",
    store_owner_prd_filter_recommended: "Recommended",
    store_owner_section_has_products: "Category “{name}” has {count} items. Pick a category to move them to; they are moved, then the category is deleted.",
    store_owner_section_move_to_label: "Move items to",
    store_owner_section_move_and_delete: "Move and delete",
    store_owner_section_move_target_required: "Pick a category to move the items to.",
    store_owner_section_no_move_target: "There is no other category to move the items to. Add a category first.",
    owner_product_lock_kind_hidden: "hidden",
    owner_product_lock_kind_sold_out: "sold out",
    owner_product_lock_kind_blocked: "sales blocked",
    owner_product_lock_admin: "An admin set this product to {lock}. You can't change its sale status until an admin releases it.",
    owner_product_lock_blocked: "An admin blocked sales of this product. Please contact the help center.",
    owner_product_lock_review_rejected:
      "This product was rejected in admin review. Edit and save it to request a new review — you can sell it once approved.",
    owner_product_lock_review_pending: "Waiting for admin re-review. You can sell it once approved.",
    owner_product_lock_reason_suffix: " (Reason: {memo})",
  },
};
