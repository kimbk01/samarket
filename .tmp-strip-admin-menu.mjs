import fs from "fs";

const path = "components/admin/admin-menu.ts";
let src = fs.readFileSync(path, "utf8");

// Remove Korean from title fields (display uses titleKey).
src = src.replace(/title: "([^"]*)"/g, (full, title) => {
  if (/[\uAC00-\uD7A3]/.test(title)) return 'title: ""';
  return full;
});

const resolver = `
const ADMIN_MENU_TITLE_KEY_OVERRIDES: Partial<Record<string, MessageKey>> = {
  system: "admin_menu_dev",
  business: "admin_menu_delivery",
  "delivery-ops-console": "admin_menu_delivery_ops_console",
  "delivery-operations-stats": "admin_menu_delivery_operations_stats",
  "delivery-riders-ops": "admin_menu_delivery_riders_ops",
  "delivery-operation-alerts": "admin_menu_delivery_operation_alerts",
  "delivery-auto-actions": "admin_menu_delivery_auto_actions",
  "runtime-health": "admin_menu_runtime_health",
  "delivery-release-gate": "admin_menu_delivery_release_gate",
  "store-fee-policies-admin": "admin_menu_store_fee_policies_admin",
  "dibay-notification-campaigns": "admin_menu_dibay_notification_campaigns",
};

function resolveAdminMenuTitleKey(itemKey: string): MessageKey | undefined {
  return (
    ADMIN_MENU_TITLE_KEY_BY_ITEM_KEY[itemKey] ??
    ADMIN_MENU_TITLE_KEY_OVERRIDES[itemKey] ??
    (\`admin_menu_\${itemKey.replace(/-/g, "_")}\` as MessageKey)
  );
}
`;

if (!src.includes("resolveAdminMenuTitleKey")) {
  src = src.replace(
    "function attachAdminMenuTitleKeys(items: AdminMenuItem[]): AdminMenuItem[] {",
    resolver +
      "\nfunction attachAdminMenuTitleKeys(items: AdminMenuItem[]): AdminMenuItem[] {"
  );
  src = src.replace(
    "titleKey: item.titleKey ?? ADMIN_MENU_TITLE_KEY_BY_ITEM_KEY[item.key],",
    "titleKey: item.titleKey ?? resolveAdminMenuTitleKey(item.key),"
  );
}

fs.writeFileSync(path, src);
console.log("admin-menu.ts updated");
