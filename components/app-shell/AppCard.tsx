import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

type AppCardVariant = "default" | "flat" | "muted" | "elevated";

export type AppCardProps = ComponentPropsWithoutRef<"div"> & {
  children: ReactNode;
  variant?: AppCardVariant;
};

export function AppCard({ children, variant = "default", className, ...rest }: AppCardProps) {
  const cardClass =
    variant === "flat"
      ? Sam.card.flat
      : variant === "muted"
        ? Sam.card.muted
        : variant === "elevated"
          ? Sam.card.elevated
          : Sam.card.base;
  return (
    <div className={`${cardClass} ${className ?? ""}`.trim()} {...rest}>
      {children}
    </div>
  );
}
