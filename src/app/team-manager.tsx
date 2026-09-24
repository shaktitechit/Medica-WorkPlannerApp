import { Redirect } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PersonSelect } from "@/components/PersonSelect";
import { Button, Empty, Field, Loading, Screen } from "@/components/ui";
import { apiErrorMessage } from "@/lib/apiError";
import { useSession } from "@/lib/session";
import { useGetTeamTreeQuery, useRemoveTeamEdgeMutation, useUpsertTeamEdgeMutation } from "@/store/api/workPlannerApiSlice";
import { isWpAdmin } from "@/utils/roles";
import { useThemeColors } from "@/theme";

type TreeUser = {
  _id: string;
  name?: string;
  email?: string;
  wp_role?: string;
  reports_to?: string | null;
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

export default function TeamManagerScreen() {
  const colors = useThemeColors();
  const { session } = useSession();
  const allowed = isWpAdmin(session?.user);
  const tree = useGetTeamTreeQuery(undefined, { skip: !allowed });
  const [upsert, upsertState] = useUpsertTeamEdgeMutation();
  const [removeEdge, removeState] = useRemoveTeamEdgeMutation();
  const [subordinate, setSubordinate] = useState("");
  const [manager, setManager] = useState("");
  const [query, setQuery] = useState("");

  const users = (tree.data?.users || []) as TreeUser[];
  const byId = useMemo(() => new Map(users.map((user) => [String(user._id), user])), [users]);
  const subordinates = users.filter((user) => user.wp_role === "executive" || user.wp_role === "manager");
  const selected = byId.get(subordinate);
  const managerChoices = users.filter((user) => {
    if (!selected) return user.wp_role === "manager" || user.wp_role === "admin";
    if (selected.wp_role === "executive") return user.wp_role === "manager";
    if (selected.wp_role === "manager") return user.wp_role === "admin";
    return false;
  });

  const edges = ((tree.data?.edges || []) as Edge[]).map((edge) => {
    const subId = personId(edge.subordinate);
    const mgrId = personId(edge.manager);
    const sub = byId.get(subId);
    const mgr = byId.get(mgrId);
    return {
      subId,
      subName: sub?.name || (typeof edge.subordinate === "object" ? edge.subordinate?.name : "") || subId,
      subRole: edge.subordinate_role || sub?.wp_role || "",
      mgrName: mgr?.name || (typeof edge.manager === "object" ? edge.manager?.name : "") || "Manager",
      mgrRole: edge.manager_role || mgr?.wp_role || "",
    };
  });
  const needle = query.trim().toLowerCase();
  const visibleEdges = needle
    ? edges.filter((edge) => `${edge.subName} ${edge.mgrName} ${edge.subRole} ${edge.mgrRole}`.toLowerCase().includes(needle))
    : edges;
  const unassignedManagers = (tree.data?.unassignedManagers || []) as TreeUser[];
  const unassignedExecutives = (tree.data?.unassignedExecutives || []) as TreeUser[];

  async function onSave() {
    try {
      await upsert({ subordinate, manager }).unwrap();
      setSubordinate("");
      setManager("");
      Alert.alert("Reporting line saved");
    } catch (err) {
      Alert.alert("Could not save", apiErrorMessage(err, "Executives report to managers. Managers report to admins."));
    }
  }

  function onRemove(id: string, name: string) {
    Alert.alert("Remove mapping", `Remove the reporting line for ${name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void removeEdge(id).unwrap().catch((err) => Alert.alert("Remove failed", apiErrorMessage(err, "Could not remove")));
        },
      },
    ]);
  }

  if (!allowed) return <Redirect href="/(tabs)" />;

  return (
    <Screen header>
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>Team manager</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Executives report to a manager. Managers report to an admin.
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {[
          ["Mapped", edges.length, colors.success],
          ["Managers open", unassignedManagers.length, colors.warning],
          ["Executives open", unassignedExecutives.length, colors.danger],
        ].map(([label, value, tone]) => (
          <View key={String(label)} style={{ flex: 1, borderRadius: 16, padding: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 2 }}>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
            <Text style={{ color: tone as string, fontSize: 22, fontWeight: "800" }}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, gap: 12, backgroundColor: colors.card }}>
        <Text style={{ color: colors.text, fontWeight: "800" }}>Assign reporting line</Text>
        <PersonSelect
          label="Person"
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
          placeholder="Select executive or manager"
        />
        <PersonSelect
          label={selected?.wp_role === "manager" ? "Reports to an admin" : "Reports to a manager"}
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

      {tree.isLoading ? <Loading /> : null}
      <Field label="Search mappings" value={query} onChangeText={setQuery} placeholder="Name or role" />
      {!tree.isLoading && visibleEdges.length === 0 ? <Empty label="No reporting lines yet" /> : null}
      {visibleEdges.map((edge) => (
        <View key={edge.subId} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, backgroundColor: colors.card }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft }}>
            <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 12 }}>{initials(edge.subName)}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>{edge.subName}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
              {edge.subRole} → {edge.mgrName}{edge.mgrRole ? ` · ${edge.mgrRole}` : ""}
            </Text>
          </View>
          <Pressable onPress={() => onRemove(edge.subId, edge.subName)} disabled={removeState.isLoading} hitSlop={8}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      ))}

      <Text style={{ color: colors.text, fontWeight: "800" }}>Not mapped</Text>
      {unassignedManagers.length + unassignedExecutives.length === 0 ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>Everyone has a reporting line.</Text>
      ) : null}
      {[...unassignedManagers.map((user) => ({ ...user, kind: "Manager" })), ...unassignedExecutives.map((user) => ({ ...user, kind: "Executive" }))].map((user) => (
        <Pressable
          key={String(user._id)}
          onPress={() => {
            setSubordinate(String(user._id));
            setManager("");
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, backgroundColor: colors.card }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#fee2e2" }}>
            <Text style={{ color: colors.danger, fontWeight: "800", fontSize: 12 }}>{initials(user.name || user.email)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>{user.name || user.email}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{user.kind} · tap to assign</Text>
          </View>
          <Text style={{ color: colors.danger, fontSize: 10, fontWeight: "800" }}>Not mapped</Text>
        </Pressable>
      ))}
    </Screen>
  );
}
