/**
 * DIBAY INTRO — V1 Publish errors.
 */

export class PublishAuthError extends Error {
  readonly name = "PublishAuthError";
  constructor(message = "PUBLISH_AUTH_REQUIRED") {
    super(message);
  }
}

export class PublishValidationError extends Error {
  readonly name = "PublishValidationError";
  readonly issues: unknown;
  constructor(issues: unknown) {
    super("PUBLISH_VALIDATION_FAILED");
    this.issues = issues;
  }
}

export class PublishConflictError extends Error {
  readonly name = "PublishConflictError";
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export class PublishNotFoundError extends Error {
  readonly name = "PublishNotFoundError";
  constructor() {
    super("DOCUMENT_NOT_FOUND");
  }
}

export class PublishFailedOpError extends Error {
  readonly name = "PublishFailedOpError";
  readonly publishOperationId: string;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  constructor(args: {
    publishOperationId: string;
    failureCode: string | null;
    failureMessage: string | null;
  }) {
    super("PUBLISH_OPERATION_FAILED");
    this.publishOperationId = args.publishOperationId;
    this.failureCode = args.failureCode;
    this.failureMessage = args.failureMessage;
  }
}

export class PublishSealCollisionError extends Error {
  readonly name = "PublishSealCollisionError";
  constructor(message: string) {
    super(message);
  }
}
