/**
 * DIBAY INTRO — Phase 1
 * Structured validation issues. No stack traces as contract output.
 */

export type ValidationSeverity = "error" | "warning";

export type ValidationMode =
  | "DRAFT"
  | "PUBLISH"
  | "PACK"
  | "DEVICE_COMPATIBILITY";

export type ValidationIssue = {
  readonly code: string;
  readonly severity: ValidationSeverity;
  readonly path: string;
  readonly message: string;
};

export type ValidationResult = {
  readonly mode: ValidationMode;
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
};

export function issue(
  code: string,
  severity: ValidationSeverity,
  path: string,
  message: string,
): ValidationIssue {
  return { code, severity, path, message };
}

export function result(
  mode: ValidationMode,
  issues: readonly ValidationIssue[],
): ValidationResult {
  const hasError = issues.some((i) => i.severity === "error");
  return { mode, ok: !hasError, issues };
}
