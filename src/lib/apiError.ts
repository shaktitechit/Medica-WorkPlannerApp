export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== "object") return fallback;
  const record = err as {
    data?: { message?: string; error?: string };
    error?: string;
    message?: string;
  };
  return record.data?.message || record.data?.error || record.error || record.message || fallback;
}
