/**
 * R1 Member Admin Visual System SSOT.
 * Shared authority for Dialog chrome, CTA hierarchy, typography, spacing, form presentation.
 * Consumes existing Admin / sam tokens — does not invent a parallel design language.
 */

export const MEMBER_ADMIN_VISUAL_AUTHORITY = "R1_ADMIN_VISUAL_SYSTEM" as const;

/** Dialog size variants — screens must not invent arbitrary widths. */
export type MemberAdminDialogSize = "small" | "standard" | "large";

export const MEMBER_ADMIN_DIALOG_SIZE_CLASS: Record<MemberAdminDialogSize, string> = {
  /** confirm / password — ~max-w-md */
  small: "member-admin-dialog--size-small",
  /** profile edit / standard forms — ~max-w-lg */
  standard: "member-admin-dialog--size-standard",
  /** dense create — ~max-w-xl */
  large: "member-admin-dialog--size-large",
};

export const MEMBER_ADMIN_DIALOG_SIZE_MAX_PX: Record<MemberAdminDialogSize, number> = {
  small: 448,
  standard: 512,
  large: 576,
};

/** Which R0 screen/modal uses which dialog size (R1 runtime consumers). */
export const MEMBER_ADMIN_DIALOG_SIZE_BY_WORKFLOW = {
  create: "large",
  edit: "standard",
  password: "small",
  dirty_confirm: "small",
} as const satisfies Record<string, MemberAdminDialogSize>;

export type MemberAdminCtaVariant = "primary" | "secondary" | "tertiary" | "danger";

/**
 * Shared CTA class tokens — height/padding/type weight aligned to R0.
 * Prefer these over per-screen arbitrary className stacks.
 */
export const MEMBER_ADMIN_CTA_CLASS: Record<MemberAdminCtaVariant, string> = {
  primary:
    "member-admin-cta member-admin-cta--primary inline-flex h-10 items-center justify-center gap-1.5 rounded-ui-rect bg-[color:var(--sam-brand,#2563eb)] px-4 text-sm font-medium text-white shadow-sm transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--sam-brand,#2563eb)] disabled:cursor-not-allowed disabled:opacity-40",
  secondary:
    "member-admin-cta member-admin-cta--secondary inline-flex h-10 items-center justify-center gap-1.5 rounded-ui-rect border border-sam-border bg-sam-surface px-4 text-sm font-medium text-sam-fg shadow-sm transition hover:bg-sam-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sam-border disabled:cursor-not-allowed disabled:opacity-40",
  tertiary:
    "member-admin-cta member-admin-cta--tertiary inline-flex h-10 items-center justify-center gap-1.5 rounded-ui-rect px-3 text-sm font-medium text-sam-muted transition hover:bg-sam-surface-muted hover:text-sam-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sam-border disabled:cursor-not-allowed disabled:opacity-40",
  danger:
    "member-admin-cta member-admin-cta--danger inline-flex h-10 items-center justify-center gap-1.5 rounded-ui-rect border border-[color:var(--sam-danger,#f04438)] bg-white px-4 text-sm font-medium text-[color:var(--sam-danger,#b42318)] shadow-sm transition hover:bg-[#fef3f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--sam-danger,#f04438)] disabled:cursor-not-allowed disabled:opacity-40",
};

export const MEMBER_ADMIN_CTA_VARIANTS = Object.keys(MEMBER_ADMIN_CTA_CLASS) as MemberAdminCtaVariant[];

export function memberAdminCtaClass(variant: MemberAdminCtaVariant): string {
  return MEMBER_ADMIN_CTA_CLASS[variant];
}

export function isMemberAdminCtaVariant(value: string): value is MemberAdminCtaVariant {
  return (MEMBER_ADMIN_CTA_VARIANTS as string[]).includes(value);
}

/** Typography roles — prefer these over scattered text-[Npx]. */
export type MemberAdminTypographyRole =
  | "PAGE_TITLE"
  | "PAGE_DESCRIPTION"
  | "SECTION_TITLE"
  | "SECTION_DESCRIPTION"
  | "MEMBER_PRIMARY_NAME"
  | "MEMBER_SECONDARY_NAME"
  | "MEMBER_IDENTIFIER"
  | "FIELD_LABEL"
  | "FIELD_VALUE"
  | "HELP_TEXT"
  | "ERROR_TEXT"
  | "TABLE_HEADER"
  | "TABLE_PRIMARY"
  | "TABLE_SECONDARY"
  | "BADGE_TEXT"
  | "BUTTON_TEXT";

export const MEMBER_ADMIN_TYPOGRAPHY_CLASS: Record<MemberAdminTypographyRole, string> = {
  PAGE_TITLE: "text-xl font-semibold text-sam-fg",
  PAGE_DESCRIPTION: "text-sm text-sam-muted",
  SECTION_TITLE: "text-base font-semibold text-sam-fg",
  SECTION_DESCRIPTION: "text-sm text-sam-muted",
  MEMBER_PRIMARY_NAME: "text-lg font-semibold text-sam-fg",
  MEMBER_SECONDARY_NAME: "text-sm text-sam-muted",
  MEMBER_IDENTIFIER: "font-mono text-xs text-sam-muted",
  FIELD_LABEL: "mb-1 block text-sm font-medium text-sam-fg",
  FIELD_VALUE: "text-sm text-sam-fg",
  HELP_TEXT: "mt-1 text-xs text-sam-muted",
  ERROR_TEXT: "mt-1 text-xs font-medium text-[color:var(--sam-danger,#b42318)]",
  TABLE_HEADER: "text-xs font-medium text-sam-muted",
  TABLE_PRIMARY: "text-sm font-medium text-sam-fg",
  TABLE_SECONDARY: "text-sm text-sam-muted",
  BADGE_TEXT: "text-xs font-medium",
  BUTTON_TEXT: "text-sm font-medium",
};

export function memberAdminTypographyClass(role: MemberAdminTypographyRole): string {
  return MEMBER_ADMIN_TYPOGRAPHY_CLASS[role];
}

/** Spacing rhythm (px): 4 / 8 / 12 / 16 / 24 */
export const MEMBER_ADMIN_SPACING = {
  pageHeaderBottom: 24,
  sectionGap: 24,
  cardPad: 16,
  formGroupGap: 16,
  fieldGap: 12,
  labelToInput: 4,
  inputToHelp: 4,
  ctaSiblingGap: 8,
  ctaGroupGap: 16,
  dialogHeaderBody: 12,
  dialogBodyFooter: 16,
  dialogPadX: 16,
  dialogPadY: 16,
  tableCellPadX: 12,
  tableCellPadY: 10,
} as const;

export const MEMBER_ADMIN_FORM_FIELD_CLASS = {
  input:
    "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sam-brand,#2563eb)] disabled:opacity-50",
  select:
    "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sam-brand,#2563eb)] disabled:opacity-50",
  readonly: "text-sm text-sam-fg",
  requiredMark: "ml-0.5 text-[color:var(--sam-danger,#b42318)]",
} as const;

/** Close (X) discoverability contract beyond hit-target size. */
export const MEMBER_ADMIN_DIALOG_CLOSE_CLASS =
  "member-admin-dialog-close inline-flex shrink-0 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface-muted text-sam-fg shadow-sm transition hover:bg-sam-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sam-border disabled:opacity-40";

export const MEMBER_ADMIN_DIALOG_HEADER_CLASS =
  "relative flex min-h-14 items-start gap-3 border-b border-sam-border pb-3 pr-1";

export const MEMBER_ADMIN_DIALOG_FOOTER_CLASS =
  "mt-4 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-sam-border pt-4";

export const MEMBER_ADMIN_DIALOG_BODY_CLASS = "mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain";
