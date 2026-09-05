import { Sam } from "@/lib/ui/sam-component-classes";
import type { ManagementCtaVariant } from "./types";

/**
 * Maps management CTA taxonomy → existing Sam / ConsoleButton variants.
 * No new color palette.
 */
export function managementCtaSamClass(variant: ManagementCtaVariant): string {
  switch (variant) {
    case "PRIMARY":
      return Sam.btn.primaryCombo;
    case "SECONDARY":
      return Sam.btn.secondaryCombo;
    case "TERTIARY":
      return Sam.btn.ghostCombo;
    case "STATUS":
      return Sam.btn.outlineCombo;
    case "CRITICAL_DANGER":
      return `${Sam.btn.dangerCombo} ring-2 ring-red-800/70 font-semibold`;
    case "DANGER":
      return Sam.btn.dangerCombo;
    default:
      return Sam.btn.secondaryCombo;
  }
}

export function managementCtaConsoleVariant(
  variant: ManagementCtaVariant
): "primary" | "secondary" | "ghost" | "danger" {
  switch (variant) {
    case "PRIMARY":
      return "primary";
    case "DANGER":
    case "CRITICAL_DANGER":
      return "danger";
    case "TERTIARY":
      return "ghost";
    case "STATUS":
    case "SECONDARY":
    default:
      return "secondary";
  }
}

/** Canonical meaning → taxonomy slot */
export const CTA_MEANING = {
  primaryProgress: "PRIMARY",
  detailNavigate: "SECONDARY",
  stateTransition: "STATUS",
  destructive: "DANGER",
  permanentDestructive: "CRITICAL_DANGER",
  tertiaryGhost: "TERTIARY",
} as const satisfies Record<string, ManagementCtaVariant>;
