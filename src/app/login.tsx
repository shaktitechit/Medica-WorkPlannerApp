import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CompanyLogo } from "@/components/chrome";
import { Button, Field } from "@/components/ui";
import { apiErrorMessage } from "@/lib/apiError";
import { useSession } from "@/lib/session";
import { useGetCompanyInfoQuery } from "@/store/api/companyApiSlice";
import { useLoginMutation } from "@/store/api/authApiSlice";
import type { UserSession } from "@/types/workPlanner";
import { hasWorkPlannerPortalAccess } from "@/utils/roles";
import { useThemeColors } from "@/theme";

export default function LoginScreen() {
  const colors = useThemeColors();
  const { session, ready, signIn } = useSession();
  const { data: company } = useGetCompanyInfoQuery();
  const [login, { isLoading }] = useLoginMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      setAndroidKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setAndroidKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (ready && session) return <Redirect href="/(tabs)" />;

  async function onSubmit() {
    setError("");
    if (!email.trim() || !password) {
      setError("Please enter email and password");
      return;
    }
    try {
      const res = (await login({ email: email.trim(), password }).unwrap()) as UserSession;
      if (!hasWorkPlannerPortalAccess(res.user)) {
        setError("Access denied: you do not have Work Planner portal access.");
        return;
      }
      await signIn({ token: res.token, refreshToken: res.refreshToken, user: res.user });
      router.replace("/(tabs)");
    } catch (err) {
      setError(apiErrorMessage(err, "Login failed"));
    }
  }

  const companyName = company?.trade_name || company?.legal_name || "Work Planner";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          style={androidKeyboardHeight > 0 ? { marginBottom: androidKeyboardHeight } : undefined}
          contentContainerStyle={{
            flexGrow: 1,
            width: "100%",
            maxWidth: 720,
            alignSelf: "center",
            justifyContent: androidKeyboardHeight > 0 ? "flex-start" : "center",
            paddingHorizontal: 16,
            paddingTop: androidKeyboardHeight > 0 ? 12 : 8,
            paddingBottom: 28,
            gap: 12,
          }}
        >
          <View style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CompanyLogo size={72} />
            <Text style={{ color: colors.text, fontSize: 28, fontWeight: "800", textAlign: "center" }}>{companyName}</Text>
            <Text style={{ color: colors.muted, textAlign: "center" }}>Sign in to the work planner</Text>
          </View>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <Button label={isLoading ? "Signing in…" : "Sign in"} onPress={() => void onSubmit()} disabled={isLoading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
