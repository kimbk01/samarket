/**
 * CUT 4-A — compile-time MessageKey contract (valid accepted / invalid rejected).
 * Kept in product graph so typecheck:build enforces it.
 */
import type { MessageKey } from "./messages";

export const MESSAGE_KEY_CONTRACT_VALID: MessageKey = "common_loading";

// @ts-expect-error — invalid MessageKey must remain a compile error
export const MESSAGE_KEY_CONTRACT_INVALID: MessageKey = "zz_invalid_message_key_not_in_catalog";

type _ValidAccepted = "common_loading" extends MessageKey ? true : false;
type _InvalidRejected = "zz_invalid_message_key_not_in_catalog" extends MessageKey ? true : false;

const _validAccepted: _ValidAccepted = true;
const _invalidRejected: _InvalidRejected = false;

void _validAccepted;
void _invalidRejected;
