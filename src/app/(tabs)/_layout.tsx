import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { ColorValue } from "react-native";
import { useThemeColors } from "@/theme";

function tabIcon(name: keyof typeof Ionicons.glyphMap, focusedName: keyof typeof Ionicons.glyphMap) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} color={color} size={size} />
  );
}

export default function TabsLayout() {
  const colors = useThemeColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon("home-outline", "home") }} />
      <Tabs.Screen name="projects" options={{ title: "Projects", tabBarIcon: tabIcon("layers-outline", "layers") }} />
      <Tabs.Screen name="plans" options={{ title: "Plans", tabBarIcon: tabIcon("document-text-outline", "document-text") }} />
      <Tabs.Screen name="tasks" options={{ title: "Tasks", tabBarIcon: tabIcon("checkbox-outline", "checkbox") }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar", tabBarIcon: tabIcon("calendar-outline", "calendar") }} />
      <Tabs.Screen name="expenses" options={{ title: "Expenses", tabBarIcon: tabIcon("wallet-outline", "wallet") }} />
    </Tabs>
  );
}
