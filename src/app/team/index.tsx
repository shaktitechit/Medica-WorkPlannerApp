import { Redirect } from "expo-router";
import { TeamDirectory } from "@/components/TeamDirectory";
import { useSession } from "@/lib/session";
import { isWpManager } from "@/utils/roles";

export default function MyTeamScreen() {
  const { session } = useSession();
  if (!isWpManager(session?.user)) return <Redirect href="/(tabs)" />;
  return <TeamDirectory mode="mine" />;
}
