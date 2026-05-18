import type { HTMLAttributes, ReactNode } from "react";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export function DeliverySection({
  title,
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className={className} {...props}>
      {title ? <h2 className={DeliveryTheme.typo.sectionTitle}>{title}</h2> : null}
      {children}
    </section>
  );
}
