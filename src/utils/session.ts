/**
 * One id per TAB, generated once at module load — never the uid [R2].
 * Session nodes are keyed by this; uid travels as a field, so two tabs of one
 * account are two cursors but one entry in the deduped online list.
 */
export const sessionId = crypto.randomUUID()
