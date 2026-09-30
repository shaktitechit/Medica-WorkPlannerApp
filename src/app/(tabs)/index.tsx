import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/components/AppHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Button, Card, Grid, GridItem, Loading, Screen, Section } from "@/components/ui";
import { monthBounds, todayISO } from "@/lib/dates";
import { useSession } from "@/lib/session";
import { useGetStatsQuery } from "@/store/api/workPlannerApiSlice";
import { useGetProjectsQuery } from "@/store/api/projectApiSlice";
import { isWpElevated, roleLabel } from "@/utils/roles";
import { useThemeColors } from "@/theme";

function StatGrid({ scope, from, to }: { scope: "mine" | "team"; from: string; to: string }) {
  const colors = useThemeColors();
  const { data, isLoading, isError } = useGetStatsQuery({ scope, from, to });
  if (isLoading) return <Loading label="Loading stats…" />;
  if (isError || !data) return <Text style={{ color: colors.danger }}>Could not load stats.</Text>;
  const items: { label: string; value: number | undefined; href: Href }[] = [
    { label: "Plans", value: data.total_plans, href: { pathname: "/(tabs)/plans", params: { scope, status: "all" } } },
    { label: "Today", value: data.today_plans, href: { pathname: "/(tabs)/calendar", params: { date: todayISO() } } },
    { label: "Completed", value: data.completed, href: { pathname: "/(tabs)/plans", params: { scope, status: "completed" } } },
    { label: "Visits", value: data.total_visits, href: { pathname: "/(tabs)/tasks", params: { scope, view: "visits" } } },
    { label: "Tasks", value: data.total_works, href: { pathname: "/(tabs)/tasks", params: { scope, view: "tasks" } } },
    { label: "Expenses", value: data.expense_total, href: { pathname: "/(tabs)/expenses", params: { scope, status: "all", from, to } } },
    { label: "Expense pending", value: data.expense_pending_approval, href: { pathname: "/(tabs)/expenses", params: { scope, status: "submitted", from, to } } },
  ];
  return (
    <Grid>
      {items.map((item) => (
        <GridItem key={item.label}>
          <Pressable accessibilityRole="button" onPress={() => router.push(item.href)}>
            <Card>
              <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>{item.label}</Text>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }} numberOfLines={1}>{item.value ?? 0}</Text>
            </Card>
          </Pressable>
        </GridItem>
      ))}
    </Grid>
  );
}

function ProjectsOverviewCard() {
  const colors = useThemeColors();
  const { data: projectsData, isLoading } = useGetProjectsQuery({});
  const projects = projectsData?.items || [];
  const activeCount = projects.filter((p) => p.status === "active").length;
  const planningCount = projects.filter((p) => p.status === "planning").length;

  return (
    <Pressable onPress={() => router.push("/(tabs)/projects" as any)}>
      <Card style={{ padding: 14, borderRadius: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                backgroundColor: colors.primary + "15",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="layers" size={18} color={colors.primary} />
            </View>
            <View>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>Projects & Roadmaps</Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {isLoading ? "Loading projects..." : `${projects.length} Total Projects • ${activeCount} In Progress`}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
          <View
            style={{
              flex: 1,
              backgroundColor: colors.cardAlt,
              padding: 8,
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#2563eb" }}>{activeCount}</Text>
            <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "600" }}>In Progress</Text>
          </View>
          <View
            style={{
              flex: 1,
              backgroundColor: colors.cardAlt,
              padding: 8,
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#6366f1" }}>{planningCount}</Text>
            <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "600" }}>Planning</Text>
          </View>
          <View
            style={{
              flex: 1,
              backgroundColor: colors.cardAlt,
              padding: 8,
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.primary }}>{projects.length}</Text>
            <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "600" }}>All Projects</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export default function HomeScreen() {
  const now = new Date();
  const bounds = monthBounds(now.getFullYear(), now.getMonth());
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(todayISO());
  const { session } = useSession();
  const colors = useThemeColors();
  const user = session?.user;
  const elevated = isWpElevated(user);

  return (
    <Screen>
      <AppHeader title="Home" />
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }} numberOfLines={1}>
        {user?.name || user?.email}
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}> · {roleLabel(user)}</Text>
      </Text>
      <DateRangePicker
        from={from}
        to={to}
        onChange={(nextFrom, nextTo) => {
          setFrom(nextFrom);
          setTo(nextTo);
        }}
      />

      <Section>Projects System</Section>
      <ProjectsOverviewCard />

      <Section>My overview</Section>
      <StatGrid scope="mine" from={from} to={to} />
      {elevated ? (
        <>
          <Section>Team overview</Section>
          <StatGrid scope="team" from={from} to={to} />
        </>
      ) : null}
      <Button label="New work plan" onPress={() => router.push({ pathname: "/plan/form", params: { date: todayISO() } })} />
      <Button
        label="Explore Projects & Workspace"
        variant="ghost"
        onPress={() => router.push("/(tabs)/projects" as any)}
      />
    </Screen>
  );
}
