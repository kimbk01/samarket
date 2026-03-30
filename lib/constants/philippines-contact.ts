/** 필리핀 연락처 — UI placeholder 공통 (저장·검증 규칙은 `@/lib/utils/ph-mobile`) */

/** 로컬 11자리: 09## ### #### */
export const PH_MOBILE_PLACEHOLDER = "09## ### ####";

/** 매장·주문·프로필 등 동일 */
export const PH_LOCAL_09_PLACEHOLDER = PH_MOBILE_PLACEHOLDER;

export {
  PH_LOCAL_MOBILE_RULE_MESSAGE_KO,
  PH_LOCAL_MOBILE_LENGTH,
} from "@/lib/utils/ph-mobile";
