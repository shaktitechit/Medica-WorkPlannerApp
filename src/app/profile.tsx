import { router } from "expo-router";
import { useState } from "react";
import { Alert, Text } from "react-native";
import { Button, Card, Field, Loading, Screen, Section } from "@/components/ui";
import { apiErrorMessage } from "@/lib/apiError";
import { useSession } from "@/lib/session";
import { useChangePasswordMutation, useGetMeQuery } from "@/store/api/authApiSlice";
import { useGetUserSettingsQuery } from "@/store/api/workPlannerApiSlice";
import { roleLabel, isWpAdmin, isWpManager, isWpElevated } from "@/utils/roles";
import { useThemeColors } from "@/theme";

export default function ProfileScreen() {
  const colors = useThemeColors();
  const { session, signOut } = useSession();
  const me = useGetMeQuery();
  const user = me.data?.user || session?.user;
  const admin = isWpAdmin(user);
  const manager = isWpManager(user);
  const elevated = isWpElevated(user);
  const settings = useGetUserSettingsQuery(user?._id || "", { skip: !user?._id });
  const [changePassword, passwordState] = useChangePasswordMutation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function onPassword() {
    try {
      await changePassword({ currentPassword, newPassword }).unwrap();
      setCurrentPassword("");
      setNewPassword("");
      Alert.alert("Password updated");
    } catch (err) {
      Alert.alert("Password change failed", apiErrorMessage(err, "Could not change password"));
    }
  }

  return (
    <Screen header>
      {me.isLoading ? <Loading /> : null}
      <Card>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{user?.name}</Text>
        <Text style={{ color: colors.muted }}>{user?.email}</Text>
        <Text style={{ color: colors.muted }}>{user?.department} · {roleLabel(user)}</Text>
        <Text style={{ color: colors.muted }}>
          Roles: {(user?.portals || []).map((portal) => `${portal.portal_code}: ${portal.access_roles.join(", ")}`).join(" · ") || "—"}
        </Text>
      </Card>
      {elevated || admin ? (
        <>
          <Section>Workspace</Section>
          {elevated && !admin ? <Button label="My team" variant="ghost" onPress={() => router.push("/team")} /> : null}
          {admin ? <Button label="Assigned teams" variant="ghost" onPress={() => router.push("/assigned-teams")} /> : null}
          {admin ? <Button label="Team hierarchy" variant="ghost" onPress={() => router.push("/team-manager")} /> : null}
        </>
      ) : null}
      <Section>Work planner settings</Section>
      {settings.isLoading ? <Loading label="Loading settings…" /> : null}
      {settings.data ? (
        <Card>
          <Text style={{ color: colors.muted }}>
            Manager: {settings.data.assignedManagerName || settings.data.assignedManagerEmail || "Not set"}
          </Text>
          <Text style={{ color: colors.muted }}>
            CC: {(settings.data.ccEmails || []).join(", ") || "None"}
          </Text>
        </Card>
      ) : null}
      <Field label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
      <Field label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
      <Button label={passwordState.isLoading ? "Saving…" : "Change password"} disabled={passwordState.isLoading} onPress={() => void onPassword()} />
      <Button
        label="Sign out"
        variant="danger"
        onPress={() => {
          void signOut().then(() => router.replace("/login"));
        }}
      />
    </Screen>
  );
}
