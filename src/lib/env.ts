function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export const AUTH_SERVICE_URL = trimSlash(
  process.env.EXPO_PUBLIC_AUTH_SERVICE_URL || "http://localhost:7003",
);

export const WORK_PLANNER_SERVICE_URL = trimSlash(
  process.env.EXPO_PUBLIC_WORK_PLANNER_SERVICE_URL || "http://localhost:7007",
);

export const PARTY_SERVICE_URL = trimSlash(process.env.EXPO_PUBLIC_PARTY_SERVICE_URL || "");

export const LEAD_MANAGER_SERVICE_URL = trimSlash(
  process.env.EXPO_PUBLIC_LEAD_MANAGER_SERVICE_URL || "",
);

export function resolvePublicAssetUrl(path: string): string {
  if (!path) return "";
  const value = path.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^data:image\//i.test(value)) return value;
  const cleanPath = value.startsWith("/") ? value : `/${value}`;
  if (cleanPath.startsWith("/uploads") || cleanPath.startsWith("/api/uploads")) {
    return `${AUTH_SERVICE_URL}${cleanPath}`;
  }
  return `${AUTH_SERVICE_URL}${cleanPath}`;
}
