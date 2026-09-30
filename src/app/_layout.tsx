import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Provider } from "react-redux";
import { useChildStackOptions } from "@/components/chrome";
import { PlanPushBridge } from "@/components/PlanPushBridge";
import { SessionProvider, useSession } from "@/lib/session";
import { store } from "@/store/store";
import { ThemeProvider, useThemeColors } from "@/theme";

function AuthGate({ children }: { children: ReactNode }) {
  const { ready, session } = useSession();
  const segments = useSegments();
  const root = segments[0];
  const colors = useThemeColors();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const onLogin = root === "login";
    if (!session && !onLogin) router.replace("/login");
    if (session && onLogin) router.replace("/(tabs)");
  }, [ready, session, root, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return children;
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <ThemeProvider>
      <SessionProvider>
        <ThemedShell />
      </SessionProvider>
      </ThemeProvider>
    </Provider>
  );
}

function ThemedShell() {
  const screenOptions = useChildStackOptions();
  return (
    <>
        <StatusBar style="dark" />
        <PlanPushBridge />
        <AuthGate>
        <Stack screenOptions={screenOptions}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="plan" options={{ headerShown: false }} />
          <Stack.Screen name="profile" options={{ title: "Profile" }} />
          <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
          <Stack.Screen name="team" options={{ headerShown: false }} />
          <Stack.Screen name="assigned-teams" options={{ title: "Team hierarchy" }} />
          <Stack.Screen name="team-manager" options={{ title: "Team manager" }} />
          <Stack.Screen name="project" options={{ headerShown: false }} />
        </Stack>
        </AuthGate>
    </>
  );
}
