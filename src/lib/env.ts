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

export function getAttachmentPreviewUrl(attachmentIdOrUrl?: string | null, token?: string | null): string {
  if (!attachmentIdOrUrl) return "";
  const raw = String(attachmentIdOrUrl).trim();
  const match = raw.match(/(?:attachments|files)\/([a-zA-Z0-9._-]+)/i);
  const cleanId = match ? match[1] : raw;
  const base = `${WORK_PLANNER_SERVICE_URL}/api/projects/attachments/${cleanId}/preview`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function getAttachmentDownloadUrl(attachmentIdOrUrl?: string | null, token?: string | null): string {
  if (!attachmentIdOrUrl) return "";
  const raw = String(attachmentIdOrUrl).trim();
  const match = raw.match(/(?:attachments|files)\/([a-zA-Z0-9._-]+)/i);
  const cleanId = match ? match[1] : raw;
  const base = `${WORK_PLANNER_SERVICE_URL}/api/projects/attachments/${cleanId}/download`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function resolvePublicAssetUrl(path: string, token?: string | null): string {
  if (!path) return "";
  const value = path.trim();
  if (/^data:image\//i.test(value)) return value;

  // Check if it's an attachment path or raw attachment ObjectId (24 hex characters)
  if (/^[0-9a-fA-F]{24}$/.test(value)) {
    const base = `${WORK_PLANNER_SERVICE_URL}/api/work-planner/attachments/${value}/view`;
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }

  const cleanPath = value.startsWith("/") ? value : `/${value}`;

  if (
    cleanPath.startsWith("/api/work-planner") ||
    cleanPath.startsWith("/api/projects") ||
    cleanPath.startsWith("/api/files")
  ) {
    const full = `${WORK_PLANNER_SERVICE_URL}${cleanPath}`;
    return token && !full.includes("token=") ? `${full}${full.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : full;
  }

  if (cleanPath.startsWith("/uploads") || cleanPath.startsWith("/api/uploads")) {
    return `${AUTH_SERVICE_URL}${cleanPath}`;
  }

  if (/^https?:\/\//i.test(value)) {
    // If it's a minio url containing an attachment or file key, prefer the backend proxy to prevent Access Denied
    const match = value.match(/(?:attachments|files)\/([a-zA-Z0-9._-]+)/i);
    if (match && (value.includes("spspl.com") || value.includes(":9000") || value.includes(":7005") || value.includes("minio") || value.includes("file-manager"))) {
      const cleanId = match[1];
      const isProject = value.includes("/projects/") || value.includes("project");
      const base = isProject
        ? `${WORK_PLANNER_SERVICE_URL}/api/projects/attachments/${cleanId}/view`
        : `${WORK_PLANNER_SERVICE_URL}/api/work-planner/attachments/${cleanId}/view`;
      return token && !base.includes("token=") ? `${base}${base.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : base;
    }
    if (token && (value.includes("/api/work-planner/") || value.includes("/api/projects/") || value.includes("/api/files/")) && !value.includes("token=")) {
      return `${value}${value.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    }
    return value;
  }

  return `${AUTH_SERVICE_URL}${cleanPath}`;
}

