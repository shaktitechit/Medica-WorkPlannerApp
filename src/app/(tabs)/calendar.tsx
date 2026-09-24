import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AppHeader } from "@/components/AppHeader";
import { PersonSelect } from "@/components/PersonSelect";
import { Button, Card, Chip, Empty, FilterBar, Headline, Loading, Screen } from "@/components/ui";
import { earliestOpenPlanDate, formatPlanDate, isoDate, monthBounds, personId, personName, stripHtml, todayISO } from "@/lib/dates";
import { useTeamScope } from "@/lib/teamScope";
import { useGetPlansQuery } from "@/store/api/workPlannerApiSlice";
import type { WorkPlanRecord } from "@/types/workPlanner";
import { useStatusColors, useThemeColors } from "@/theme";

function planSummary(plan: WorkPlanRecord) {
  const visits = plan.visits?.length || plan.visit_count || 0;
  const tasks = plan.works?.length || plan.work_count || 0;
  if (plan.plan_type === "Leave") return "Leave";
  if (plan.plan_type === "Tasks & Visits") return `${visits} visits, ${tasks} tasks`;
  if (plan.plan_type === "Work From Home" || plan.plan_type === "Work From Office") return `${tasks} tasks`;
  return `${visits} visits`;
}

export default function CalendarScreen() {
  const colors = useThemeColors();
  const statusColor = useStatusColors();
  const now = new Date();
  const team = useTeamScope("team");
  const params = useLocalSearchParams<{ date?: string }>();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedYmd, setSelectedYmd] = useState(todayISO());
  useEffect(() => {
    const date = Array.isArray(params.date) ? params.date[0] : params.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const [year, month] = date.split("-").map(Number);
    setSelectedYmd(date);
    if (year && month) setCursor({ year, month: month - 1 });
  }, [params.date]);
  const [gridWidth, setGridWidth] = useState(0);
  const bounds = monthBounds(cursor.year, cursor.month);
  const plans = useGetPlansQuery({
    from: bounds.from,
    to: bounds.to,
    limit: 250,
    include_visits: true,
    include_works: true,
    scope: team.elevated ? team.scope : "mine",
    ...(team.memberId !== "all" ? { sales_user: team.memberId, sales_user_id: team.memberId } : {}),
  });

  const monthPlans = useMemo(
    () => (plans.data?.data || []).filter((plan) => team.allows(personId(plan.sales_user))),
    [plans.data, team],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, WorkPlanRecord[]>();
    for (const plan of monthPlans) {
      const day = isoDate(plan.plan_date);
      if (!day) continue;
      const list = map.get(day) || [];
      list.push(plan);
      map.set(day, list);
    }
    return map;
  }, [monthPlans]);

  const selectedPlans = byDay.get(selectedYmd) || [];
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
  const gap = 6;
  const cell = gridWidth > 0 ? Math.floor((gridWidth - gap * 6) / 7) : 0;
  const today = todayISO();
  const counts = {
    total: monthPlans.length,
    completed: monthPlans.filter((plan) => plan.status === "completed").length,
    approved: monthPlans.filter((plan) => plan.status === "approved").length,
    pending: monthPlans.filter((plan) => plan.status === "planned" || plan.status === "draft" || plan.status === "submitted").length,
  };

  function openNewPlan() {
    router.push({ pathname: "/plan/form", params: { date: selectedYmd } });
  }

  return (
    <Screen>
      <AppHeader title="Calendar" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Chip
          label="Prev"
          onPress={() => setCursor((current) => {
            const next = new Date(current.year, current.month - 1, 1);
            return { year: next.getFullYear(), month: next.getMonth() };
          })}
        />
        <Text style={{ flex: 1, textAlign: "center", color: colors.text, fontWeight: "800" }} numberOfLines={1}>{monthLabel}</Text>
        <Chip
          label="Next"
          onPress={() => setCursor((current) => {
            const next = new Date(current.year, current.month + 1, 1);
            return { year: next.getFullYear(), month: next.getMonth() };
          })}
        />
        <Chip label="Today" onPress={() => { setCursor({ year: now.getFullYear(), month: now.getMonth() }); setSelectedYmd(today); }} />
      </View>
      {team.elevated ? (
        <View style={{ gap: 8 }}>
          <FilterBar>
            <Chip label="My plans" active={team.scope === "mine"} onPress={team.showMine} />
            <Chip
              label={team.admin ? "All portal members" : "My team plans"}
              active={team.scope === "team"}
              onPress={() => team.setScope("team")}
            />
          </FilterBar>
          {team.scope === "team" && team.teams.length > 0 ? (
            <PersonSelect label="Team" people={team.teamChoices} value={team.teamId} onChange={team.pickTeam} />
          ) : null}
          {team.scope === "team" ? (
            <PersonSelect label="Executive" people={team.people} value={team.memberId} selfId={team.selfId} onChange={team.setMemberId} />
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="New plan" onPress={openNewPlan} />
        <Button label="Plans" variant="ghost" onPress={() => router.push("/(tabs)/plans")} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[
          ["Total plans", counts.total],
          ["Completed", counts.completed],
          ["Approved", counts.approved],
          ["Planned / pending", counts.pending],
        ].map(([label, value]) => (
          <View key={String(label)} style={{ minWidth: "47%", flexGrow: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.card }}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{value}</Text>
          </View>
        ))}
      </View>
      {plans.isLoading ? <Loading /> : null}
      <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
        <View style={{ flexDirection: "row", marginBottom: 6 }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((name, index) => (
            <View key={`${name}-${index}`} style={{ width: cell || "14.28%", alignItems: "center" }}>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{name}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
          {Array.from({ length: firstWeekday }, (_, index) => (
            <View key={`pad-${index}`} style={{ width: cell, height: cell }} />
          ))}
          {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
            const iso = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const count = byDay.get(iso)?.length || 0;
            const selected = iso === selectedYmd;
            const locked = iso < earliestOpenPlanDate();
            const isToday = iso === today;
            return (
              <Pressable
                key={iso}
                onPress={() => setSelectedYmd(iso)}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: selected ? colors.primary : isToday ? "#fffbeb" : locked ? colors.cardAlt : colors.card,
                  borderWidth: isToday && !selected ? 2 : 1,
                  borderColor: selected ? colors.primary : isToday ? colors.warning : count ? colors.primary : colors.border,
                  opacity: locked && !selected ? 0.55 : 1,
                }}
              >
                <Text style={{ color: selected ? "#fff" : locked ? colors.muted : colors.text, fontWeight: "700" }}>{day}</Text>
                {count ? <Text style={{ color: selected ? "#fff" : colors.primary, fontSize: 10, fontWeight: "800" }}>{count}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Selected day</Text>
      <Text style={{ color: colors.text, fontWeight: "800" }}>{formatPlanDate(selectedYmd)}</Text>
      {selectedYmd < earliestOpenPlanDate() ? (
        <Text style={{ color: colors.warning }}>This day is outside the 3-day window, so its plans are read only.</Text>
      ) : null}
      {selectedPlans.length === 0 ? (
        <View style={{ gap: 8 }}>
          <Empty label="No work plans for this day" />
          <Button label="Create plan for this day" variant="ghost" onPress={openNewPlan} />
        </View>
      ) : (
        selectedPlans.map((plan) => {
          const id = String(plan._id || plan.id);
          const visits = (plan.visits || []).slice(0, 3);
          const works = (plan.works || []).slice(0, 3);
          return (
            <Card key={id}>
              <Headline
                title={personName(plan.sales_user) || "Plan"}
                meta={`${plan.plan_type || "Visits"} · ${plan.location || "No location"} · ${planSummary(plan)}`}
                status={plan.status}
                statusColor={statusColor[plan.status]}
              />
              {visits.length ? (
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Visits: {visits.map((visit) => visit.party_name || "Visit").join(", ")}
                  {(plan.visits || []).length > 3 ? ` +${(plan.visits || []).length - 3} more` : ""}
                </Text>
              ) : null}
              {works.length ? (
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Tasks: {works.map((work) => work.title).join(", ")}
                  {(plan.works || []).length > 3 ? ` +${(plan.works || []).length - 3} more` : ""}
                </Text>
              ) : null}
              {plan.remarks ? <Text style={{ color: colors.muted, fontSize: 12 }}>{stripHtml(plan.remarks)}</Text> : null}
              {plan.is_discussed_with_manager ? (
                <Text style={{ color: colors.success, fontSize: 12 }}>
                  Discussed with manager{plan.discussed_manager_name ? ` (${plan.discussed_manager_name})` : ""}
                </Text>
              ) : null}
              <Button label="Open work plan" variant="ghost" onPress={() => router.push(`/plan/${id}`)} />
            </Card>
          );
        })
      )}
    </Screen>
  );
}
