import { Stack } from "expo-router";
import { useChildStackOptions } from "@/components/chrome";

export default function TeamLayout() {
  const screenOptions = useChildStackOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: "My Team" }} />
      <Stack.Screen name="[id]" options={{ title: "User settings" }} />
    </Stack>
  );
}
