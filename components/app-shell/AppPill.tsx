import type { ReactNode } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

export type AppPillProps = {
  children: ReactNode;
  active?: boolean;
  className?: string;
};

export function AppPill({ children, active, className }: AppPillProps) {
  const c = active ? Sam.chip.activeCombo : Sam.chip.inactiveCombo;
  return <span className={`${c} ${className ?? ""}`.trim()}>{children}</span>;
}
