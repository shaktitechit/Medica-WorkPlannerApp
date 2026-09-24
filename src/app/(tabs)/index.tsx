import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { AppHeader } from "@/components/AppHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Button, Card, Grid, GridItem, Loading, Screen, Section } from "@/components/ui";
import { monthBounds, todayISO } from "@/lib/dates";
import { useSession } from "@/lib/session";
import { useGetStatsQuery } from "@/store/api/workPlannerApiSlice";
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
      <Section>My overview</Section>
      <StatGrid scope="mine" from={from} to={to} />
      {elevated ? (
        <>
          <Section>Team overview</Section>
          <StatGrid scope="team" from={from} to={to} />
        </>
      ) : null}
      <Button label="New work plan" onPress={() => router.push({ pathname: "/plan/form", params: { date: todayISO() } })} />
    </Screen>
  );
}
