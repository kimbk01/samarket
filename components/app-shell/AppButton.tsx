import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

type AppButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

export type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: AppButtonVariant;
  block?: boolean;
  sm?: boolean;
};

export function AppButton({
  children,
  variant = "primary",
  block,
  sm,
  className,
  type = "button",
  ...rest
}: AppButtonProps) {
  const combo =
    variant === "primary"
      ? Sam.btn.primaryCombo
      : variant === "secondary"
        ? Sam.btn.secondaryCombo
        : variant === "ghost"
          ? Sam.btn.ghostCombo
          : variant === "danger"
            ? Sam.btn.dangerCombo
            : Sam.btn.outlineCombo;
  const extra = [block ? Sam.btn.block : "", sm ? Sam.btn.sm : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <button type={type} className={`${combo} ${extra}`.trim()} {...rest}>
      {children}
    </button>
  );
}
