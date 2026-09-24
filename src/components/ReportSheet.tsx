import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DatePickerField } from "@/components/DateRangePicker";
import { Empty, Field, Loading } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import {
  buildExpenseReportRows,
  buildPlanReportRows,
  buildTaskReportRows,
  EXPENSE_COLUMNS,
  PLAN_COLUMNS,
  type ReportRow,
  shareExcelReport,
  sharePdfReport,
  TASK_COLUMNS,
} from "@/lib/reportExport";
import { useGetCompanyInfoQuery } from "@/store/api/companyApiSlice";
import { useLazyGetExpensesQuery, useLazyGetPlansQuery } from "@/store/api/workPlannerApiSlice";
import {
  WORK_PLAN_EXPENSE_CATEGORIES,
  WORK_PLAN_EXPENSE_PAYMENT_MODES,
  type WorkPlanExpenseRecord,
  type WorkPlanRecord,
} from "@/types/workPlanner";
import { useThemeColors } from "@/theme";

type Kind = "plans" | "tasks" | "expenses";
type Preset = "all" | "today" | "7d" | "current_month" | "last_month" | "custom";

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "current_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "custom", label: "Custom" },
];

const PLAN_TYPES = ["all", "Visits", "Tasks & Visits", "Leave", "Work From Home", "Work From Office"] as const;

function ymd(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dateRange(preset: Preset, customFrom: string, customTo: string) {
  const now = new Date();
  if (preset === "all") return { from: "", to: "" };
  if (preset === "today") return { from: ymd(now), to: ymd(now) };
  if (preset === "7d") {
    const from = new Date(now);
    from.setDate(now.getDate() - 6);
    return { from: ymd(from), to: ymd(now) };
  }
  if (preset === "current_month") {
    return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  if (preset === "last_month") {
    return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
  }
  return { from: customFrom || ymd(now), to: customTo || ymd(now) };
}

const TITLES: Record<Kind, string> = {
  plans: "Work plans report",
  tasks: "Tasks and visits report",
  expenses: "Expense claims report",
};

export function ReportSheet({
  visible,
  kind,
  scope = "mine",
  onClose,
}: {
  visible: boolean;
  kind: Kind;
  scope?: "mine" | "team";
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const company = useGetCompanyInfoQuery();
  const [fetchPlans] = useLazyGetPlansQuery();
  const [fetchExpenses] = useLazyGetExpensesQuery();
  const [preset, setPreset] = useState<Preset>("all");
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const [planStatus, setPlanStatus] = useState("all");
  const [planType, setPlanType] = useState<(typeof PLAN_TYPES)[number]>("all");
  const [activity, setActivity] = useState<"all" | "visits" | "tasks">("all");
  const [itemStatus, setItemStatus] = useState("all");
  const [expenseStatus, setExpenseStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [paymentMode, setPaymentMode] = useState("all");
  const [search, setSearch] = useState("");
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [plans, setPlans] = useState<WorkPlanRecord[]>([]);
  const [expenses, setExpenses] = useState<WorkPlanExpenseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const range = dateRange(preset, customFrom, customTo);
  const companyName = company.data?.trade_name || company.data?.legal_name || "Work Planner";

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        if (kind === "expenses") {
          const res = await fetchExpenses({
            limit: 1000,
            scope,
            from: range.from || undefined,
            to: range.to || undefined,
            status: expenseStatus === "all" ? undefined : expenseStatus,
            category: category === "all" ? undefined : category,
          }).unwrap();
          if (!cancelled) setExpenses(res.data || []);
          return;
        }
        let page = 1;
        let pages = 1;
        const collected: WorkPlanRecord[] = [];
        do {
          const res = await fetchPlans({
            page,
            limit: 200,
            include_visits: true,
            include_works: true,
            scope,
            from: range.from || undefined,
            to: range.to || undefined,
            ...(kind === "plans" && planStatus !== "all" ? { status: planStatus } : {}),
            ...(kind === "plans" && planType !== "all" ? { plan_type: planType } : {}),
          }).unwrap();
          collected.push(...(res.data || []));
          pages = res.pages || 1;
          page += 1;
        } while (page <= pages && page <= 20);
        if (!cancelled) setPlans(collected);
      } catch {
        if (!cancelled) Alert.alert("Report", "Could not load report data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [visible, kind, scope, preset, customFrom, customTo, planStatus, planType, expenseStatus, category, fetchPlans, fetchExpenses, range.from, range.to]);

  const rows = useMemo((): ReportRow[] => {
    if (kind === "expenses") return buildExpenseReportRows(expenses, paymentMode, search);
    if (kind === "tasks") return buildTaskReportRows(plans, activity, itemStatus, search, "", "");
    return buildPlanReportRows(plans, activity, itemStatus, search);
  }, [kind, expenses, plans, paymentMode, search, activity, itemStatus]);

  const columns = kind === "expenses" ? EXPENSE_COLUMNS : kind === "tasks" ? TASK_COLUMNS : PLAN_COLUMNS;
  const stamp = todayISO();
  const filterPicks = useMemo(() => {
    const datePick = {
      id: "date",
      label: "Date",
      value: PRESETS.find((item) => item.id === preset)?.label || "All dates",
      options: PRESETS.map((item) => ({ id: item.id, label: item.label })),
      onChange: (id: string) => setPreset(id as Preset),
    };
    if (kind === "expenses") {
      return [
        datePick,
        {
          id: "status",
          label: "Status",
          value: expenseStatus === "all" ? "All statuses" : expenseStatus,
          options: ["all", "submitted", "approved", "rejected", "draft"].map((id) => ({ id, label: id === "all" ? "All statuses" : id })),
          onChange: setExpenseStatus,
        },
        {
          id: "category",
          label: "Category",
          value: category === "all" ? "All categories" : category,
          options: [{ id: "all", label: "All categories" }, ...WORK_PLAN_EXPENSE_CATEGORIES.map((name) => ({ id: name, label: name }))],
          onChange: setCategory,
        },
        {
          id: "payment",
          label: "Payment",
          value: paymentMode === "all" ? "All payments" : paymentMode,
          options: [{ id: "all", label: "All payments" }, ...WORK_PLAN_EXPENSE_PAYMENT_MODES.map((name) => ({ id: name, label: name }))],
          onChange: setPaymentMode,
        },
      ];
    }
    const picks = [
      datePick,
      ...(kind === "plans"
        ? [
            {
              id: "planStatus",
              label: "Plan status",
              value: planStatus === "all" ? "All statuses" : planStatus,
              options: ["all", "planned", "completed"].map((id) => ({ id, label: id === "all" ? "All statuses" : id })),
              onChange: setPlanStatus,
            },
            {
              id: "planType",
              label: "Plan type",
              value: planType === "all" ? "All types" : planType,
              options: PLAN_TYPES.map((id) => ({ id, label: id === "all" ? "All types" : id })),
              onChange: (id: string) => setPlanType(id as (typeof PLAN_TYPES)[number]),
            },
          ]
        : []),
      {
        id: "activity",
        label: "Items",
        value: activity === "all" ? "Visits and tasks" : activity === "visits" ? "Visits" : "Tasks",
        options: [
          { id: "all", label: "Visits and tasks" },
          { id: "visits", label: "Visits" },
          { id: "tasks", label: "Tasks" },
        ],
        onChange: (id: string) => setActivity(id as "all" | "visits" | "tasks"),
      },
      {
        id: "itemStatus",
        label: "Item status",
        value: itemStatus === "all" ? "All item statuses" : itemStatus.replace("_", " "),
        options: ["all", "created", "pending", "in_progress", "completed"].map((id) => ({
          id,
          label: id === "all" ? "All item statuses" : id.replace("_", " "),
        })),
        onChange: setItemStatus,
      },
    ];
    return picks;
  }, [kind, preset, expenseStatus, category, paymentMode, planStatus, planType, activity, itemStatus]);

  async function exportReport(format: "excel" | "pdf") {
    if (!rows.length) {
      Alert.alert("Report", "No rows match these filters");
      return;
    }
    setBusy(format);
    try {
      const title = TITLES[kind];
      const subtitle = `${rows.length} rows · ${preset === "custom" ? `${range.from} to ${range.to}` : preset === "all" ? "all dates" : preset.replace("_", " ")}`;
      if (format === "excel") {
        const filename = kind === "expenses" ? `expense_claims_report_${stamp}.xlsx` : kind === "tasks" ? `Tasks_Visits_Report_${stamp}.xlsx` : `work_plans_report_${stamp}.xlsx`;
        await shareExcelReport({
          filename,
          sheetName: kind === "expenses" ? "Expense Claims" : kind === "tasks" ? "Tasks and Visits" : "Work Plans",
          title,
          columns,
          rows,
        });
      } else {
        await sharePdfReport({
          filename: `${kind}_report_${stamp}.pdf`,
          title,
          subtitle,
          company: companyName,
          columns,
          rows,
        });
      }
    } catch (err) {
      Alert.alert("Report", err instanceof Error ? err.message : "Could not create the report");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={{ paddingVertical: 8, paddingRight: 4 }}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>Cancel</Text>
          </Pressable>
          <Text style={{ flex: 1, color: colors.text, fontWeight: "800" }} numberOfLines={1}>{TITLES[kind]}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={loading || busy !== null}
            onPress={() => void exportReport("excel")}
            style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: loading || busy ? 0.5 : 1 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{busy === "excel" ? "Excel…" : "Excel"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={loading || busy !== null}
            onPress={() => void exportReport("pdf")}
            style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, opacity: loading || busy ? 0.5 : 1 }}
          >
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{busy === "pdf" ? "PDF…" : "PDF"}</Text>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 12, paddingTop: 10, gap: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, alignItems: "flex-end" }}>
            {filterPicks.map((pick) => (
              <Pressable
                key={pick.id}
                accessibilityRole="button"
                onPress={() => setOpenFilter((current) => (current === pick.id ? null : pick.id))}
                style={{
                  minWidth: 108,
                  maxWidth: 160,
                  minHeight: 44,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: openFilter === pick.id ? colors.primary : colors.border,
                  backgroundColor: colors.card,
                  paddingHorizontal: 10,
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }}>{pick.label}</Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>{pick.value}</Text>
              </Pressable>
            ))}
            <View style={{ width: 180 }}>
              <Field label="Search" value={search} onChangeText={setSearch} placeholder="Name or notes" />
            </View>
          </ScrollView>
          {openFilter ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {filterPicks.find((pick) => pick.id === openFilter)?.options.map((option) => (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    filterPicks.find((pick) => pick.id === openFilter)?.onChange(option.id);
                    setOpenFilter(null);
                  }}
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {preset === "custom" ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <DatePickerField label="From" value={customFrom} onChange={setCustomFrom} />
              </View>
              <View style={{ flex: 1 }}>
                <DatePickerField label="To" value={customTo} onChange={setCustomTo} />
              </View>
            </View>
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 12 }}>{loading ? "Loading report…" : `${rows.length} rows`}</Text>
        </View>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, padding: 12, paddingBottom: Math.max(insets.bottom, 24) }}>
          {loading ? <Loading /> : null}
          {!loading && rows.length === 0 ? <Empty label="No rows match these filters" /> : null}
          {!loading
            ? rows.map((row, index) => (
                <View key={`${String(row.hierarchyId || row.rowNum || index)}-${String(row.rowType || row.itemType || row.category || index)}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, padding: 12, gap: 2 }}>
                  <Text style={{ color: colors.text, fontWeight: "800" }} numberOfLines={2}>
                    {String(row.activity || row.titleOrParty || row.category || "Row")}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>
                    {[row.date || row.planDate || row.expense_date, row.executive || row.executiveName || row.sales_user, row.rowType || row.itemType, row.status]
                      .filter((part) => part !== undefined && part !== null && part !== "")
                      .join(" · ")}
                  </Text>
                  {row.details || row.descriptionOrNotes || row.description ? (
                    <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>
                      {String(row.details || row.descriptionOrNotes || row.description)}
                    </Text>
                  ) : null}
                </View>
              ))
            : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
