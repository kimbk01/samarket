import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { PostsManagementSortKey, PostsManagementTab } from "@/lib/admin-products/posts-management-utils";
import type { ProductStatus } from "@/lib/types/product";

function pmT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

export const POSTS_MGMT_TAB_LABEL_KEY: Record<PostsManagementTab, MessageKey> = {
  all: "common_all",
  trade: "admin_posts_mgmt_tab_trade",
  "used-car": "admin_posts_mgmt_tab_used_car",
  "real-estate": "admin_posts_mgmt_tab_real_estate",
  jobs: "admin_posts_mgmt_tab_jobs",
  exchange: "admin_posts_mgmt_tab_exchange",
  etc: "admin_posts_mgmt_tab_etc",
};

export const POSTS_MGMT_DEAL_LABEL_KEY: Record<"all" | "sale" | "free", MessageKey> = {
  all: "common_all",
  sale: "admin_posts_mgmt_deal_sale",
  free: "admin_posts_mgmt_deal_free",
};

export const POSTS_MGMT_STATUS_LABEL_KEY: Record<ProductStatus | "", MessageKey> = {
  "": "common_all",
  active: "admin_dashboard_product_active",
  reserved: "admin_dashboard_product_reserved",
  sold: "admin_posts_mgmt_status_sold",
  hidden: "admin_dashboard_product_hidden",
  blinded: "admin_dashboard_product_blinded",
  deleted: "admin_dashboard_product_deleted",
};

export const POSTS_MGMT_SORT_LABEL_KEY: Record<PostsManagementSortKey, MessageKey> = {
  popular: "admin_posts_mgmt_sort_popular",
  latest: "admin_posts_mgmt_sort_latest",
  id_asc: "admin_posts_mgmt_sort_id_asc",
  id_desc: "admin_posts_mgmt_sort_id_desc",
};

export function postsManagementTabLabel(tab: PostsManagementTab): string {
  return pmT(POSTS_MGMT_TAB_LABEL_KEY[tab]);
}

export const POSTS_MANAGEMENT_TAB_VALUES: PostsManagementTab[] = [
  "all",
  "trade",
  "used-car",
  "real-estate",
  "jobs",
  "exchange",
  "etc",
];

export const DEAL_TYPE_FILTER_VALUES = ["all", "sale", "free"] as const;

export const STATUS_FILTER_VALUES_POSTS: (ProductStatus | "")[] = [
  "",
  "active",
  "reserved",
  "sold",
  "hidden",
];

export const SORT_FILTER_VALUES_POSTS: PostsManagementSortKey[] = [
  "popular",
  "latest",
  "id_asc",
  "id_desc",
];
