/**
 * Cutover flag — product hub list paints from ConversationStore after seed+bridge.
 * Shadow compare always runs when engine lifecycle is enabled.
 */
export const CONVERSATION_ENGINE_ENABLED = true;

/** When true, hub chats/groups paint from ConversationStore (legacy RT list writer disconnected). */
export const CONVERSATION_ENGINE_PRODUCT_PAINT = true;
