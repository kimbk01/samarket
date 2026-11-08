import type { MessageKey } from "@/lib/i18n/messages";
import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";

const MGMT_TITLE_BY_KEY: Readonly<Record<string, MessageKey>> = {
  cm_svc_mgmt_admin_assign: "cm_svc_mgmt_admin_assign",
  cm_svc_mgmt_admin_assign_named: "cm_svc_mgmt_admin_assign",
  cm_svc_mgmt_admin_revoke: "cm_svc_mgmt_admin_revoke",
  cm_svc_mgmt_admin_revoke_named: "cm_svc_mgmt_admin_revoke",
  cm_svc_mgmt_owner_transfer: "cm_svc_mgmt_owner_transfer",
  cm_svc_mgmt_owner_transfer_named: "cm_svc_mgmt_owner_transfer",
  cm_svc_mgmt_member_kick: "cm_svc_mgmt_member_kick",
  cm_svc_mgmt_member_kick_named: "cm_svc_mgmt_member_kick",
  cm_svc_mgmt_member_invite: "cm_svc_mgmt_member_invite",
  cm_svc_mgmt_member_invite_named: "cm_svc_mgmt_member_invite",
};

/** 언어 SSOT B3-a — 저장한 종류 코드(`metadata.message_key`)가 있으면 글자 해석 없이 보는 사람 언어로 */
function describeManagementEventFromKey(
  metadata: Record<string, unknown> | null | undefined
): { title: string; detail: string } | null {
  const key = typeof metadata?.message_key === "string" ? metadata.message_key : "";
  if (!key.startsWith("cm_svc_mgmt_")) return null;
  const vars =
    metadata?.message_vars && typeof metadata.message_vars === "object"
      ? (metadata.message_vars as Record<string, string | number>)
      : undefined;
  if (key === "cm_svc_mgmt_notice_edit") {
    return {
      title: translateCmUi("cm_svc_mgmt_notice_changed_title"),
      detail: String(vars?.text ?? "").trim() || translateCmUi("cm_svc_mgmt_notice_edit", { text: "" }),
    };
  }
  if (key === "cm_svc_mgmt_notice_delete") {
    return {
      title: translateCmUi("cm_svc_mgmt_notice_deleted_title"),
      detail: translateCmUi("cm_svc_mgmt_notice_deleted_detail"),
    };
  }
  if (key === "cm_svc_mgmt_permissions") {
    return {
      title: translateCmUi("cm_svc_mgmt_permissions_title"),
      detail: translateCmUi("cm_svc_mgmt_permissions_detail"),
    };
  }
  const title = MGMT_TITLE_BY_KEY[key];
  if (!title) return null;
  return { title: translateCmUi(title), detail: translateCmUi(key as MessageKey, vars) };
}

/** 그룹 운영/공지 시스템 메시지(`management_event`)를 카드용 제목·본문으로 요약 */
export function describeManagementEvent(
  content: string,
  metadata?: Record<string, unknown> | null
): { title: string; detail: string } {
  const byKey = describeManagementEventFromKey(metadata);
  if (byKey) return byKey;
  const text = content.trim();
  if (!text) {
    return { title: translateCmUi("cm_svc_mgmt_change_fallback"), detail: "" };
  }
  if (text.startsWith("공지 변경:")) {
    return {
      title: translateCmUi("cm_svc_mgmt_notice_changed_title"),
      detail: text.replace("공지 변경:", "").trim() || translateCmUi("cm_svc_mgmt_notice_edit", { text: "" }),
    };
  }
  if (text === "공지가 삭제되었습니다." || text === "공지 삭제") {
    return {
      title: translateCmUi("cm_svc_mgmt_notice_deleted_title"),
      detail: translateCmUi("cm_svc_mgmt_notice_deleted_detail"),
    };
  }
  if (text.startsWith("공지 수정 ·")) {
    return {
      title: translateCmUi("cm_svc_mgmt_notice_changed_title"),
      detail: text.replace("공지 수정 ·", "").trim() || translateCmUi("cm_svc_mgmt_notice_edit", { text: "" }),
    };
  }
  if (text === "운영 권한 변경" || text === "그룹 권한이 변경되었습니다.") {
    return {
      title: translateCmUi("cm_svc_mgmt_permissions_title"),
      detail: translateCmUi("cm_svc_mgmt_permissions_detail"),
    };
  }
  if (text.includes("관리자 지정")) {
    return { title: translateCmUi("cm_svc_mgmt_admin_assign"), detail: text };
  }
  if (text.includes("관리자 해제")) {
    return { title: translateCmUi("cm_svc_mgmt_admin_revoke"), detail: text };
  }
  if (text.includes("방장 위임")) {
    return { title: translateCmUi("cm_svc_mgmt_owner_transfer"), detail: text };
  }
  if (text.includes("보내기")) {
    return { title: translateCmUi("cm_svc_mgmt_member_kick"), detail: text };
  }
  if (text.includes("초대")) {
    return { title: translateCmUi("cm_svc_mgmt_member_invite"), detail: text };
  }
  return { title: translateCmUi("cm_svc_mgmt_change_fallback"), detail: text };
}
