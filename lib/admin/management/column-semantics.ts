import type { CSSProperties } from "react";
import type { ManagementColumnKind } from "./types";

export type ManagementColumnDef = {
  kind: ManagementColumnKind;
  /** CSS width hint (px or rem). */
  width?: string;
  minWidth: string;
  maxWidth?: string;
  align: "left" | "center" | "right";
  sticky?: "left" | "right" | false;
  shrink: boolean;
};

/**
 * Semantic column vocabulary — replaces arbitrary min-w-[1100px] sprawl over waves.
 */
export const MANAGEMENT_COLUMN_DEFAULTS: Record<ManagementColumnKind, ManagementColumnDef> = {
  SELECTION: {
    kind: "SELECTION",
    width: "2.75rem",
    minWidth: "2.75rem",
    maxWidth: "2.75rem",
    align: "center",
    sticky: false,
    shrink: false,
  },
  IDENTITY: {
    kind: "IDENTITY",
    minWidth: "7.5rem",
    align: "left",
    sticky: false,
    shrink: false,
  },
  TITLE: {
    kind: "TITLE",
    minWidth: "12rem",
    align: "left",
    sticky: false,
    shrink: true,
  },
  STATUS: {
    kind: "STATUS",
    minWidth: "5.5rem",
    width: "6.5rem",
    align: "left",
    sticky: false,
    shrink: false,
  },
  NUMERIC: {
    kind: "NUMERIC",
    minWidth: "3.5rem",
    width: "4.5rem",
    align: "right",
    sticky: false,
    shrink: false,
  },
  DATE: {
    kind: "DATE",
    minWidth: "5.5rem",
    width: "6.5rem",
    align: "left",
    sticky: false,
    shrink: false,
  },
  METADATA: {
    kind: "METADATA",
    minWidth: "6rem",
    align: "left",
    sticky: false,
    shrink: true,
  },
  ACTIONS: {
    kind: "ACTIONS",
    minWidth: "5.5rem",
    width: "6.5rem",
    align: "center",
    sticky: false,
    shrink: false,
  },
};

export function managementColumnStyle(
  kind: ManagementColumnKind,
  override?: Partial<ManagementColumnDef>
): CSSProperties {
  const base = MANAGEMENT_COLUMN_DEFAULTS[kind];
  const def = { ...base, ...override };
  const style: CSSProperties = {
    minWidth: def.minWidth,
    width: def.width,
    maxWidth: def.maxWidth,
    textAlign: def.align,
  };
  if (def.shrink === false) {
    style.flexShrink = 0;
  }
  if (def.sticky === "left" || def.sticky === "right") {
    style.position = "sticky";
    style[def.sticky] = 0;
    style.zIndex = def.kind === "ACTIONS" ? 2 : 3;
    style.background = "var(--sam-surface, #fff)";
  }
  return style;
}

/** Table semantic min-width from column kinds (proof surfaces). */
export function computeTableMinWidthPx(kinds: readonly ManagementColumnKind[]): number {
  let sum = 0;
  for (const kind of kinds) {
    const d = MANAGEMENT_COLUMN_DEFAULTS[kind];
    const raw = d.width ?? d.minWidth;
    const n = Number.parseFloat(raw);
    // rem → px approx at 16
    sum += raw.endsWith("rem") ? n * 16 : n;
  }
  return Math.max(Math.round(sum), 640);
}
