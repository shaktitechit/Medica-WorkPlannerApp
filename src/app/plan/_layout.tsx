import { Stack } from "expo-router";
import { useChildStackOptions } from "@/components/chrome";

export default function PlanLayout() {
  const screenOptions = useChildStackOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="[id]" options={{ title: "Plan" }} />
      <Stack.Screen name="form" options={{ title: "Work plan" }} />
    </Stack>
  );
}
