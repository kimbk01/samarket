/**
 * Owner Admin CTA contract — single visual system for primary/secondary/danger/toggle.
 * Prefer these over ad-hoc Tailwind button skins on Owner surfaces.
 */
import { Sam } from "@/lib/ui/sam-component-classes";

const BASE =
  "inline-flex min-h-11 min-w-0 touch-manipulation select-none items-center justify-center gap-1.5 rounded-ui-rect px-4 text-sm font-semibold leading-none transition-[background-color,border-color,color,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-45";

/** Force readable on-primary text even when parent cards set inherited color. */
const PRIMARY_TEXT = "text-[color:var(--sam-text-on-primary)]";

export const OwnerCta = {
  primary: `${BASE} border border-transparent bg-sam-primary ${PRIMARY_TEXT} ${Sam.btn.primary}`,
  primaryCombo: `${BASE} ${Sam.btn.primaryCombo} ${PRIMARY_TEXT}`,
  secondary: `${BASE} border border-sam-primary-border bg-sam-primary-soft text-sam-primary`,
  secondaryCombo: `${BASE} ${Sam.btn.secondaryCombo}`,
  tertiary: `${BASE} border border-sam-border bg-sam-surface text-sam-fg`,
  danger: `${BASE} border border-sam-danger/30 bg-sam-surface text-sam-danger`,
  dangerSoft: `${BASE} border border-sam-danger/20 bg-sam-danger-soft text-sam-danger`,
  ghost: `${BASE} border border-transparent bg-transparent text-sam-muted`,
  /** Inline form row CTA — never shrink/wrap labels */
  formPrimary: `${BASE} shrink-0 whitespace-nowrap border border-transparent bg-sam-primary ${PRIMARY_TEXT}`,
  formSecondary: `${BASE} shrink-0 whitespace-nowrap border border-sam-primary-border bg-sam-primary-soft text-sam-primary`,
  block: "w-full",
} as const;

/** Standard Owner form row: input grows, CTA stays single-line. */
export const OWNER_FORM_ACTION_ROW_CLASS =
  "flex flex-col gap-2 sm:flex-row sm:items-stretch";

export const OWNER_FORM_INPUT_GROW_CLASS = "min-w-0 flex-1";
