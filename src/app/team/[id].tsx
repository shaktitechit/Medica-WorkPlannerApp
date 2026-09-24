import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Text } from "react-native";
import { PersonSelect } from "@/components/PersonSelect";
import { Button, Card, Chip, Empty, Field, FilterBar, Loading, Screen } from "@/components/ui";
import { apiErrorMessage } from "@/lib/apiError";
import { useSession } from "@/lib/session";
import {
  useGetEligibleManagersQuery,
  useGetMyTeamQuery,
  useGetUserSettingsQuery,
  useUpdateUserSettingsMutation,
} from "@/store/api/workPlannerApiSlice";
import { isWpAdmin, isWpManager } from "@/utils/roles";
import { useThemeColors } from "@/theme";

const PLAN_TYPES = ["Visits", "Tasks & Visits", "Leave", "Work From Home", "Work From Office"];

type Template = { id: string; title: string; description?: string };

export default function UserSettingsScreen() {
  const colors = useThemeColors();
  const { session } = useSession();
  const admin = isWpAdmin(session?.user);
  const manager = isWpManager(session?.user);
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id || "");
  const team = useGetMyTeamQuery(undefined, { skip: !manager });
  const onTeam = ((team.data?.members || []) as Array<{ _id?: string; id?: string }>).some(
    (member) => String(member._id || member.id || "") === userId,
  );
  const canEdit = admin || (manager && onTeam);
  const settings = useGetUserSettingsQuery(userId, { skip: !userId || !canEdit });
  const managers = useGetEligibleManagersQuery();
  const [save, saveState] = useUpdateUserSettingsMutation();
  const [managerId, setManagerId] = useState("");
  const [ccInput, setCcInput] = useState("");
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!settings.data || ready) return;
    setManagerId(settings.data.assignedManagerId || "");
    setCcEmails(settings.data.ccEmails || []);
    setTemplates(
      (settings.data.customWorkTemplates || []).map((item: Template, index: number) => ({
        id: item.id || `t-${index}`,
        title: item.title,
        description: item.description,
      })),
    );
    setReady(true);
  }, [settings.data, ready]);

  async function onSave() {
    const manager = (managers.data || []).find((item: { _id?: string; id?: string }) => String(item._id || item.id) === managerId);
    try {
      await save({
        userId,
        body: {
          assignedManagerId: managerId,
          assignedManagerName: manager?.name || "",
          assignedManagerEmail: manager?.email || "",
          ccEmails,
          planTypeSettings: Object.fromEntries(
            PLAN_TYPES.map((planType) => [
              planType,
              {
                plan_type: planType,
                assignedManagerId: managerId,
                ccEmails,
              },
            ]),
          ),
          customWorkTemplates: templates,
        },
      }).unwrap();
      Alert.alert("Settings saved");
    } catch (err) {
      Alert.alert("Save failed", apiErrorMessage(err, "Could not save settings"));
    }
  }

  if (!admin && !manager) return <Redirect href="/(tabs)" />;
  if (manager && team.isLoading) return <Screen header><Loading /></Screen>;
  if (!canEdit) return <Screen header><Empty label="You can only edit settings for your own team." /></Screen>;
  if (settings.isLoading) return <Screen header><Loading /></Screen>;

  const managerPeople = (managers.data || [])
    .map((item: { _id?: string; id?: string; name?: string; email?: string }) => ({
      _id: String(item._id || item.id || ""),
      name: item.name,
      email: item.email,
    }))
    .filter((item: { _id: string }) => item._id);

  return (
    <Screen header>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Assigned manager applies to every plan type. CC emails and custom tasks are used when this person creates a plan.
      </Text>
      <Card>
        <PersonSelect label="Assigned manager" people={managerPeople} value={managerId} onChange={setManagerId} />
        <Text style={{ color: colors.muted, fontSize: 12 }}>Reporting lines are also edited from Team manager.</Text>
      </Card>
      <Card>
        <Text style={{ color: colors.text, fontWeight: "800" }}>CC emails</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Copied on plan mail for every plan type.</Text>
        <Field label="Email" value={ccInput} onChangeText={setCcInput} autoCapitalize="none" keyboardType="email-address" />
        <Button
          label="Add CC"
          variant="ghost"
          onPress={() => {
            const email = ccInput.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
            setCcEmails((list) => (list.includes(email) ? list : [...list, email]));
            setCcInput("");
          }}
        />
        {ccEmails.length ? (
          <FilterBar>
            {ccEmails.map((email) => (
              <Chip key={email} label={email} active onPress={() => setCcEmails((list) => list.filter((item) => item !== email))} />
            ))}
          </FilterBar>
        ) : (
          <Text style={{ color: colors.muted, fontSize: 12 }}>No CC emails yet. Tap a chip to remove it.</Text>
        )}
      </Card>
      <Card>
        <Text style={{ color: colors.text, fontWeight: "800" }}>Custom task templates</Text>
        <Field label="Title" value={taskTitle} onChangeText={setTaskTitle} />
        <Field label="Description" value={taskDescription} onChangeText={setTaskDescription} multiline />
        <Button
          label="Add template"
          variant="ghost"
          onPress={() => {
            if (!taskTitle.trim()) return;
            setTemplates((list) => [
              ...list,
              { id: `t-${Date.now()}`, title: taskTitle.trim(), description: taskDescription.trim() || undefined },
            ]);
            setTaskTitle("");
            setTaskDescription("");
          }}
        />
        {templates.map((template) => (
          <Card key={template.id}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{template.title}</Text>
            {template.description ? <Text style={{ color: colors.muted }}>{template.description}</Text> : null}
            <Button label="Remove" variant="ghost" onPress={() => setTemplates((list) => list.filter((item) => item.id !== template.id))} />
          </Card>
        ))}
      </Card>
      <Button label={saveState.isLoading ? "Saving…" : "Save settings"} disabled={saveState.isLoading} onPress={() => void onSave()} />
    </Screen>
  );
}
