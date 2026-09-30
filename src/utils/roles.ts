import type { AuthUser, UserPortalAccess } from "@/types/workPlanner";

export function hasWorkPlannerPortalAccess(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  const extra = user as AuthUser & { portal_access?: UserPortalAccess[] };
  if (
    user.department === "super_admin" ||
    user.role_codes?.includes("super_admin") ||
    user.roles?.includes("super_admin")
  ) {
    return true;
  }
  const portals = Array.isArray(user.portals)
    ? user.portals
    : Array.isArray(extra.portal_access)
      ? extra.portal_access
      : [];
  const portalAccess = portals.find(
    (p) => p && (p.portal_code === "work_planner" || (p as { portal?: string }).portal === "work_planner"),
  );
  return Boolean(portalAccess && Array.isArray(portalAccess.access_roles) && portalAccess.access_roles.length > 0);
}

function getWpAccessRoles(user: AuthUser | null | undefined): string[] {
  if (!user) return [];
  const portals = Array.isArray(user.portals) ? user.portals : [];
  const portalAccess = portals.find(
    (p) => p.portal_code === "work_planner" || (p as { portal?: string }).portal === "work_planner",
  );
  if (!portalAccess || !Array.isArray(portalAccess.access_roles)) return [];
  return portalAccess.access_roles.map((r) => String(r).toLowerCase());
}

function isSuperAdminBypass(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return (
    user.department === "super_admin" ||
    Boolean(user.role_codes?.includes("super_admin")) ||
    Boolean(user.roles?.includes("super_admin"))
  );
}

export function isWpAdmin(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdminBypass(user)) return true;
  return getWpAccessRoles(user).includes("admin");
}

export function isWpManager(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (isWpAdmin(user)) return false;
  return getWpAccessRoles(user).includes("manager");
}

export function isWpCoordinator(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (isWpAdmin(user) || isWpManager(user)) return false;
  return getWpAccessRoles(user).includes("coordinator");
}

export function isWpElevated(user: AuthUser | null | undefined): boolean {
  return isWpAdmin(user) || isWpManager(user) || isWpCoordinator(user);
}

/** Portal executive, including the legacy `sales` role. Admin, manager, and coordinator are excluded. */
export function isWpExecutive(user: AuthUser | null | undefined): boolean {
  if (!user || isWpElevated(user)) return false;
  const roles = getWpAccessRoles(user);
  if (roles.some((role) => role === "executive" || role === "sales")) return true;
  const tokens = [user.department, ...(user.roles || []), ...(user.role_codes || [])].map((role) =>
    String(role || "").toLowerCase(),
  );
  if (tokens.some((role) => role === "executive" || role === "sales")) return true;
  return hasWorkPlannerPortalAccess(user);
}

export function roleLabel(user: AuthUser | null | undefined): string {
  if (isWpAdmin(user)) return "Admin";
  if (isWpManager(user)) return "Manager";
  if (isWpCoordinator(user)) return "Coordinator";
  if (isWpExecutive(user)) return "Executive";
  return "User";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

/** Who an admin may assign a work plan to. Matches the web plan form picker. */
export function canReceiveWorkPlan(
  user:
    | {
        _id?: string;
        department?: string;
        roles?: unknown;
        role_codes?: unknown;
        portals?: unknown;
      }
    | null
    | undefined,
  sessionUserId?: string,
): boolean {
  if (!user) return false;
  if (sessionUserId && String(user._id) === String(sessionUserId)) return true;
  const roles = stringList(user.roles);
  const roleCodes = stringList(user.role_codes);
  if (user.department === "super_admin" || roleCodes.includes("super_admin") || roles.includes("super_admin")) {
    return true;
  }
  const portals = Array.isArray(user.portals) ? user.portals : [];
  const portal = portals.find((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as { portal_code?: string; portal?: string };
    return record.portal_code === "work_planner" || record.portal === "work_planner";
  }) as { access_roles?: unknown; access_role?: unknown } | undefined;
  if (!portal) return false;
  const accessRoles = stringList(portal.access_roles).concat(portal.access_role ? [String(portal.access_role)] : []);
  if (!accessRoles.length) return true;
  return accessRoles.some((role) => ["executive", "coordinator", "manager", "admin", "sales"].includes(role.toLowerCase().trim()));
}

export function isWorkPlannerPortalUser(
  user: { portals?: unknown; department?: string; roles?: unknown; role_codes?: unknown } | null | undefined,
): boolean {
  return hasWorkPlannerPortalAccess(user as AuthUser);
}
