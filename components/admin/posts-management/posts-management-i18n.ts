export {
  POSTS_MGMT_TAB_LABEL_KEY,
  POSTS_MGMT_DEAL_LABEL_KEY,
  POSTS_MGMT_STATUS_LABEL_KEY,
  POSTS_MGMT_SORT_LABEL_KEY,
} from "@/lib/admin-products/posts-management-label-i18n";

export function postsMgmtLocale(language: string): string {
  if (language === "en") return "en-US";
  if (language === "zh-CN") return "zh-CN";
  return "ko-KR";
}
