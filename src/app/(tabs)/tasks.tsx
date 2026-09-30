import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AppHeader } from "@/components/AppHeader";
import { ReportSheet } from "@/components/ReportSheet";
import { PersonSelect } from "@/components/PersonSelect";
import { Button, Card, Chip, Empty, Field, FilterBar, Headline, Loading, Screen, SplitActions } from "@/components/ui";
import { VisitFormSheet, WorkFormSheet } from "@/components/sheets";
import { StatusSheet, type CompleteVisitAnswers, type WorkflowStatus } from "@/components/StatusSheet";
import { apiErrorMessage } from "@/lib/apiError";
import { formatPlanDate, isPlanWindowClosed, isoDate, monthBounds, personId, personName, stripHtml, todayISO } from "@/lib/dates";
import { useTeamScope } from "@/lib/teamScope";
import {
  useAddStandaloneVisitMutation,
  useAddStandaloneWorkMutation,
  useCompleteVisitMutation,
  useGetPlansQuery,
  useRemoveStandaloneVisitMutation,
  useRemoveStandaloneWorkMutation,
  useUpdateVisitMutation,
  useUpdateWorkMutation,
} from "@/store/api/workPlannerApiSlice";
import type { WorkPlanRecord, WorkPlanVisitRecord, WorkPlanWorkRecord } from "@/types/workPlanner";
import { useStatusColors, useThemeColors } from "@/theme";

type ViewMode = "list" | "visits" | "tasks";

type Row = {
  planId: string;
  planStatus?: string;
  planDate?: string;
  executiveId: string;
  executiveName: string;
  title: string;
  detail: string;
} & ({ kind: "visit"; item: WorkPlanVisitRecord } | { kind: "work"; item: WorkPlanWorkRecord });

const STATUSES = [
  { id: "all", label: "All" },
  { id: "created", label: "Created" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "rescheduled", label: "Rescheduled" },
  { id: "skipped", label: "Skipped" },
  { id: "cancelled", label: "Cancelled" },
];

function ymd(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function ownerOf(item: { sales_user?: WorkPlanVisitRecord["sales_user"] }, plan: WorkPlanRecord) {
  const source = item.sales_user || plan.sales_user;
  return {
    id: personId(source) || personId(plan.sales_user),
    name: personName(source) || personName(plan.sales_user),
  };
}

export default function TasksScreen() {
  const colors = useThemeColors();
  const statusColor = useStatusColors();
  const team = useTeamScope("mine");
  const params = useLocalSearchParams<{ view?: string; scope?: string }>();
  const now = new Date();
  const [view, setView] = useState<ViewMode>("list");
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedYmd, setSelectedYmd] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [gridWidth, setGridWidth] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [target, setTarget] = useState<Row | null>(null);

  useEffect(() => {
    const nextView = Array.isArray(params.view) ? params.view[0] : params.view;
    const nextScope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
    if (nextView === "list" || nextView === "visits" || nextView === "tasks") setView(nextView);
    if (team.elevated && (nextScope === "mine" || nextScope === "team")) team.setScope(nextScope);
  }, [params.view, params.scope, team.elevated, team.setScope]);

  const bounds = monthBounds(cursor.year, cursor.month);
  const plans = useGetPlansQuery({
    limit: 250,
    include_visits: true,
    include_works: true,
    ...(view === "list" ? {} : { from: bounds.from, to: bounds.to }),
    ...(team.elevated ? { scope: team.scope } : { scope: "mine" }),
    ...(team.memberId !== "all" ? { sales_user: team.memberId, sales_user_id: team.memberId } : {}),
  });
  const [updateVisit, visitState] = useUpdateVisitMutation();
  const [completeVisit, completeState] = useCompleteVisitMutation();
  const [updateWork, workState] = useUpdateWorkMutation();
  const [addVisit, addVisitState] = useAddStandaloneVisitMutation();
  const [addWork, addWorkState] = useAddStandaloneWorkMutation();
  const [removeVisit] = useRemoveStandaloneVisitMutation();
  const [removeWork] = useRemoveStandaloneWorkMutation();

  const rows = useMemo(() => {
    const list: Row[] = [];
    for (const plan of plans.data?.data || []) {
      const planId = String(plan._id || plan.id || "");
      for (const visit of plan.visits || []) {
        const owner = ownerOf(visit, plan);
        if (!team.allows(owner.id)) continue;
        const visitContacts = Array.isArray(visit.contacts) && visit.contacts.length > 0
          ? visit.contacts
          : (visit.contact_person || visit.contact_number || visit.contact_email)
            ? [{ contact_person: visit.contact_person, contact_number: visit.contact_number, contact_email: visit.contact_email }]
            : [];
        const contactNames = visitContacts.length > 0
          ? visitContacts.map((c) => c.contact_person).filter(Boolean).join(", ")
          : visit.contact_person;

        list.push({
          kind: "visit",
          planId,
          planStatus: plan.status,
          planDate: visit.plan_date || plan.plan_date,
          executiveId: owner.id,
          executiveName: owner.name,
          title: visit.party_name || "Field visit",
          detail: [contactNames, visit.purpose || visit.address].filter(Boolean).join(" · "),
          item: visit,
        });
      }
      for (const work of plan.works || []) {
        const owner = ownerOf(work, plan);
        if (!team.allows(owner.id)) continue;
        list.push({
          kind: "work",
          planId,
          planStatus: plan.status,
          planDate: work.plan_date || plan.plan_date,
          executiveId: owner.id,
          executiveName: owner.name,
          title: work.title || "Work task",
          detail: work.description || "",
          item: work,
        });
      }
    }
    return list;
  }, [plans.data, team]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (view === "visits" && row.kind !== "visit") return false;
      if (view === "tasks" && row.kind !== "work") return false;
      if (status !== "all" && row.item.status !== status) return false;
      if (!needle) return true;
      return `${row.title} ${row.detail} ${row.executiveName}`.toLowerCase().includes(needle);
    });
  }, [rows, view, status, search]);

  const byDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of visibleRows) {
      const day = isoDate(row.planDate);
      if (!day) continue;
      const bucket = map.get(day) || [];
      bucket.push(row);
      map.set(day, bucket);
    }
    return map;
  }, [visibleRows]);

  const dayRows = byDay.get(selectedYmd) || [];
  const planner = view === "visits" || view === "tasks";
  const planDate = planner ? selectedYmd : todayISO();
  const planFor = team.memberId !== "all" ? team.memberId : team.selfId;
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
  const gap = 6;
  const cell = gridWidth > 0 ? Math.floor((gridWidth - gap * 6) / 7) : 0;
  const counts = {
    total: visibleRows.length,
    completed: visibleRows.filter((row) => row.item.status === "completed").length,
    active: visibleRows.filter((row) => row.item.status === "in_progress").length,
    open: visibleRows.filter((row) => row.item.status === "created" || row.item.status === "pending").length,
  };

  async function saveStatus(payload: {
    status: WorkflowStatus;
    remarks: string;
    managerRemarks?: string;
    rescheduledDate?: string;
    visitAnswers?: CompleteVisitAnswers;
  }) {
    if (!target) return;
    if (!team.elevated && (target.planStatus === "completed" || isPlanWindowClosed(target.planDate || target.item.plan_date))) {
      Alert.alert("Read only", target.planStatus === "completed" ? "This work plan is completed." : "The 3-day window has closed.");
      return;
    }
    const itemId = String(target.item._id || target.item.id || "");
    try {
      if (target.kind === "visit") {
        const body: Record<string, unknown> = {
          status: payload.status,
          pending_remarks: payload.remarks,
          in_progress_remarks: payload.remarks,
          outcome: payload.remarks,
          ...(payload.managerRemarks ? { manager_remarks: payload.managerRemarks } : {}),
          ...(payload.rescheduledDate ? { rescheduled_date: payload.rescheduledDate } : {}),
          ...(payload.visitAnswers || {}),
        };
        if (payload.status === "completed" && payload.visitAnswers) {
          await completeVisit({ planId: target.planId, visitId: itemId, body }).unwrap();
        } else {
          await updateVisit({ planId: target.planId, visitId: itemId, body }).unwrap();
        }
      } else {
        const body: Record<string, unknown> = {
          status: payload.status,
          pending_remarks: payload.remarks,
          in_progress_remarks: payload.remarks,
          completion_remarks: payload.remarks,
          outcome: payload.remarks,
          ...(payload.managerRemarks ? { manager_remarks: payload.managerRemarks } : {}),
          ...(payload.rescheduledDate ? { rescheduled_date: payload.rescheduledDate } : {}),
        };
        await updateWork({ planId: target.planId, workId: itemId, body }).unwrap();
      }
      setTarget(null);
    } catch (err) {
      Alert.alert("Status update failed", apiErrorMessage(err, "Could not update status"));
    }
  }

  function renderRow(row: Row) {
    const itemId = String(row.item._id || row.item.id);
    const locked = !team.elevated && (row.planStatus === "completed" || isPlanWindowClosed(row.planDate || row.item.plan_date));
    return (
      <Card key={`${row.kind}-${itemId}`}>
        <Headline
          title={row.title}
          meta={[formatPlanDate(row.planDate), row.kind === "visit" ? "Visit" : "Task", row.executiveName].filter(Boolean).join(" · ")}
          memberName={row.executiveName || undefined}
          status={row.item.status}
          statusColor={statusColor[row.item.status]}
        />
        {row.item.rescheduled_date ? (
          <View style={{ alignSelf: "flex-start", backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 }}>
            <Text style={{ color: "#c2410c", fontSize: 11, fontWeight: "700" }}>
              Rescheduled to: {formatPlanDate(row.item.rescheduled_date)}
            </Text>
          </View>
        ) : null}
        {row.detail ? <Text style={{ color: colors.muted }}>{row.detail}</Text> : null}
            {(() => {
          const isSeniorViewing = team.elevated && String(team.selfId) !== String(row.executiveId || "");
          return isSeniorViewing && row.item.manager_remarks ? (
            <View style={{ backgroundColor: "#faf5ff", borderWidth: 1, borderColor: "#e9d5ff", borderRadius: 8, padding: 8, marginTop: 4, gap: 2 }}>
              <Text style={{ color: "#7e22ce", fontSize: 11, fontWeight: "700" }}>Senior Remark</Text>
              <Text style={{ color: colors.text, fontSize: 12 }}>{stripHtml(row.item.manager_remarks)}</Text>
            </View>
          ) : null;
        })()}
        {(() => {
          const isSeniorViewing = team.elevated && String(team.selfId) !== String(row.executiveId || "");
          return isSeniorViewing && row.item.authority_remarks && row.item.authority_remarks.length > 0 ? (
            <View style={{ backgroundColor: "#faf5ff", borderWidth: 1, borderColor: "#e9d5ff", borderRadius: 8, padding: 8, marginTop: 4, gap: 4 }}>
              <Text style={{ color: "#7e22ce", fontSize: 11, fontWeight: "700" }}>
                Senior Remarks ({row.item.authority_remarks.length})
              </Text>
              {row.item.authority_remarks.map((r, idx) => (
                <View key={r._id || `ar-${idx}`} style={{ borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: "#f3e8ff", paddingTop: idx > 0 ? 4 : 0 }}>
                  <Text style={{ color: "#6b21a8", fontSize: 11, fontWeight: "700" }}>
                    {r.role ? `[${r.role.toUpperCase()}] ` : ""}{r.user_name || "Authority"}
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 12 }}>{stripHtml(r.remark)}</Text>
                </View>
              ))}
            </View>
          ) : null;
        })()}
        {locked ? (
          <Text style={{ color: colors.muted }}>
            {row.planStatus === "completed" ? "Completed plan is read only." : "The 3-day window has closed."}
          </Text>
        ) : null}
        <SplitActions>
          {locked ? null : <Button label="Status" variant="ghost" onPress={() => setTarget(row)} />}
          <Button label="Plan" variant="ghost" onPress={() => router.push(`/plan/${row.planId}`)} />
          {!locked && row.item.status === "created" ? (
            <Button
              label="Delete"
              variant="danger"
              onPress={() => {
                const action = row.kind === "visit" ? removeVisit({ visitId: itemId }) : removeWork({ workId: itemId });
                void action.unwrap().catch((err) => Alert.alert("Delete failed", apiErrorMessage(err, "Could not delete")));
              }}
            />
          ) : null}
        </SplitActions>
      </Card>
    );
  }

  return (
    <Screen>
      <AppHeader title="Tasks & visits" />
      <SplitActions>
        <Button label="Visit" onPress={() => setVisitOpen(true)} />
        <Button label="Task" variant="ghost" onPress={() => setWorkOpen(true)} />
        <Button label="Download" variant="ghost" onPress={() => setReportOpen(true)} />
      </SplitActions>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {team.admin
          ? "Plan visits and tasks for any portal member."
          : team.manager
            ? "Plan visits and tasks for yourself and your team."
            : "Track and plan your visits and tasks."}
      </Text>
      <FilterBar>
        <Chip label="List" active={view === "list"} onPress={() => setView("list")} />
        <Chip label="Visits planner" active={view === "visits"} onPress={() => setView("visits")} />
        <Chip label="Tasks planner" active={view === "tasks"} onPress={() => setView("tasks")} />
      </FilterBar>
      {team.elevated ? (
        <View style={{ gap: 8 }}>
          <FilterBar>
            <Chip label="My activity" active={team.scope === "mine"} onPress={team.showMine} />
            <Chip label={team.admin ? "All portal members" : "My team"} active={team.scope === "team"} onPress={() => team.setScope("team")} />
          </FilterBar>
          {team.scope === "team" && team.teams.length > 0 ? (
            <PersonSelect label="Team" people={team.teamChoices} value={team.teamId} onChange={team.pickTeam} />
          ) : null}
          {team.scope === "team" ? (
            <PersonSelect label="Executive" people={team.people} value={team.memberId} selfId={team.selfId} onChange={team.setMemberId} />
          ) : null}
        </View>
      ) : null}

      {planner ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Chip
              label="Prev"
              onPress={() => setCursor((current) => {
                const next = new Date(current.year, current.month - 1, 1);
                return { year: next.getFullYear(), month: next.getMonth() };
              })}
            />
            <Text style={{ flex: 1, textAlign: "center", color: colors.text, fontWeight: "800" }} numberOfLines={1}>
              {view === "visits" ? "Visits" : "Tasks"} · {monthLabel}
            </Text>
            <Chip
              label="Next"
              onPress={() => setCursor((current) => {
                const next = new Date(current.year, current.month + 1, 1);
                return { year: next.getFullYear(), month: next.getMonth() };
              })}
            />
            <Chip label="Today" onPress={() => { setCursor({ year: now.getFullYear(), month: now.getMonth() }); setSelectedYmd(todayISO()); }} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              ["Planned", counts.total],
              ["Completed", counts.completed],
              ["In progress", counts.active],
              ["Pending", counts.open],
            ].map(([label, value]) => (
              <View key={String(label)} style={{ minWidth: "47%", flexGrow: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.card }}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{value}</Text>
              </View>
            ))}
          </View>
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
                const iso = ymd(cursor.year, cursor.month, day);
                const count = byDay.get(iso)?.length || 0;
                const selected = iso === selectedYmd;
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
                      backgroundColor: selected ? colors.primary : colors.card,
                      borderWidth: 1,
                      borderColor: count ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ color: selected ? "#fff" : colors.text, fontWeight: "700" }}>{day}</Text>
                    {count ? <Text style={{ color: selected ? "#fff" : colors.primary, fontSize: 10, fontWeight: "800" }}>{count}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Text style={{ color: colors.text, fontWeight: "800" }}>{formatPlanDate(selectedYmd)}</Text>
          {isPlanWindowClosed(selectedYmd) ? (
            <Text style={{ color: colors.warning }}>This day is outside the 3-day window, so its items are read only.</Text>
          ) : null}
          <Button
            label={view === "visits" ? "Plan a visit on this day" : "Plan a task on this day"}
            onPress={() => (view === "visits" ? setVisitOpen(true) : setWorkOpen(true))}
          />
          {plans.isLoading ? <Loading /> : null}
          {!plans.isLoading && dayRows.length === 0 ? (
            <Empty label={view === "visits" ? "No visits planned for this day" : "No tasks planned for this day"} />
          ) : null}
          {dayRows.map(renderRow)}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Field label="Search" value={search} onChangeText={setSearch} placeholder="Party, task, person" />
          <FilterBar>
            {STATUSES.map((item) => (
              <Chip key={item.id} label={item.label} active={status === item.id} onPress={() => setStatus(item.id)} />
            ))}
          </FilterBar>
          {plans.isLoading ? <Loading /> : null}
          {!plans.isLoading && visibleRows.length === 0 ? <Empty label="No visits or tasks" /> : null}
          {visibleRows.map(renderRow)}
        </View>
      )}

      <StatusSheet
        visible={Boolean(target)}
        itemType={target?.kind === "work" ? "work" : "visit"}
        initialStatus={target?.item.status}
        initialPendingRemarks={target?.item.pending_remarks}
        initialInProgressRemarks={target?.item.in_progress_remarks}
        initialOutcome={target?.kind === "work" ? target.item.completion_remarks || target.item.outcome : target?.kind === "visit" ? target.item.outcome : ""}
        initialManagerRemarks={target?.item.manager_remarks}
        initialRescheduledDate={target?.item.rescheduled_date}
        authorityRemarks={target?.item.authority_remarks}
        isElevated={team.elevated && String(team.selfId) !== String(target?.executiveId || "")}
        initialAnswers={
          target?.kind === "visit"
            ? {
                meeting_with_doctor: target.item.meeting_with_doctor,
                meeting_with_purchase: target.item.meeting_with_purchase,
                meeting_with_finance: target.item.meeting_with_finance,
                meeting_with_engineer: target.item.meeting_with_engineer,
                new_product_introduced: target.item.new_product_introduced,
                order_received: target.item.order_received,
              }
            : undefined
        }
        saving={visitState.isLoading || completeState.isLoading || workState.isLoading}
        onClose={() => setTarget(null)}
        onConfirm={(payload) => void saveStatus(payload)}
      />
      <VisitFormSheet
        visible={visitOpen}
        saving={addVisitState.isLoading}
        planDate={planDate}
        salesUserId={planFor}
        onClose={() => setVisitOpen(false)}
        onSubmit={(body) => {
          void addVisit({ body: { ...body, salesUserId: body.salesUserId || planFor } })
            .unwrap()
            .then(() => setVisitOpen(false))
            .catch((err) => Alert.alert("Visit failed", apiErrorMessage(err, "Could not create visit")));
        }}
      />
      <WorkFormSheet
        visible={workOpen}
        saving={addWorkState.isLoading}
        planDate={planDate}
        salesUserId={planFor}
        onClose={() => setWorkOpen(false)}
        onSubmit={(body) => {
          void addWork({ body: { ...body, salesUserId: body.salesUserId || planFor } })
            .unwrap()
            .then(() => setWorkOpen(false))
            .catch((err) => Alert.alert("Task failed", apiErrorMessage(err, "Could not create task")));
        }}
      />
      <ReportSheet visible={reportOpen} kind="tasks" scope={team.elevated ? team.scope : "mine"} onClose={() => setReportOpen(false)} />
    </Screen>
  );
}
