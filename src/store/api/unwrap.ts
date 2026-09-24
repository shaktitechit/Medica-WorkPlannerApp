export interface ApiEnvelope<T = unknown> {
  success?: boolean;
  data: T;
  message?: string;
}

export function unwrapEnvelope<T>(raw: any): T {
  if (raw && typeof raw === "object" && "data" in raw && raw.data !== undefined) {
    return raw.data as T;
  }
  return raw as T;
}
