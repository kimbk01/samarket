import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";

/** 그룹 운영/공지 시스템 메시지(`management_event`)를 카드용 제목·본문으로 요약 */
export function describeManagementEvent(content: string): { title: string; detail: string } {
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
