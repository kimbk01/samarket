/** Phase 12b: owner product option group validation (`owner-product-options-validate.ts`) */

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
  },
};
