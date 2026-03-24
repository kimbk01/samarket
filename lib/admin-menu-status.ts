import type { AdminMenuItem, AdminMenuStatus } from "@/components/admin/admin-menu";

/** 항목의 유효 상태 반환. 자식이 있으면 자식 기준으로 계산, 없으면 item.status 또는 todo */
export function getMenuStatus(item: AdminMenuItem): AdminMenuStatus {
  if (item.status != null) return item.status;
  const children = item.children;
  if (children?.length) {
    const statuses = children.map(getMenuStatus);
    const allDone = statuses.every((s) => s === "done");
    const allTodo = statuses.every((s) => s === "todo");
    if (allDone) return "done";
    if (allTodo) return "todo";
    return "partial";
  }
  return "todo";
}

/** 상태 접두어 — 사이드 메뉴에서 (미)/(부) 표기는 사용하지 않음 */
export function getStatusPrefix(_status: AdminMenuStatus): string {
  return "";
}

/** 표시용 제목: 접두어 + 원문 title */
export function getMenuDisplayTitle(title: string, status: AdminMenuStatus): string {
  return getStatusPrefix(status) + title;
}
