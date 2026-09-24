import { Redirect, router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Empty, Field, Loading, Screen } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useGetUsersQuery } from "@/store/api/authApiSlice";
import { useGetTeamTreeQuery } from "@/store/api/workPlannerApiSlice";
import { hasWorkPlannerPortalAccess, isWpAdmin, roleLabel } from "@/utils/roles";
import { useThemeColors } from "@/theme";
import type { AuthUser } from "@/types/workPlanner";

type Person = {
  _id: string;
  name?: string;
  email?: string;
  department?: unknown;
  wp_role?: string;
  reports_to?: string | null;
};

function departmentName(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as { name?: string; code?: string; title?: string };
    return record.name || record.code || record.title || "";
  }
  return "";
}

function initials(name?: string) {
  const parts = String(name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "?";
}

export default function AssignedTeamsScreen() {
  const { session } = useSession();
  const colors = useThemeColors();
  const users = useGetUsersQuery();
  const tree = useGetTeamTreeQuery();
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  const model = useMemo(() => {
    const list = ((tree.data?.users || users.data || []) as Person[]).filter((user) => hasWorkPlannerPortalAccess(user as AuthUser));
    const byId = new Map(list.map((user) => [String(user._id), user]));
    const children = new Map<string, Person[]>();
    for (const user of list) {
      const parent = user.reports_to ? String(user.reports_to) : "";
      if (!parent || !byId.has(parent)) continue;
      const bucket = children.get(parent) || [];
      bucket.push(user);
      children.set(parent, bucket);
    }
    const unmapped = list.filter((user) => {
      const parent = user.reports_to ? String(user.reports_to) : "";
      return !parent || !byId.has(parent);
    }).filter((user) => !(children.get(String(user._id)) || []).length);
    const roots = list.filter((user) => {
      const parent = user.reports_to ? String(user.reports_to) : "";
      if (parent && byId.has(parent)) return false;
      return (children.get(String(user._id)) || []).length > 0;
    });
    const mapped = list.length - unmapped.length;
    return { people: list, byId, children, roots, unmapped, mapped };
  }, [tree.data, users.data]);

  const needle = query.trim().toLowerCase();
  function matches(user: Person) {
    if (!needle) return true;
    return `${user.name || ""} ${user.email || ""} ${departmentName(user.department)} ${user.wp_role || ""}`.toLowerCase().includes(needle);
  }
  function branchVisible(user: Person): boolean {
    if (matches(user)) return true;
    return (model.children.get(String(user._id)) || []).some(branchVisible);
  }

  const visibleRoots = model.roots.filter(branchVisible);
  const visibleUnmapped = model.unmapped.filter(matches);
  const loading = users.isLoading || tree.isLoading;

  function toggle(id: string) {
    setOpenIds((current) => ({ ...current, [id]: current[id] === false }));
  }

  function Node({ user, depth, nested }: { user: Person; depth: number; nested?: boolean }) {
    const id = String(user._id);
    const kids = (model.children.get(id) || []).filter(branchVisible);
    const open = openIds[id] !== false;
    const parent = user.reports_to ? model.byId.get(String(user.reports_to)) : undefined;
    const lead = !parent && kids.length > 0;
    const tone = lead ? colors.primary : colors.success;
    const toneSoft = lead ? colors.primarySoft : "#dcfce7";
    const role = user.wp_role || roleLabel(user as AuthUser);
    return (
      <View style={{ marginLeft: depth ? 18 : 0 }}>
        {depth ? (
          <View style={{ position: "absolute", left: -12, top: 0, bottom: 0, width: 12 }}>
            <View style={{ position: "absolute", left: 0, top: 0, bottom: nested ? 0 : 22, width: 1, backgroundColor: colors.border }} />
            <View style={{ position: "absolute", left: 0, top: 22, width: 12, height: 1, backgroundColor: colors.border }} />
          </View>
        ) : null}
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card, overflow: "hidden" }}>
          <Pressable
            onPress={() => (kids.length ? toggle(id) : router.push(`/team/${id}`))}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12 }}
          >
            <View style={{ width: 22, alignItems: "center" }}>
              {kids.length ? (
                <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={16} color={colors.muted} />
              ) : (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone }} />
              )}
            </View>
            <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: toneSoft }}>
              <Text style={{ color: tone, fontWeight: "800", fontSize: 13 }}>{initials(user.name || user.email)}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>{user.name || user.email || "User"}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                {[role, departmentName(user.department)].filter(Boolean).join(" · ") || user.email}
              </Text>
              {parent ? (
                <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>Reports to {parent.name || parent.email}</Text>
              ) : (
                <Text style={{ color: colors.muted, fontSize: 11 }}>{kids.length} direct report{kids.length === 1 ? "" : "s"}</Text>
              )}
            </View>
            <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: toneSoft }}>
              <Text style={{ color: tone, fontSize: 10, fontWeight: "800" }}>{lead ? "Lead" : "Mapped"}</Text>
            </View>
          </Pressable>
        </View>
        {open && kids.length ? (
          <View style={{ gap: 8, marginTop: 8 }}>
            {kids.map((child, index) => (
              <Node key={String(child._id)} user={child} depth={depth + 1} nested={index < kids.length - 1} />
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  if (!isWpAdmin(session?.user)) return <Redirect href="/(tabs)" />;

  return (
    <Screen header>
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>Team hierarchy</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Mapped people sit under the person they report to. Anyone without a reporting line is listed separately.
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {[
          ["People", model.people.length, colors.text],
          ["Mapped", model.mapped, colors.success],
          ["Not mapped", model.unmapped.length, colors.danger],
        ].map(([label, value, tone]) => (
          <View key={String(label)} style={{ flex: 1, borderRadius: 16, padding: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 2 }}>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
            <Text style={{ color: tone as string, fontSize: 22, fontWeight: "800" }}>{value}</Text>
          </View>
        ))}
      </View>
      <Field label="Search" value={query} onChangeText={setQuery} placeholder="Name, email, or department" />
      {loading ? <Loading /> : null}
      {!loading && visibleRoots.length === 0 && visibleUnmapped.length === 0 ? <Empty label="No people match this search" /> : null}
      {visibleRoots.length ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="git-network-outline" size={16} color={colors.success} />
            <Text style={{ color: colors.text, fontWeight: "800" }}>Mapped</Text>
          </View>
          {visibleRoots.map((user) => (
            <Node key={String(user._id)} user={user} depth={0} />
          ))}
        </View>
      ) : null}
      {visibleUnmapped.length ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={{ color: colors.text, fontWeight: "800" }}>Not mapped</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{visibleUnmapped.length} without a manager</Text>
          </View>
          {visibleUnmapped.map((user) => {
            const role = user.wp_role || roleLabel(user as AuthUser);
            return (
              <Pressable
                key={String(user._id)}
                onPress={() => router.push(`/team/${user._id}`)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, backgroundColor: colors.card }}
              >
                <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#fee2e2" }}>
                  <Text style={{ color: colors.danger, fontWeight: "800", fontSize: 13 }}>{initials(user.name || user.email)}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>{user.name || user.email}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{[role, departmentName(user.department), user.email].filter(Boolean).join(" · ")}</Text>
                  <Text style={{ color: colors.danger, fontSize: 11 }}>No reporting line</Text>
                </View>
                <Text style={{ color: colors.danger, fontSize: 10, fontWeight: "800" }}>Not mapped</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}
