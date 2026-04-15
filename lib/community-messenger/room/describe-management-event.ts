/** 그룹 운영/공지 시스템 메시지(`management_event`)를 카드용 제목·본문으로 요약 */
export function describeManagementEvent(content: string): { title: string; detail: string } {
  const text = content.trim();
  if (!text) return { title: "운영 변경", detail: "" };
  if (text.startsWith("공지 변경:")) {
    return { title: "공지 변경", detail: text.replace("공지 변경:", "").trim() || "공지가 수정되었습니다." };
  }
  if (text === "공지가 삭제되었습니다." || text === "공지 삭제") {
    return { title: "공지 삭제", detail: "등록된 공지를 비웠습니다." };
  }
  if (text.startsWith("공지 수정 ·")) {
    return { title: "공지 변경", detail: text.replace("공지 수정 ·", "").trim() || "공지를 수정했습니다." };
  }
  if (text === "운영 권한 변경" || text === "그룹 권한이 변경되었습니다.") {
    return { title: "권한 변경", detail: "그룹 운영 권한을 조정했습니다." };
  }
  if (text.includes("관리자 지정")) {
    return { title: "관리자 지정", detail: text };
  }
  if (text.includes("관리자 해제")) {
    return { title: "관리자 해제", detail: text };
  }
  if (text.includes("방장 위임")) {
    return { title: "방장 위임", detail: text };
  }
  if (text.includes("내보내기")) {
    return { title: "멤버 내보내기", detail: text };
  }
  if (text.includes("초대")) {
    return { title: "멤버 초대", detail: text };
  }
  return { title: "운영 변경", detail: text };
}
