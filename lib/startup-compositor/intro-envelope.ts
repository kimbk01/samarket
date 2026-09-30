/**
 * REBUILD 14 — Intro field inside StartupPackageEnvelope.
 * Intro is optional (present=false valid). Document payload validated separately by capability registries.
 */

export type IntroEnvelopeAbsent = {
  readonly present: false;
};

export type IntroEnvelopePresent = {
  readonly present: true;
  /** Opaque document reference / IR blob identity for later compositor phases. */
  readonly document: Record<string, unknown>;
};

export type IntroEnvelope = IntroEnvelopeAbsent | IntroEnvelopePresent;

export type IntroEnvelopeValidation =
  | { readonly ok: true; readonly value: IntroEnvelope }
  | { readonly ok: false; readonly reason: string };

export function parseIntroEnvelope(raw: unknown): IntroEnvelopeValidation {
  if (raw == null) {
    return { ok: false, reason: "intro_missing_field" };
  }
  if (typeof raw !== "object") {
    return { ok: false, reason: "intro_not_object" };
  }
  const o = raw as Record<string, unknown>;
  if (o.present === false) {
    return { ok: true, value: { present: false } };
  }
  if (o.present === true) {
    if (!o.document || typeof o.document !== "object" || Array.isArray(o.document)) {
      return { ok: false, reason: "intro_document_required" };
    }
    return {
      ok: true,
      value: {
        present: true,
        document: o.document as Record<string, unknown>,
      },
    };
  }
  return { ok: false, reason: "intro_present_invalid" };
}
