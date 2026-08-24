"use client";

/**
 * Delivery CMS page wrapper — shell owns primary + right menus.
 * No content-left duplicate nav / fake top strip.
 */

export function AdminDeliveryCmsChrome({
  children,
}: {
  children: React.ReactNode;
  /** @deprecated Help is derived from pathname in AdminDeliveryCmsRightMenu */
  help?: "home" | "category";
}) {
  return (
    <div className="admin-delivery-cms min-w-0" data-admin-delivery-cms="1">
      {children}
    </div>
  );
}
