import type { MessageKey } from "@/lib/i18n/messages";
import {
  adminCreateMemberAddressHasSelection,
  type AdminCreateMemberAddressInput,
} from "@/lib/admin-users/admin-create-member-address";
import { normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";

export type AdminCreateMemberFormField =
  | "username"
  | "password"
  | "nickname"
  | "name"
  | "email"
  | "contactPhone"
  | "addressSearch"
  | "addressDetail"
  | "accountType"
  | "form";

export type AdminCreateMemberFormInput = {
  username: string;
  password: string;
  nickname: string;
  name: string;
  email: string;
  contactPhoneDigits: string;
  accountType: string;
  address: AdminCreateMemberAddressInput;
};

export type AdminCreateMemberFieldErrors = Partial<Record<AdminCreateMemberFormField, MessageKey>>;

export function validateAdminCreateMemberForm(
  input: AdminCreateMemberFormInput,
  opts: { addressAttempted: boolean; phoneRuleKey: MessageKey }
): AdminCreateMemberFieldErrors {
  const errors: AdminCreateMemberFieldErrors = {};
  const id = input.username.trim().toLowerCase();
  if (!id || id.length < 2 || id.length > 64) {
    errors.username = "admin_users_err_username_length";
  }
  if (!input.password || input.password.length < 4) {
    errors.password = "admin_users_err_password_min";
  }
  const nick = input.nickname.trim();
  if (!nick || nick.length > 20) {
    errors.nickname = "admin_users_err_nickname_length";
  }
  const nm = input.name.trim();
  if (!nm || nm.length > 50) {
    errors.name = "admin_users_err_name_length";
  }
  const em = input.email.trim();
  /** 빈 이메일 = 서버/클라가 `loginId@manual.local` 로 보정. 값이 있을 때만 형식 검사. */
  if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    errors.email = "admin_users_err_email_invalid";
  }
  if (input.contactPhoneDigits.trim()) {
    const ph = normalizeOptionalPhMobileDb(input.contactPhoneDigits);
    if (!ph.ok) {
      errors.contactPhone = opts.phoneRuleKey;
    }
  }

  const addrStarted =
    opts.addressAttempted ||
    adminCreateMemberAddressHasSelection(input.address) ||
    input.address.unitFloorRoom.trim().length > 0;

  if (addrStarted) {
    if (!adminCreateMemberAddressHasSelection(input.address)) {
      errors.addressSearch = "addr_ui_pick_search_result";
    } else if (!input.address.unitFloorRoom.trim()) {
      errors.addressDetail = "addr_ui_detail_required_err";
    }
  }

  if (!["development_member", "operations_member", "admin"].includes(input.accountType)) {
    errors.accountType = "admin_users_err_account_type_invalid";
  }

  return errors;
}

/** API `field` → 폼 필드 (클라이언트 표시용) */
export function mapAdminCreateMemberApiField(
  field: string | undefined
): AdminCreateMemberFormField | null {
  switch (field) {
    case "username":
      return "username";
    case "password":
      return "password";
    case "nickname":
      return "nickname";
    case "name":
      return "name";
    case "email":
      return "email";
    case "contactPhone":
      return "contactPhone";
    case "address":
      return "addressSearch";
    case "addressDetail":
      return "addressDetail";
    case "accountType":
      return "accountType";
    case "form":
      return "form";
    default:
      return null;
  }
}
