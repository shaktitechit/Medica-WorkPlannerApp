import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "@/lib/session";
import { useThemeColors } from "@/theme";

export default function Index() {
  const colors = useThemeColors();
  const { ready, session } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!session) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)" />;
}
