import { Redirect } from "expo-router";
import { useMemo, useState, useCallback } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PersonSelect } from "@/components/PersonSelect";
import { Button, Empty, Field, Loading, Screen, Segmented } from "@/components/ui";
import { apiErrorMessage } from "@/lib/apiError";
import { useSession } from "@/lib/session";
import {
  useGetTeamTreeQuery,
  useRemoveTeamEdgeMutation,
  useUpsertTeamEdgeMutation,
} from "@/store/api/workPlannerApiSlice";
import { isWpAdmin } from "@/utils/roles";
import { useThemeColors } from "@/theme";

type TreeUser = {
  _id: string;
  name?: string;
  email?: string;
  department?: string | { name?: string };
  wp_role?: "admin" | "manager" | "coordinator" | "executive" | string;
  reports_to?: string | null;
  report_ids?: string[];
};

type Edge = {
  subordinate?: { _id?: string; name?: string } | string;
  manager?: { _id?: string; name?: string } | string;
  subordinate_role?: string;
  manager_role?: string;
};

function personId(value: Edge["subordinate"]) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value._id || "");
}

function initials(name?: string) {
  const parts = String(name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "?";
}

const ROLE_COLORS: Record<string, { bg: string; text: string; label: string; tone: string }> = {
  admin: { bg: "#f3e8ff", text: "#9333ea", label: "Admin", tone: "#9333ea" },
  manager: { bg: "#dcfce7", text: "#16a34a", label: "Manager", tone: "#16a34a" },
  coordinator: { bg: "#e0e7ff", text: "#4f46e5", label: "Coordinator", tone: "#4f46e5" },
  executive: { bg: "#e0f2fe", text: "#0284c7", label: "Executive", tone: "#0284c7" },
};

export default function TeamManagerScreen() {
  const colors = useThemeColors();
  const { session } = useSession();
  const allowed = isWpAdmin(session?.user);

  const tree = useGetTeamTreeQuery(undefined, { skip: !allowed });
  const [upsert, upsertState] = useUpsertTeamEdgeMutation();
  const [removeEdge, removeState] = useRemoveTeamEdgeMutation();

  // Active View Tab
  const [tab, setTab] = useState<"tree" | "list" | "assign">("tree");
  const [subordinate, setSubordinate] = useState("");
  const [manager, setManager] = useState("");
  const [query, setQuery] = useState("");
  const [unassignedFilter, setUnassignedFilter] = useState<"all" | "manager" | "coordinator" | "executive">("all");

  // Reassign Modal State
  const [reassignTargetUser, setReassignTargetUser] = useState<TreeUser | null>(null);
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

  const users = (tree.data?.users || []) as TreeUser[];
  const byId = useMemo(() => new Map(users.map((user) => [String(user._id), user])), [users]);

  const admins = (tree.data?.admins || []) as TreeUser[];
  const managers = (tree.data?.managers || []) as TreeUser[];
  const coordinators = (tree.data?.coordinators || []) as TreeUser[];
  const executives = (tree.data?.executives || []) as TreeUser[];

  const unassignedManagers = (tree.data?.unassignedManagers || []) as TreeUser[];
  const unassignedCoordinators = (tree.data?.unassignedCoordinators || []) as TreeUser[];
  const unassignedExecutives = (tree.data?.unassignedExecutives || []) as TreeUser[];

  const allUnassigned = useMemo(() => {
    const list = [...unassignedManagers, ...unassignedCoordinators, ...unassignedExecutives];
    if (unassignedFilter === "all") return list;
    return list.filter((u) => u.wp_role === unassignedFilter);
  }, [unassignedManagers, unassignedCoordinators, unassignedExecutives, unassignedFilter]);

  // Form options
  const subordinates = useMemo(
    () => users.filter((u) => u.wp_role === "executive" || u.wp_role === "coordinator" || u.wp_role === "manager"),
    [users]
  );
  const selected = byId.get(subordinate);

  const managerChoices = useMemo(() => {
    if (!selected) return [...coordinators, ...managers, ...admins];
    if (selected.wp_role === "executive") return [...coordinators, ...managers];
    if (selected.wp_role === "coordinator") return [...managers, ...admins];
    if (selected.wp_role === "manager") return admins;
    return [];
  }, [selected, coordinators, managers, admins]);

  // Eligible managers for the Reassign Modal
  const eligibleManagersForModal = useMemo(() => {
    if (!reassignTargetUser) return [];
    const role = reassignTargetUser.wp_role;

    let pool: TreeUser[] = [];
    if (role === "executive") pool = [...coordinators, ...managers];
    else if (role === "coordinator") pool = [...managers, ...admins];
    else if (role === "manager") pool = admins;

    // Filter out self and circular reporting
    return pool.filter((cand) => {
      if (cand._id === reassignTargetUser._id) return false;
      // Cycle check
      let currentId: string | null = cand.reports_to || null;
      let depth = 0;
      while (currentId && depth < 20) {
        if (currentId === reassignTargetUser._id) return false;
        const parent = byId.get(currentId);
        currentId = parent?.reports_to || null;
        depth++;
      }
      return true;
    });
  }, [reassignTargetUser, coordinators, managers, admins, byId]);

  const edges = useMemo(() => {
    return ((tree.data?.edges || []) as Edge[]).map((edge) => {
      const subId = personId(edge.subordinate);
      const mgrId = personId(edge.manager);
      const sub = byId.get(subId);
      const mgr = byId.get(mgrId);
      return {
        subId,
        subName: sub?.name || (typeof edge.subordinate === "object" ? edge.subordinate?.name : "") || subId,
        subRole: edge.subordinate_role || sub?.wp_role || "executive",
        mgrName: mgr?.name || (typeof edge.manager === "object" ? edge.manager?.name : "") || "Manager",
        mgrRole: edge.manager_role || mgr?.wp_role || "manager",
      };
    });
  }, [tree.data?.edges, byId]);

  const needle = query.trim().toLowerCase();
  const visibleEdges = needle
    ? edges.filter((edge) => `${edge.subName} ${edge.mgrName} ${edge.subRole} ${edge.mgrRole}`.toLowerCase().includes(needle))
    : edges;

  const getDirectReports = useCallback(
    (parentId: string) => {
      return users.filter((u) => u.reports_to === parentId);
    },
    [users]
  );

  const toggleCollapse = (id: string) => {
    setCollapsedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  async function onSave() {
    try {
      await upsert({ subordinate, manager }).unwrap();
      setSubordinate("");
      setManager("");
      Alert.alert("Success", "Reporting relationship saved.");
    } catch (err) {
      Alert.alert(
        "Could not save",
        apiErrorMessage(err, "Executives report to coordinators/managers. Coordinators report to managers/admins. Managers report to admins.")
      );
    }
  }

  async function onAssignViaModal(targetMgrId: string) {
    if (!reassignTargetUser) return;
    try {
      await upsert({ subordinate: reassignTargetUser._id, manager: targetMgrId }).unwrap();
      setReassignTargetUser(null);
      Alert.alert("Success", `${reassignTargetUser.name} now reports to ${byId.get(targetMgrId)?.name || "manager"}.`);
    } catch (err) {
      Alert.alert("Could not assign", apiErrorMessage(err, "Failed to save reporting line"));
    }
  }

  function onRemove(id: string, name: string) {
    Alert.alert("Remove mapping", `Remove the reporting line for ${name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void removeEdge(id)
            .unwrap()
            .then(() => Alert.alert("Removed", `Reporting line removed for ${name}`))
            .catch((err) => Alert.alert("Remove failed", apiErrorMessage(err, "Could not remove")));
        },
      },
    ]);
  }

  if (!allowed) return <Redirect href="/(tabs)" />;

  return (
    <Screen header>
      {/* Title & Hierarchy subtitle */}
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>Team Manager</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Hierarchy: Admin → Manager → Coordinator → Executive
        </Text>
      </View>

      {/* Summary KPI Cards */}
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View style={{ flex: 1, borderRadius: 14, padding: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }}>Mapped</Text>
          <Text style={{ color: colors.success, fontSize: 18, fontWeight: "800" }}>{edges.length}</Text>
        </View>
        <View style={{ flex: 1, borderRadius: 14, padding: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }}>Mgrs Open</Text>
          <Text style={{ color: colors.warning, fontSize: 18, fontWeight: "800" }}>{unassignedManagers.length}</Text>
        </View>
        <View style={{ flex: 1, borderRadius: 14, padding: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }}>Coords Open</Text>
          <Text style={{ color: "#6366f1", fontSize: 18, fontWeight: "800" }}>{unassignedCoordinators.length}</Text>
        </View>
        <View style={{ flex: 1, borderRadius: 14, padding: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }}>Execs Open</Text>
          <Text style={{ color: colors.danger, fontSize: 18, fontWeight: "800" }}>{unassignedExecutives.length}</Text>
        </View>
      </View>

      {/* View Segment Switcher */}
      <Segmented
        options={[
          { id: "tree", label: "Hierarchy Tree" },
          { id: "list", label: `Mappings (${edges.length})` },
          { id: "assign", label: "Assign Form" },
        ]}
        value={tab}
        onChange={(v) => setTab(v as any)}
      />

      {tree.isLoading ? <Loading label="Loading team hierarchy…" /> : null}

      {/* TAB 1: HIERARCHY TREE */}
      {tab === "tree" && (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>Organization Chart</Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>Tap node to reassign</Text>
          </View>

          {admins.length === 0 && !tree.isLoading ? (
            <Empty label="No admin root nodes configured" />
          ) : (
            admins.map((admin) => (
              <MobileTreeNode
                key={admin._id}
                user={admin}
                getDirectReports={getDirectReports}
                collapsedNodes={collapsedNodes}
                onToggleCollapse={toggleCollapse}
                onPressNode={(u) => setReassignTargetUser(u)}
                colors={colors}
                level={0}
              />
            ))
          )}

          {/* Unassigned Pool Section */}
          <View style={{ marginTop: 8, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>
                Unassigned Pool ({allUnassigned.length})
              </Text>
            </View>

            {/* Role Filter Bar */}
            <View style={{ flexDirection: "row", gap: 6 }}>
              {[
                { id: "all", label: "All" },
                { id: "manager", label: "Managers" },
                { id: "coordinator", label: "Coordinators" },
                { id: "executive", label: "Executives" },
              ].map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => setUnassignedFilter(f.id as any)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 12,
                    backgroundColor: unassignedFilter === f.id ? colors.primary : colors.card,
                    borderWidth: 1,
                    borderColor: unassignedFilter === f.id ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ color: unassignedFilter === f.id ? "#fff" : colors.muted, fontSize: 11, fontWeight: "700" }}>
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {allUnassigned.length === 0 ? (
              <View style={{ padding: 16, borderRadius: 16, backgroundColor: colors.card, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="checkmark-circle-outline" size={24} color={colors.success} />
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>No unassigned members in this category.</Text>
              </View>
            ) : (
              allUnassigned.map((user) => {
                const roleInfo = ROLE_COLORS[user.wp_role || "executive"] || ROLE_COLORS.executive;
                return (
                  <Pressable
                    key={String(user._id)}
                    onPress={() => setReassignTargetUser(user)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 16,
                      padding: 12,
                      backgroundColor: colors.card,
                    }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: roleInfo.bg }}>
                      <Text style={{ color: roleInfo.text, fontWeight: "800", fontSize: 12 }}>{initials(user.name || user.email)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>
                          {user.name || user.email}
                        </Text>
                        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: roleInfo.bg }}>
                          <Text style={{ color: roleInfo.text, fontSize: 9, fontWeight: "800" }}>{roleInfo.label}</Text>
                        </View>
                      </View>
                      <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{user.email}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>Assign</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      )}

      {/* TAB 2: MAPPINGS LIST */}
      {tab === "list" && (
        <View style={{ gap: 10 }}>
          <Field label="Search mappings" value={query} onChangeText={setQuery} placeholder="Filter by name or role" />
          {!tree.isLoading && visibleEdges.length === 0 ? <Empty label="No reporting lines matched" /> : null}
          {visibleEdges.map((edge) => {
            const subRole = ROLE_COLORS[edge.subRole] || ROLE_COLORS.executive;
            const mgrRole = ROLE_COLORS[edge.mgrRole] || ROLE_COLORS.manager;

            return (
              <View
                key={edge.subId}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 16,
                  padding: 12,
                  backgroundColor: colors.card,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: subRole.bg }}>
                  <Text style={{ color: subRole.text, fontWeight: "800", fontSize: 12 }}>{initials(edge.subName)}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>
                      {edge.subName}
                    </Text>
                    <Text style={{ color: subRole.text, fontSize: 10, fontWeight: "700" }}>({subRole.label})</Text>
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>
                    → {edge.mgrName} <Text style={{ color: mgrRole.text }}>({mgrRole.label})</Text>
                  </Text>
                </View>
                <Pressable onPress={() => onRemove(edge.subId, edge.subName)} disabled={removeState.isLoading} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {/* TAB 3: ASSIGN FORM */}
      {tab === "assign" && (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, gap: 12, backgroundColor: colors.card }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>Assign reporting line</Text>
          <PersonSelect
            label="Person (Report)"
            people={subordinates.map((user) => ({
              _id: user._id,
              name: `${user.name || user.email || "User"}${user.reports_to ? " · mapped" : ""}`,
              email: `${user.wp_role || "member"}${user.email ? ` · ${user.email}` : ""}`,
            }))}
            value={subordinate}
            onChange={(id) => {
              setSubordinate(id);
              setManager("");
            }}
            placeholder="Select executive, coordinator or manager"
          />
          <PersonSelect
            label={
              selected?.wp_role === "manager"
                ? "Reports to an Admin"
                : selected?.wp_role === "coordinator"
                ? "Reports to a Manager or Admin"
                : "Reports to a Coordinator or Manager"
            }
            people={managerChoices.map((user) => ({
              _id: user._id,
              name: user.name || user.email || "User",
              email: `${user.wp_role || ""}${user.email ? ` · ${user.email}` : ""}`,
            }))}
            value={manager}
            onChange={setManager}
            placeholder={subordinate ? "Select who they report to" : "Choose a person first"}
          />
          <Button
            label={upsertState.isLoading ? "Saving…" : "Save mapping"}
            disabled={!subordinate || !manager || upsertState.isLoading}
            onPress={() => void onSave()}
          />
        </View>
      )}

      {/* Reassign / Quick Assign Bottom Modal */}
      <Modal visible={Boolean(reassignTargetUser)} transparent animationType="fade" onRequestClose={() => setReassignTargetUser(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "80%", gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>
                  Assign / Move Manager
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                  {reassignTargetUser?.name} ({reassignTargetUser?.wp_role})
                </Text>
              </View>
              <Pressable onPress={() => setReassignTargetUser(null)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Select an eligible supervisor based on hierarchy:
            </Text>

            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
              {eligibleManagersForModal.length === 0 ? (
                <Text style={{ color: colors.muted, textAlign: "center", paddingVertical: 20 }}>
                  No eligible supervisors available for this role.
                </Text>
              ) : (
                eligibleManagersForModal.map((cand) => {
                  const roleStyle = ROLE_COLORS[cand.wp_role || "manager"] || ROLE_COLORS.manager;
                  const isCurrent = reassignTargetUser?.reports_to === cand._id;

                  return (
                    <Pressable
                      key={cand._id}
                      onPress={() => onAssignViaModal(cand._id)}
                      disabled={upsertState.isLoading || isCurrent}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: 12,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: isCurrent ? colors.primary : colors.border,
                        backgroundColor: isCurrent ? `${colors.primary}10` : colors.bg,
                      }}
                    >
                      <View style={{ gap: 2, flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }}>{cand.name}</Text>
                          <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: roleStyle.bg }}>
                            <Text style={{ color: roleStyle.text, fontSize: 9, fontWeight: "800" }}>{roleStyle.label}</Text>
                          </View>
                        </View>
                        <Text style={{ color: colors.muted, fontSize: 11 }}>{cand.email}</Text>
                      </View>

                      {isCurrent ? (
                        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800" }}>Current</Text>
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            {reassignTargetUser?.reports_to && (
              <Button
                label="Unassign from Manager"
                variant="danger"
                onPress={() => {
                  if (reassignTargetUser) {
                    const u = reassignTargetUser;
                    setReassignTargetUser(null);
                    onRemove(u._id, u.name || "User");
                  }
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

// Mobile recursive tree node component
function MobileTreeNode({
  user,
  getDirectReports,
  collapsedNodes,
  onToggleCollapse,
  onPressNode,
  colors,
  level = 0,
}: {
  user: TreeUser;
  getDirectReports: (id: string) => TreeUser[];
  collapsedNodes: Record<string, boolean>;
  onToggleCollapse: (id: string) => void;
  onPressNode: (u: TreeUser) => void;
  colors: any;
  level?: number;
}) {
  const reports = getDirectReports(user._id);
  const isCollapsed = Boolean(collapsedNodes[user._id]);
  const hasReports = reports.length > 0;
  const roleStyle = ROLE_COLORS[user.wp_role || "executive"] || ROLE_COLORS.executive;

  return (
    <View style={{ marginLeft: level > 0 ? 12 : 0, paddingLeft: level > 0 ? 10 : 0, borderLeftWidth: level > 0 ? 2 : 0, borderLeftColor: `${colors.border}` }}>
      <Pressable
        onPress={() => onPressNode(user)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          {hasReports ? (
            <Pressable onPress={() => onToggleCollapse(user._id)} hitSlop={10} style={{ padding: 2 }}>
              <Ionicons name={isCollapsed ? "chevron-forward" : "chevron-down"} size={16} color={colors.text} />
            </Pressable>
          ) : (
            <View style={{ width: 16, alignItems: "center" }}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.muted }} />
            </View>
          )}

          <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: roleStyle.bg }}>
            <Text style={{ color: roleStyle.text, fontWeight: "800", fontSize: 10 }}>{initials(user.name || user.email)}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
                {user.name || user.email}
              </Text>
              <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: roleStyle.bg }}>
                <Text style={{ color: roleStyle.text, fontSize: 8, fontWeight: "800" }}>{roleStyle.label}</Text>
              </View>
              {hasReports && (
                <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.bg }}>
                  <Text style={{ color: colors.muted, fontSize: 8, fontWeight: "800" }}>
                    {reports.length} {reports.length === 1 ? "report" : "reports"}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ color: colors.muted, fontSize: 10 }} numberOfLines={1}>{user.email}</Text>
          </View>
        </View>

        <Ionicons name="ellipsis-vertical" size={14} color={colors.muted} />
      </Pressable>

      {/* Child branch */}
      {hasReports && !isCollapsed && (
        <View style={{ marginTop: 6, gap: 6 }}>
          {reports.map((child) => (
            <MobileTreeNode
              key={child._id}
              user={child}
              getDirectReports={getDirectReports}
              collapsedNodes={collapsedNodes}
              onToggleCollapse={onToggleCollapse}
              onPressNode={onPressNode}
              colors={colors}
              level={level + 1}
            />
          ))}
        </View>
      )}
    </View>
  );
}
