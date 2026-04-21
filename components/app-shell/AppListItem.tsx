import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

export type AppListItemProps = ComponentPropsWithoutRef<"div"> & {
  children: ReactNode;
  interactive?: boolean;
  selected?: boolean;
};

export function AppListItem({ children, interactive, selected, className, ...rest }: AppListItemProps) {
  const base = selected ? Sam.listRow.selected : interactive ? Sam.listRow.interactive : Sam.listRow.base;
  return (
    <div className={`${base} ${className ?? ""}`.trim()} {...rest}>
      {children}
    </div>
  );
}
