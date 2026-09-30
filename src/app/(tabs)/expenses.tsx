import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import { AppHeader } from "@/components/AppHeader";
import { ReportSheet } from "@/components/ReportSheet";
import { DatePickerField } from "@/components/DateRangePicker";
import { Button, Card, Chip, Empty, Field, FilterBar, Headline, Loading, Screen, SplitActions } from "@/components/ui";
import { RejectSheet } from "@/components/sheets";
import { apiErrorMessage } from "@/lib/apiError";
import { formatPlanDate, personName } from "@/lib/dates";
import { WORK_PLANNER_SERVICE_URL } from "@/lib/env";
import { useSession } from "@/lib/session";
import {
  useApproveExpenseMutation,
  useGetExpensesQuery,
  useRejectExpenseMutation,
} from "@/store/api/workPlannerApiSlice";
import type { WorkPlanExpenseAttachment } from "@/types/workPlanner";
import { isWpElevated } from "@/utils/roles";
import { useStatusColors, useThemeColors } from "@/theme";

const STATUSES = [
  { id: "all", label: "All" },
  { id: "submitted", label: "Submitted" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "draft", label: "Draft" },
] as const;

function planIdOf(expense: { work_plan?: unknown; work_plan_id?: string }) {
  if (expense.work_plan_id) return expense.work_plan_id;
  if (typeof expense.work_plan === "string") return expense.work_plan;
  if (expense.work_plan && typeof expense.work_plan === "object") {
    const plan = expense.work_plan as { _id?: string; id?: string };
    return String(plan._id || plan.id || "");
  }
  return "";
}

function money(amount: number) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function receiptLink(file: WorkPlanExpenseAttachment | string | null | undefined, token?: string) {
  if (!file) return null;
  if (typeof file === "string") {
    if (file.startsWith("http")) return file;
    const base = `${WORK_PLANNER_SERVICE_URL}/api/work-planner/attachments/${file}/view`;
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }
  if (file.url) return file.url;
  if (!file._id) return null;
  const base = `${WORK_PLANNER_SERVICE_URL}/api/work-planner/attachments/${file._id}/view`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export default function ExpensesScreen() {
  const colors = useThemeColors();
  const statusColor = useStatusColors();
  const { session } = useSession();
  const elevated = isWpElevated(session?.user);
  const params = useLocalSearchParams<{ status?: string; scope?: string; from?: string; to?: string }>();
  const [status, setStatus] = useState<(typeof STATUSES)[number]["id"]>("all");
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<{ planId: string; expenseId: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const query = useGetExpensesQuery({
    page,
    limit: 20,
    status: status === "all" ? undefined : status,
    from: from || undefined,
    to: to || undefined,
    scope: elevated ? scope : "mine",
  });
  useEffect(() => {
    const nextStatus = Array.isArray(params.status) ? params.status[0] : params.status;
    const nextScope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
    const nextFrom = Array.isArray(params.from) ? params.from[0] : params.from;
    const nextTo = Array.isArray(params.to) ? params.to[0] : params.to;
    if (nextStatus && STATUSES.some((item) => item.id === nextStatus)) {
      setStatus(nextStatus as (typeof STATUSES)[number]["id"]);
      setPage(1);
    }
    if (elevated && (nextScope === "mine" || nextScope === "team")) {
      setScope(nextScope);
      setPage(1);
    }
    if (typeof nextFrom === "string") setFrom(nextFrom);
    if (typeof nextTo === "string") setTo(nextTo);
  }, [params.status, params.scope, params.from, params.to, elevated]);

  const [approve] = useApproveExpenseMutation();
  const [reject, rejectState] = useRejectExpenseMutation();
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data?.data || []).filter((expense) => {
      if (!needle) return true;
      return `${expense.category} ${expense.sub_category || ""} ${expense.description || ""} ${personName(expense.sales_user)}`
        .toLowerCase()
        .includes(needle);
    });
  }, [query.data, search]);
  const pageTotal = (query.data?.data || []).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

  return (
    <Screen>
      <AppHeader title="Expenses" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, color: colors.muted, fontSize: 12 }}>
          {elevated && scope === "team"
            ? "Review, approve, and reject team expense claims."
            : "Track your field expense claims and reimbursements."}
        </Text>
        <Button label="Download" variant="ghost" onPress={() => setReportOpen(true)} />
      </View>
      {elevated ? (
        <FilterBar>
          <Chip label="My expenses" active={scope === "mine"} onPress={() => { setScope("mine"); setPage(1); }} />
          <Chip label="Team expenses" active={scope === "team"} onPress={() => { setScope("team"); setPage(1); }} />
        </FilterBar>
      ) : null}
      <FilterBar>
        {STATUSES.map((item) => (
          <Chip key={item.id} label={item.label} active={status === item.id} onPress={() => { setStatus(item.id); setPage(1); }} />
        ))}
      </FilterBar>
      <Field label="Search" value={search} onChangeText={setSearch} placeholder="Category, description, person" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <DatePickerField label="From" value={from} onChange={(value) => { setFrom(value); setPage(1); }} />
        </View>
        <View style={{ flex: 1 }}>
          <DatePickerField label="To" value={to} onChange={(value) => { setTo(value); setPage(1); }} />
        </View>
      </View>
      {from || to ? (
        <View style={{ alignItems: "flex-start" }}>
          <Button label="Clear dates" variant="ghost" onPress={() => { setFrom(""); setTo(""); setPage(1); }} />
        </View>
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {query.data?.total || 0} claims · this page {money(pageTotal)}
      </Text>
      {query.isLoading ? <Loading /> : null}
      {query.isError ? <Text style={{ color: colors.danger }}>Could not load expenses.</Text> : null}
      {!query.isLoading && rows.length === 0 ? <Empty label="No expense claims" /> : null}
      {rows.map((expense) => {
        const expenseId = String(expense._id || expense.id || "");
        const planId = planIdOf(expense);
        const isPrivateBike = expense.category === "Travel" && expense.sub_category === "Private Bike";
        const totalKm = expense.total_km != null
          ? expense.total_km
          : expense.closing_reading != null && expense.start_reading != null
            ? Math.max(0, expense.closing_reading - expense.start_reading)
            : null;

        const allAttachments: (any)[] = [];
        if (expense.attachments && Array.isArray(expense.attachments) && expense.attachments.length > 0) {
          allAttachments.push(...expense.attachments);
        } else if (expense.receipt_attachment) {
          allAttachments.push(expense.receipt_attachment);
        }

        return (
          <Card key={expenseId}>
            <Headline
              title={`${expense.category}${expense.sub_category ? ` · ${expense.sub_category}` : ""}`}
              meta={[formatPlanDate(expense.expense_date), personName(expense.sales_user), expense.payment_mode].filter(Boolean).join(" · ")}
              memberName={personName(expense.sales_user) || undefined}
              status={expense.status}
              statusColor={statusColor[expense.status]}
            />
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{money(expense.amount)}</Text>
            {expense.description ? <Text style={{ color: colors.muted }}>{expense.description}</Text> : null}

            {isPrivateBike && (expense.start_reading != null || expense.closing_reading != null) ? (
              <View style={{ backgroundColor: "#0284c715", borderWidth: 1, borderColor: "#38bdf840", borderRadius: 8, padding: 8, gap: 2 }}>
                <Text style={{ color: "#0284c7", fontSize: 11, fontWeight: "700" }}>🚲 Private Bike Mileage (₹3.50 / KM)</Text>
                <Text style={{ color: colors.text, fontSize: 12 }}>
                  {expense.start_reading ?? "—"} KM → {expense.closing_reading ?? "—"} KM
                  {totalKm != null ? ` (${totalKm} KM = ₹${(totalKm * 3.5).toFixed(2)})` : ""}
                </Text>
              </View>
            ) : null}

            {expense.vendor_name || expense.bill_number ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {[expense.vendor_name, expense.bill_number ? `Bill #${expense.bill_number}` : ""].filter(Boolean).join(" · ")}
              </Text>
            ) : null}

            {allAttachments.length > 0 ? (
              <View style={{ gap: 4 }}>
                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>Attachments ({allAttachments.length}):</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {allAttachments.map((att, idx) => {
                    const url = receiptLink(att, session?.token);
                    const name = typeof att === "object" ? att.original_name || att.file_name || `Receipt ${idx + 1}` : `Receipt ${idx + 1}`;
                    return (
                      <Pressable
                        key={idx}
                        onPress={() => {
                          if (url) {
                            void Linking.openURL(url).catch(() => Alert.alert("Receipt", "Could not open this document."));
                          }
                        }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
                      >
                        <Ionicons name="document-attach-outline" size={13} color={colors.primary} />
                        <Text numberOfLines={1} style={{ fontSize: 11, color: colors.primary, fontWeight: "600", maxWidth: 160 }}>
                          {name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {expense.rejection_reason ? <Text style={{ color: colors.danger }}>{expense.rejection_reason}</Text> : null}

            {elevated && expense.status === "submitted" && planId ? (
              <SplitActions>
                <Button
                  label="Approve"
                  onPress={() =>
                    void approve({ planId, expenseId })
                      .unwrap()
                      .catch((err) => Alert.alert("Approve failed", apiErrorMessage(err, "Could not approve")))
                  }
                />
                <Button label="Reject" variant="danger" onPress={() => setRejecting({ planId, expenseId })} />
              </SplitActions>
            ) : null}
          </Card>
        );
      })}
      <SplitActions>
        <Button label="Previous" variant="ghost" disabled={page <= 1} onPress={() => setPage((current) => Math.max(1, current - 1))} />
        <Button
          label={`${page} / ${query.data?.pages || 1}`}
          variant="ghost"
          disabled={page >= (query.data?.pages || 1)}
          onPress={() => setPage((current) => current + 1)}
        />
      </SplitActions>
      <RejectSheet
        visible={Boolean(rejecting)}
        saving={rejectState.isLoading}
        onClose={() => setRejecting(null)}
        onSubmit={(reason) => {
          if (!rejecting) return;
          void reject({ ...rejecting, rejection_reason: reason })
            .unwrap()
            .then(() => setRejecting(null))
            .catch((err) => Alert.alert("Reject failed", apiErrorMessage(err, "Could not reject")));
        }}
      />
      <ReportSheet visible={reportOpen} kind="expenses" scope={elevated ? scope : "mine"} onClose={() => setReportOpen(false)} />
    </Screen>
  );
}
