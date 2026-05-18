import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";

function permT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

const PERMISSION_KEYS: Record<AdminPermissionKey, MessageKey> = {
  users: "admin_perm_users",
  users_edit_membership: "admin_perm_users_edit_membership",
  regions: "admin_perm_regions",
  products: "admin_perm_products",
  boards: "admin_perm_boards",
  post_write: "admin_perm_post_write",
  comment_write: "admin_perm_comment_write",
  product_edit: "admin_perm_product_edit",
  business: "admin_perm_business",
  jobs: "admin_perm_jobs",
  real_estate: "admin_perm_real_estate",
  used_car: "admin_perm_used_car",
  chats: "admin_perm_chats",
  reviews: "admin_perm_reviews",
  reports: "admin_perm_reports",
  ads: "admin_perm_ads",
  point: "admin_perm_point",
  settings: "admin_perm_settings",
  manage: "admin_perm_manage",
  dev: "admin_perm_dev",
  create_admin: "admin_perm_create_admin",
};

const GROUP_KEYS = {
  ops: "admin_perm_group_ops",
  ads: "admin_perm_group_ads",
  point: "admin_perm_group_point",
  settings: "admin_perm_group_settings",
  manage: "admin_perm_group_manage",
  system: "admin_perm_group_system",
} as const;

export function getPermissionLabel(key: AdminPermissionKey): string {
  const msgKey = PERMISSION_KEYS[key];
  return msgKey ? permT(msgKey) : key;
}

export const ADMIN_PERMISSION_GROUPS: {
  groupLabelKey: MessageKey;
  keys: AdminPermissionKey[];
}[] = [
  {
    groupLabelKey: GROUP_KEYS.ops,
    keys: [
      "users",
      "users_edit_membership",
      "regions",
      "products",
      "product_edit",
      "boards",
      "post_write",
      "comment_write",
      "business",
      "jobs",
      "real_estate",
      "used_car",
      "chats",
      "reviews",
      "reports",
    ],
  },
  { groupLabelKey: GROUP_KEYS.ads, keys: ["ads"] },
  { groupLabelKey: GROUP_KEYS.point, keys: ["point"] },
  { groupLabelKey: GROUP_KEYS.settings, keys: ["settings"] },
  { groupLabelKey: GROUP_KEYS.manage, keys: ["manage"] },
  { groupLabelKey: GROUP_KEYS.system, keys: ["dev", "create_admin"] },
];

export function adminPermissionGroupLabel(groupLabelKey: MessageKey): string {
  return permT(groupLabelKey);
}
