/**
 * The value a content-panel form gets back from its submit.
 *
 * Server Actions must return something serialisable, and the message is written
 * here rather than in the browser because the sentence that explains a refusal
 * is the same sentence the audit trail records.
 */
export type ActionState = {
  ok: boolean;
  message: string;
  /** Field name → what to do about it. */
  errors?: Record<string, string>;
  /** Set when a create succeeded, so the page can move to editing the new record. */
  createdId?: string | null;
};

export const IDLE_ACTION_STATE: ActionState | null = null;

export function actionOk(message: string, createdId: string | null = null): ActionState {
  return { ok: true, message, createdId };
}

export function actionError(message: string, errors: Record<string, string> = {}): ActionState {
  return { ok: false, message, errors };
}
