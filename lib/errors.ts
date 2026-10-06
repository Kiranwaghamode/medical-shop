// Expected business errors thrown by services. tRPC's protectedProcedure turns them into
// TRPCErrors with the same code and message, so the UI can show the message as-is.
export type AppErrorCode = "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Turns a database rule violation (CHECK / unique constraint) into a friendly AppError.
 * `messages` maps constraint names — or, for unique violations, field names — to messages.
 * Returns null when the error is not one of those, so callers can rethrow it.
 */
export function friendlyDbError(error: unknown, messages: Record<string, string>): AppError | null {
  if (!(error instanceof Error)) return null;
  const details = `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? {})}`;
  for (const [key, message] of Object.entries(messages)) {
    if (details.includes(key)) return new AppError("CONFLICT", message);
  }
  return null;
}
