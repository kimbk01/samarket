import type { ReactNode } from "react";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export function DeliveryInfoCard({
  label,
  children,
  value,
  multiline = false,
}: {
  label: string;
  children?: ReactNode;
  value?: string;
  multiline?: boolean;
}) {
  const valueClass = multiline
    ? `${DeliveryTheme.infoCard.value} delivery-modal-section__value--address`
    : DeliveryTheme.infoCard.value;

  return (
    <section className={DeliveryTheme.infoCard.root}>
      <p className={DeliveryTheme.infoCard.label}>{label}</p>
      {children != null ? (
        <div className={valueClass}>{children}</div>
      ) : (
        <p className={valueClass}>{value}</p>
      )}
    </section>
  );
}
