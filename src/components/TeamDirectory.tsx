import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Empty, Field, Loading, Screen, SplitActions } from "@/components/ui";
import { isoDate, personId, todayISO } from "@/lib/dates";
import { useSession } from "@/lib/session";
import { useGetUsersQuery } from "@/store/api/authApiSlice";
import { useGetExpensesQuery, useGetMyTeamQuery, useGetPlansQuery, useGetTeamTreeQuery } from "@/store/api/workPlannerApiSlice";
import type { WorkPlanExpenseRecord, WorkPlanRecord } from "@/types/workPlanner";
import { hasWorkPlannerPortalAccess, roleLabel } from "@/utils/roles";
import { useThemeColors } from "@/theme";
import type { AuthUser } from "@/types/workPlanner";

type DirectoryUser = {
  _id: string;
  name?: string;
  email?: string;
  department?: unknown;
  wp_role?: string;
  reports_to?: string | null;
  report_ids?: string[];
  portals?: unknown;
  roles?: unknown;
  role_codes?: unknown;
};

type Stats = {
  plans: number;
  pendingPlans: number;
  completedPlans: number;
  today: boolean;
  expenses: number;
  expenseTotal: number;
  pendingExpenses: number;
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

function refId(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as { _id?: string; id?: string };
    return String(record._id || record.id || "");
  }
  return "";
}

function emptyStats(): Stats {
  return { plans: 0, pendingPlans: 0, completedPlans: 0, today: false, expenses: 0, expenseTotal: 0, pendingExpenses: 0 };
}

function money(amount: number) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function initials(name?: string) {
  const parts = String(name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "?";
}

export function TeamDirectory({ mode }: { mode: "mine" | "assigned" }) {
  const colors = useThemeColors();
  const { session } = useSession();
  const adminList = mode === "assigned";
  const users = useGetUsersQuery(undefined, { skip: !adminList });
  const myTeam = useGetMyTeamQuery(undefined, { skip: adminList });
  const tree = useGetTeamTreeQuery(undefined, { skip: !adminList });
  const plans = useGetPlansQuery({ limit: 300, scope: "team" });
  const expenses = useGetExpensesQuery({ limit: 300, scope: "team" });
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  const stats = useMemo(() => {
    const map = new Map<string, Stats>();
    const touch = (key: string) => {
      const current = map.get(key) || emptyStats();
      map.set(key, current);
      return current;
    };
    const today = todayISO();
    for (const plan of (plans.data?.data || []) as WorkPlanRecord[]) {
      const id = personId(plan.sales_user);
      const email = typeof plan.sales_user === "object" ? String(plan.sales_user?.email || "").toLowerCase() : "";
      for (const key of [id, email].filter(Boolean)) {
        const row = touch(key);
        row.plans += 1;
        if (plan.status === "submitted") row.pendingPlans += 1;
        if (plan.status === "completed") row.completedPlans += 1;
        if (isoDate(plan.plan_date) === today) row.today = true;
      }
    }
    for (const expense of (expenses.data?.data || []) as WorkPlanExpenseRecord[]) {
      const owner = typeof expense.sales_user === "object" ? expense.sales_user : expense.sales_user;
      const id = personId(owner);
      const email = typeof expense.sales_user === "object" ? String(expense.sales_user?.email || "").toLowerCase() : "";
      for (const key of [id, email].filter(Boolean)) {
        const row = touch(key);
        row.expenses += 1;
        row.expenseTotal += Number(expense.amount) || 0;
        if (expense.status === "submitted") row.pendingExpenses += 1;
      }
    }
    return map;
  }, [plans.data, expenses.data]);

  const model = useMemo(() => {
    if (adminList) {
      const list = ((tree.data?.users || users.data || []) as DirectoryUser[]).filter((user) => {
        const email = String(user.email || "").toLowerCase();
        const row = stats.get(String(user._id)) || stats.get(email);
        return hasWorkPlannerPortalAccess(user as AuthUser) || Boolean(row && (row.plans > 0 || row.expenses > 0));
      });
      const byId = new Map(list.map((user) => [String(user._id), user]));
      const children = new Map<string, DirectoryUser[]>();
      for (const user of list) {
        const parent = user.reports_to ? String(user.reports_to) : "";
        if (!parent || !byId.has(parent)) continue;
        const bucket = children.get(parent) || [];
        bucket.push(user);
        children.set(parent, bucket);
      }
      const unmapped = list.filter((user) => !user.reports_to && !(children.get(String(user._id)) || []).length);
      const roots = list.filter((user) => {
        const parent = user.reports_to ? String(user.reports_to) : "";
        if (parent && byId.has(parent)) return false;
        return (children.get(String(user._id)) || []).length > 0;
      });
      return { people: list, children, roots, unmapped, selfId: "" };
    }

    const list = (myTeam.data?.members || []) as DirectoryUser[];
    const selfId = String(myTeam.data?.self_id || personId(session?.user) || "");
    const byId = new Map(list.map((user) => [String(user._id), user]));
    const children = new Map<string, DirectoryUser[]>();
    const mapped = new Set<string>();
    for (const edge of (myTeam.data?.edges || []) as Array<{ subordinate?: unknown; manager?: unknown }>) {
      const childId = refId(edge.subordinate);
      const parentId = refId(edge.manager);
      const child = byId.get(childId);
      if (!child || !parentId) continue;
      mapped.add(childId);
      const bucket = children.get(parentId) || [];
      bucket.push(child);
      children.set(parentId, bucket);
    }
    const self = byId.get(selfId) || {
      _id: selfId,
      name: session?.user?.name || "You",
      email: session?.user?.email,
      wp_role: "manager",
    };
    const roots = selfId ? [self] : list.filter((user) => !mapped.has(String(user._id)));
    const unmapped = list.filter((user) => String(user._id) !== selfId && !mapped.has(String(user._id)));
    return { people: list, children, roots, unmapped, selfId };
  }, [adminList, tree.data, users.data, myTeam.data, session?.user, stats]);

  const needle = query.trim().toLowerCase();
  function matches(user: DirectoryUser) {
    if (!needle) return true;
    const dept = departmentName(user.department);
    return `${user.name || ""} ${user.email || ""} ${dept} ${user.wp_role || ""}`.toLowerCase().includes(needle);
  }

  function branchVisible(user: DirectoryUser): boolean {
    if (matches(user)) return true;
    return (model.children.get(String(user._id)) || []).some(branchVisible);
  }

  const visibleRoots = model.roots.filter(branchVisible);
  const visibleUnmapped = model.unmapped.filter(matches);
  const mappedCount = model.people.filter((user) => String(user._id) !== model.selfId && !model.unmapped.some((item) => String(item._id) === String(user._id))).length;
  const loading = (adminList ? users.isLoading || tree.isLoading : myTeam.isLoading) || plans.isLoading || expenses.isLoading;

  function toggle(id: string) {
    setOpenIds((current) => ({ ...current, [id]: current[id] === false }));
  }

  function Node({ user, depth }: { user: DirectoryUser; depth: number }) {
    const id = String(user._id);
    const kids = (model.children.get(id) || []).filter(branchVisible);
    const open = openIds[id] !== false;
    const row = stats.get(id) || stats.get(String(user.email || "").toLowerCase());
    const dept = departmentName(user.department);
    const role = user.wp_role || roleLabel(user as AuthUser);
    const isSelf = id === model.selfId;
    const hasReports = (model.children.get(id) || []).length > 0;
    const badge = isSelf ? "You" : user.reports_to ? "Mapped" : hasReports ? "Lead" : "Mapped";
    return (
      <View style={{ marginLeft: depth ? 16 : 0, borderLeftWidth: depth ? 2 : 0, borderLeftColor: colors.border, paddingLeft: depth ? 10 : 0, gap: 8 }}>
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, backgroundColor: colors.card, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft }}>
              <Text style={{ color: colors.primary, fontWeight: "800" }}>{initials(user.name || user.email)}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: "800" }}>{user.name || user.email || "User"}{isSelf ? " · You" : ""}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{user.email}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{[dept, role].filter(Boolean).join(" · ")}</Text>
            </View>
            <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#dcfce7" }}>
              <Text style={{ color: "#166534", fontSize: 11, fontWeight: "800" }}>{badge}</Text>
            </View>
          </View>
          <Text style={{ color: colors.text, fontSize: 12 }}>
            {row?.plans || 0} plans{row?.pendingPlans ? ` · ${row.pendingPlans} pending` : ""}{row?.today ? " · today" : ""}
            {"  ·  "}
            {money(row?.expenseTotal || 0)} · {row?.expenses || 0} claims
          </Text>
          <SplitActions>
            {kids.length ? (
              <Button label={open ? "Hide reports" : `Reports (${kids.length})`} variant="ghost" onPress={() => toggle(id)} />
            ) : null}
            <Button label="Plans" variant="ghost" onPress={() => router.push("/(tabs)/plans")} />
            <Button label="Settings" onPress={() => router.push(`/team/${id}`)} />
          </SplitActions>
        </View>
        {open ? kids.map((child) => <Node key={String(child._id)} user={child} depth={depth + 1} />) : null}
      </View>
    );
  }

  return (
    <Screen header>
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>{adminList ? "Organization" : "Your team"}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {adminList
            ? "Reporting tree for the work planner. Mapped people sit under their manager. Everyone else is listed as not mapped."
            : "You at the top, then the people who report to you. Anyone without a reporting line is marked not mapped."}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {[
          ["Mapped", mappedCount, colors.success],
          ["Not mapped", model.unmapped.length, colors.danger],
        ].map(([label, value, tone]) => (
          <View key={String(label)} style={{ flex: 1, borderRadius: 16, padding: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 4 }}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
            <Text style={{ color: tone as string, fontSize: 24, fontWeight: "800" }}>{value}</Text>
          </View>
        ))}
      </View>
      <Field label="Search" value={query} onChangeText={setQuery} placeholder="Name, email, or department" />
      {loading ? <Loading /> : null}
      {!loading && visibleRoots.length === 0 && visibleUnmapped.length === 0 ? <Empty label="No people match this search" /> : null}
      {visibleRoots.length ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="git-network-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.text, fontWeight: "800" }}>Reporting tree</Text>
          </View>
          {visibleRoots.map((user) => (
            <Node key={String(user._id)} user={user} depth={0} />
          ))}
        </View>
      ) : null}
      {visibleUnmapped.length ? (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={{ color: colors.text, fontWeight: "800" }}>Not mapped</Text>
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>These people do not report to anyone in this tree.</Text>
          {visibleUnmapped.map((user) => {
            const id = String(user._id);
            const dept = departmentName(user.department);
            const role = user.wp_role || roleLabel(user as AuthUser);
            return (
              <Pressable key={id} onPress={() => router.push(`/team/${id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#fee2e2" }}>
                  <Text style={{ color: "#991b1b", fontWeight: "800" }}>{initials(user.name || user.email)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{user.name || user.email}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{[user.email, dept, role].filter(Boolean).join(" · ")}</Text>
                </View>
                <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "800" }}>Not mapped</Text>
              </Pressable>
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}
