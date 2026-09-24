import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "@/components/AppHeader";
import { ReportSheet } from "@/components/ReportSheet";
import { Button, Card, Chip, Empty, Field, FilterBar, Headline, Loading, Screen, Segmented, SplitActions } from "@/components/ui";
import { CopyPlanSheet } from "@/components/sheets";
import { apiErrorMessage } from "@/lib/apiError";
import { formatPlanDate, isPlanWindowClosed, personId, personName } from "@/lib/dates";
import { useSession } from "@/lib/session";
import { useDeletePlanMutation, useGetPlansQuery } from "@/store/api/workPlannerApiSlice";
import type { WorkPlanRecord } from "@/types/workPlanner";
import { isWpElevated } from "@/utils/roles";
import { useStatusColors, useThemeColors } from "@/theme";

const STATUSES = [
  { id: "all", label: "All" },
  { id: "planned", label: "Planned" },
  { id: "completed", label: "Completed" },
] as const;

const TYPES = [
  { id: "all", label: "All types" },
  { id: "Visits", label: "Visits" },
  { id: "Tasks & Visits", label: "Tasks & visits" },
  { id: "Leave", label: "Leave" },
  { id: "Work From Home", label: "WFH" },
  { id: "Work From Office", label: "WFO" },
] as const;

function planId(plan: WorkPlanRecord) {
  return String(plan._id || plan.id || "");
}

function activityLabel(plan: WorkPlanRecord) {
  const type = plan.plan_type || "Visits";
  const visits = plan.visit_count ?? plan.visits?.length ?? 0;
  const tasks = plan.work_count ?? plan.works?.length ?? 0;
  if (type === "Leave") return "Leave";
  if (type === "Tasks & Visits") return `${visits} visits · ${tasks} tasks`;
  if (type === "Work From Home" || type === "Work From Office") return `${tasks} tasks`;
  return `${visits} visits`;
}

export default function PlansScreen() {
  const colors = useThemeColors();
  const statusColor = useStatusColors();
  const { session } = useSession();
  const elevated = isWpElevated(session?.user);
  const params = useLocalSearchParams<{ status?: string; scope?: string }>();
  const [status, setStatus] = useState<(typeof STATUSES)[number]["id"]>("all");
  const [planType, setPlanType] = useState<(typeof TYPES)[number]["id"]>("all");
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reportOpen, setReportOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState<WorkPlanRecord | null>(null);
  const query = useGetPlansQuery({
    page,
    limit: 20,
    status: status === "all" ? undefined : status,
    plan_type: planType === "all" ? undefined : planType,
    scope: elevated ? scope : "mine",
  });
  useEffect(() => {
    const nextStatus = Array.isArray(params.status) ? params.status[0] : params.status;
    const nextScope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
    if (nextStatus === "all" || nextStatus === "planned" || nextStatus === "completed") {
      setStatus(nextStatus);
      setPage(1);
    }
    if (elevated && (nextScope === "mine" || nextScope === "team")) {
      setScope(nextScope);
      setPage(1);
    }
  }, [params.status, params.scope, elevated]);

  const [removePlan] = useDeletePlanMutation();
  const pages = query.data?.pages || 1;

  const rows = useMemo(() => {
    const list = query.data?.data || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((plan) => {
      const owner = personName(plan.sales_user);
      return [plan.location, plan.plan_type, plan.remarks, owner, plan.status].join(" ").toLowerCase().includes(q);
    });
  }, [query.data, search]);

  function confirmDelete(id: string, label: string) {
    Alert.alert("Delete plan", `Delete the plan for ${label}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void removePlan(id)
            .unwrap()
            .catch((err) => Alert.alert("Could not delete", apiErrorMessage(err, "Delete failed")));
        },
      },
    ]);
  }

  return (
    <Screen>
      <AppHeader title="Plans" />
      <SplitActions>
        <Button label="New plan" onPress={() => router.push("/plan/form")} />
        <Button label="Download" variant="ghost" onPress={() => setReportOpen(true)} />
      </SplitActions>
      {elevated ? (
        <Segmented
          value={scope}
          onChange={(id) => {
            setScope(id as "mine" | "team");
            setPage(1);
          }}
          options={[
            { id: "mine", label: "My plans" },
            { id: "team", label: "Team plans" },
          ]}
        />
      ) : null}
      <Segmented
        value={status}
        onChange={(id) => {
          setStatus(id as (typeof STATUSES)[number]["id"]);
          setPage(1);
        }}
        options={STATUSES.map((item) => ({ id: item.id, label: item.label }))}
      />
      <FilterBar>
        {TYPES.map((item) => (
          <Chip
            key={item.id}
            label={item.label}
            active={planType === item.id}
            onPress={() => {
              setPlanType(item.id);
              setPage(1);
            }}
          />
        ))}
      </FilterBar>
      <Field label="Search" value={search} onChangeText={setSearch} placeholder="Location, person, or remarks" />
      {query.isLoading ? <Loading /> : null}
      {query.isError ? <Text style={{ color: colors.danger }}>Could not load plans.</Text> : null}
      {!query.isLoading && rows.length === 0 ? <Empty label="No work plans" /> : null}
      {rows.map((plan) => {
        const id = planId(plan);
        const dateLabel = formatPlanDate(plan.plan_date);
        const canDelete = plan.status !== "completed" && !isPlanWindowClosed(plan.plan_date);
        return (
          <Card key={id}>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/plan/${id}`)}>
              <Headline
                title={dateLabel}
                meta={[plan.plan_type || "Visits", plan.location || "No location", activityLabel(plan), personName(plan.sales_user)]
                  .filter(Boolean)
                  .join(" · ")}
                memberName={personName(plan.sales_user) || undefined}
                status={plan.status}
                statusColor={statusColor[plan.status]}
              />
            </Pressable>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy plan"
                onPress={() => setCopyTarget(plan)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.cardAlt,
                }}
              >
                <Ionicons name="copy-outline" size={18} color={colors.text} />
              </Pressable>
              {canDelete ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete plan"
                  onPress={() => confirmDelete(id, dateLabel)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.cardAlt,
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
          </Card>
        );
      })}
      {pages > 1 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label="Previous" variant="ghost" disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))} />
          </View>
          <Text style={{ color: colors.muted, fontWeight: "700" }}>
            {page} / {pages}
          </Text>
          <View style={{ flex: 1 }}>
            <Button label="Next" variant="ghost" disabled={page >= pages} onPress={() => setPage((p) => p + 1)} />
          </View>
        </View>
      ) : null}
      <ReportSheet visible={reportOpen} kind="plans" scope={elevated ? scope : "mine"} onClose={() => setReportOpen(false)} />
      <CopyPlanSheet
        visible={copyTarget !== null}
        planId={copyTarget ? planId(copyTarget) : ""}
        planDate={copyTarget?.plan_date}
        planType={copyTarget?.plan_type}
        executiveName={copyTarget ? personName(copyTarget.sales_user) || undefined : undefined}
        salesUserId={copyTarget ? personId(copyTarget.sales_user) || undefined : undefined}
        onClose={() => setCopyTarget(null)}
        onConfirm={(targetDate) => {
          const id = copyTarget ? planId(copyTarget) : "";
          router.push({ pathname: "/plan/form", params: { copy: id, date: targetDate } });
        }}
      />
    </Screen>
  );
}
