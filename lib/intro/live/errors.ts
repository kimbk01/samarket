/** DIBAY INTRO — V2 Live mutation errors. */

export class LiveValidationError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "LiveValidationError";
    this.code = code;
  }
}

export class LiveConflictError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "LiveConflictError";
    this.code = code;
  }
}

export class LiveNotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;
  constructor(message = "NOT_FOUND") {
    super(message);
    this.name = "LiveNotFoundError";
  }
}
