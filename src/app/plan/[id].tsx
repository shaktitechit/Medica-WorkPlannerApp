import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import { Button, Card, Empty, Headline, Loading, Screen, Section, SplitActions } from "@/components/ui";
import { DayEndMailPreview, ExpenseFormSheet, MailSheet, RejectSheet, Sheet, VisitFormSheet, WorkFormSheet, CopyPlanSheet, toFormFile, type LocalFile } from "@/components/sheets";
import { WORK_PLANNER_SERVICE_URL } from "@/lib/env";
import { StatusSheet, type CompleteVisitAnswers, type WorkflowStatus } from "@/components/StatusSheet";
import { apiErrorMessage } from "@/lib/apiError";
import { formatPlanDate, isPlanWindowClosed, personId, personName, stripHtml } from "@/lib/dates";
import { buildDayEndMailHtml, type DayEndMailSummary } from "@/lib/planMail";
import { useSession } from "@/lib/session";
import {
  useAddExpenseMutation,
  useAddVisitMutation,
  useAddWorkMutation,
  useUpdateExpenseMutation,
  useApproveExpenseMutation,
  useCompletePlanMutation,
  useCompleteVisitMutation,
  useDeletePlanMutation,
  useGetEligibleManagersQuery,
  useGetPlanQuery,
  useGetUserSettingsQuery,
  useLazyGetDayEndDraftQuery,
  useRejectExpenseMutation,
  useSubmitAllExpensesMutation,
  useSubmitExpenseMutation,
  useUpdateVisitMutation,
  useUpdateWorkMutation,
  useUploadExpenseReceiptMutation,
  useUploadWorkPlanAttachmentMutation,
} from "@/store/api/workPlannerApiSlice";
import type { WorkPlanDayEnd, WorkPlanDayEndAttachment, WorkPlanExpenseRecord, WorkPlanRecord, WorkPlanVisitRecord, WorkPlanWorkRecord } from "@/types/workPlanner";
import { isWpElevated, isWpManager } from "@/utils/roles";
import { useStatusColors, useThemeColors } from "@/theme";

function idOf(item: { _id?: string; id?: string }) {
  return String(item._id || item.id || "");
}

function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType?: string, fileName?: string): keyof typeof Ionicons.glyphMap {
  const mime = (mimeType || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "document-text-outline";
  if (mime.includes("image") || /\.(png|jpe?g|webp)$/.test(name)) return "image-outline";
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv") || /\.(xlsx?|csv)$/.test(name)) return "grid-outline";
  return "document-outline";
}

function attachmentUrl(file: WorkPlanDayEndAttachment, token?: string) {
  const base = file._id
    ? `${WORK_PLANNER_SERVICE_URL}/api/work-planner/attachments/${file._id}/view`
    : file.url || "";
  if (!base || !token || base.includes("token=")) return base;
  return `${base}${base.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

function sentAtLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function DayEndMailCard({ dayEnd, token }: { dayEnd: WorkPlanDayEnd; token?: string }) {
  const colors = useThemeColors();
  const files = dayEnd.attachments || [];
  return (
    <View style={{ gap: 10 }}>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 6, backgroundColor: colors.cardAlt }}>
        <Text style={{ color: colors.muted }}>From: <Text style={{ color: colors.text, fontWeight: "600" }}>{dayEnd.from_email || "Executive"}</Text></Text>
        <Text style={{ color: colors.muted }}>To: <Text style={{ color: colors.success, fontWeight: "700" }}>{dayEnd.to_email || "Manager"}</Text></Text>
        {dayEnd.cc_emails && dayEnd.cc_emails.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <Text style={{ color: colors.muted }}>Cc:</Text>
            {dayEnd.cc_emails.map((email) => (
              <View key={email} style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.card }}>
                <Ionicons name="people-outline" size={12} color={colors.muted} />
                <Text style={{ color: colors.text, fontSize: 12 }}>{email}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={{ color: colors.muted }}>Subject: <Text style={{ color: colors.text, fontWeight: "800" }}>{dayEnd.subject || "Day End Report"}</Text></Text>
      </View>
      {files.length > 0 ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="attach-outline" size={16} color={colors.muted} />
            <Text style={{ color: colors.text, fontWeight: "700" }}>Attached files ({files.length})</Text>
          </View>
          {files.map((file) => (
            <Pressable
              key={file._id || file.original_name || file.file_name}
              onPress={() => {
                const url = attachmentUrl(file, token);
                if (!url) return;
                void Linking.openURL(url).catch(() => Alert.alert("Attachment", "Could not open this file"));
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10 }}
            >
              <Ionicons name={fileIcon(file.mime_type, file.original_name || file.file_name)} size={18} color={colors.primary} />
              <Text style={{ color: colors.text, fontWeight: "600", flex: 1 }}>{file.original_name || file.file_name || "File"}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{formatFileSize(file.size)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function toDayEndSummary(plan: WorkPlanRecord, executiveName: string, fromEmail: string): DayEndMailSummary {
  const planType = plan.plan_type || "Visits";
  const dateLabel = new Date(plan.plan_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return {
    executiveName,
    fromEmail,
    planDate: dateLabel,
    planType,
    location: plan.location || "",
    expensesTotal: (plan.expenses || []).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0),
    remarks: stripHtml(plan.remarks),
    visits: (plan.visits || []).map((visit) => ({
      party_name: (typeof visit.party === "object" ? visit.party?.party_name : "") || visit.party_name || visit.contact_person,
      contact_person: visit.contact_person || (typeof visit.party === "object" ? visit.party?.contact_person : ""),
      purpose: visit.purpose,
      status: visit.status,
      planned_start_time: visit.planned_start_time,
      planned_end_time: visit.planned_end_time,
      outcome: stripHtml(visit.outcome),
      pending_remarks: stripHtml(visit.pending_remarks),
      in_progress_remarks: stripHtml(visit.in_progress_remarks),
      meeting_with_doctor: visit.meeting_with_doctor,
      meeting_with_purchase: visit.meeting_with_purchase,
      meeting_with_finance: visit.meeting_with_finance,
      meeting_with_engineer: visit.meeting_with_engineer,
      new_product_introduced: visit.new_product_introduced,
      order_received: visit.order_received,
    })),
    tasks: (plan.works || []).map((work) => ({
      title: work.title,
      description: stripHtml(work.description),
      status: work.status,
      pending_remarks: stripHtml(work.pending_remarks),
      in_progress_remarks: stripHtml(work.in_progress_remarks),
      completion_remarks: stripHtml(work.completion_remarks),
      outcome: stripHtml(work.outcome),
    })),
  };
}

export default function PlanDetailScreen() {
  const colors = useThemeColors();
  const statusColor = useStatusColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const planId = String(id || "");
  const { session } = useSession();
  const elevated = isWpElevated(session?.user);
  const manager = isWpManager(session?.user);
  const planQuery = useGetPlanQuery(planId, { skip: !planId });
  const plan = planQuery.data;
  const ownerId = personId(plan?.sales_user) || personId(session?.user);
  const settings = useGetUserSettingsQuery(ownerId, { skip: !ownerId });
  const managers = useGetEligibleManagersQuery();
  const completed = plan?.status === "completed";
  const dateLocked = Boolean(plan && isPlanWindowClosed(plan.plan_date));
  const canEditPlan = Boolean(plan) && !completed && !dateLocked;

  const [updateVisit, visitState] = useUpdateVisitMutation();
  const [completeVisit, completeState] = useCompleteVisitMutation();
  const [updateWork, workState] = useUpdateWorkMutation();
  const [addExpense, addExpenseState] = useAddExpenseMutation();
  const [updateExpense, updateExpenseState] = useUpdateExpenseMutation();
  const [submitExpense] = useSubmitExpenseMutation();
  const [approveExpense] = useApproveExpenseMutation();
  const [rejectExpense, rejectState] = useRejectExpenseMutation();
  const [submitAll] = useSubmitAllExpensesMutation();
  const [uploadReceipt] = useUploadExpenseReceiptMutation();
  const [uploadAttachment] = useUploadWorkPlanAttachmentMutation();
  const [completePlan, completePlanState] = useCompletePlanMutation();
  const [loadDraft] = useLazyGetDayEndDraftQuery();
  const [removePlan] = useDeletePlanMutation();

  const [statusTarget, setStatusTarget] = useState<
    | { type: "visit"; item: WorkPlanVisitRecord }
    | { type: "work"; item: WorkPlanWorkRecord }
    | null
  >(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<WorkPlanExpenseRecord | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [visitOpen, setVisitOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [addVisit, addVisitState] = useAddVisitMutation();
  const [addWork, addWorkState] = useAddWorkMutation();
  const [dayEndOpen, setDayEndOpen] = useState(false);
  const [dayEndViewOpen, setDayEndViewOpen] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(true);
  const [draft, setDraft] = useState<{ to: string; cc: string; subject: string; body: string; dayEnd: DayEndMailSummary | null }>({
    to: "",
    cc: "",
    subject: "",
    body: "",
    dayEnd: null,
  });

  async function saveStatus(payload: { status: WorkflowStatus; remarks: string; visitAnswers?: CompleteVisitAnswers }) {
    if (!statusTarget || !plan) return;
    if (plan.status === "completed" || isPlanWindowClosed(plan.plan_date)) {
      Alert.alert("Read only", plan.status === "completed" ? "This work plan is completed." : "The 3-day window has closed.");
      return;
    }
    const itemId = idOf(statusTarget.item);
    try {
      if (statusTarget.type === "visit") {
        if (payload.status === "completed") {
          await completeVisit({ planId, visitId: itemId, body: { outcome: payload.remarks, ...(payload.visitAnswers || {}) } }).unwrap();
        } else if (payload.status === "pending") {
          await updateVisit({ planId, visitId: itemId, body: { status: "pending", pending_remarks: payload.remarks } }).unwrap();
        } else {
          await updateVisit({ planId, visitId: itemId, body: { status: "in_progress", in_progress_remarks: payload.remarks } }).unwrap();
        }
      } else if (payload.status === "completed") {
        await updateWork({ planId, workId: itemId, body: { status: "completed", completion_remarks: payload.remarks, outcome: payload.remarks } }).unwrap();
      } else if (payload.status === "pending") {
        await updateWork({ planId, workId: itemId, body: { status: "pending", pending_remarks: payload.remarks } }).unwrap();
      } else {
        await updateWork({ planId, workId: itemId, body: { status: "in_progress", in_progress_remarks: payload.remarks } }).unwrap();
      }
      setStatusTarget(null);
    } catch (err) {
      Alert.alert("Status update failed", apiErrorMessage(err, "Could not update status"));
    }
  }

  async function saveExpense(body: Record<string, unknown>, file: LocalFile | null) {
    try {
      let receipt: string | undefined;
      if (file) {
        const form = new FormData();
        form.append("file", toFormFile(file), file.name);
        const uploaded = await uploadReceipt(form).unwrap();
        receipt = uploaded?._id || uploaded?.id;
      }
      const payload = { ...body, ...(receipt ? { receipt_attachment: receipt } : {}) };
      if (editingExpense) {
        await updateExpense({ planId, expenseId: idOf(editingExpense), body: payload }).unwrap();
      } else {
        await addExpense({ planId, body: payload }).unwrap();
      }
      setExpenseOpen(false);
      setEditingExpense(null);
    } catch (err) {
      Alert.alert("Expense failed", apiErrorMessage(err, "Could not save expense"));
    }
  }

  async function openDayEnd() {
    if (!plan) return;
    const type = plan.plan_type || "Visits";
    const remarked = (status?: string) => ["pending", "in_progress", "completed"].includes(status || "");
    const visitOk = (plan.visits || []).length > 0 && (plan.visits || []).every((visit) => remarked(visit.status));
    const taskOk = (plan.works || []).length > 0 && (plan.works || []).every((work) => remarked(work.status));
    const ready = type === "Tasks & Visits" ? visitOk && taskOk : type === "Work From Home" || type === "Work From Office" ? taskOk : type === "Leave" ? false : visitOk;
    if (!ready) {
      Alert.alert("Day end", "Add a status remark on every visit and task before day end.");
      return;
    }
    try {
      const next = await loadDraft(planId).unwrap();
      const executiveName = personName(plan.sales_user) || session?.user?.name || "Executive";
      const fromEmail =
        next.from_email ||
        (typeof plan.sales_user === "object" ? plan.sales_user?.email : "") ||
        session?.user?.email ||
        "";
      const planType = plan.plan_type || "Visits";
      const dateLabel = new Date(plan.plan_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const pts = settings.data?.planTypeSettings?.[planType];
      const discussedEmail = typeof plan.discussed_manager_id === "object" ? plan.discussed_manager_id?.email || "" : "";
      const to =
        pts?.assignedManagerEmail ||
        settings.data?.assignedManagerEmail ||
        next.to ||
        discussedEmail ||
        managers.data?.find((manager: { email?: string }) => manager.email)?.email ||
        "";
      const configured = (pts?.ccEmails?.length ? pts.ccEmails : settings.data?.ccEmails) || [];
      const skip = new Set([to, fromEmail].map((email) => String(email || "").toLowerCase()));
      const cc = [...configured, ...(next.cc || [])]
        .map((email: string) => String(email || "").trim().toLowerCase())
        .filter((email: string) => email && !skip.has(email));
      const dayEnd = toDayEndSummary(plan, executiveName, fromEmail);
      setDraft({
        to,
        cc: [...new Set(cc)].join(", "),
        subject: next.subject || `Day End Report — ${executiveName} (${dateLabel})`,
        body: buildDayEndMailHtml(dayEnd),
        dayEnd,
      });
      setDayEndOpen(true);
    } catch (err) {
      Alert.alert("Day end", apiErrorMessage(err, "Could not load the day-end draft"));
    }
  }

  async function sendDayEnd(payload: { toEmail: string; cc: string; subject: string; body: string; files: LocalFile[] }) {
    try {
      const attachmentIds: string[] = [];
      for (const file of payload.files) {
        const form = new FormData();
        form.append("file", toFormFile(file), file.name);
        form.append("resourceId", planId);
        const uploaded = await uploadAttachment(form).unwrap();
        if (uploaded?._id) attachmentIds.push(uploaded._id);
      }
      await completePlan({
        id: planId,
        body: {
          to_email: payload.toEmail,
          cc_emails: payload.cc.split(",").map((item) => item.trim()).filter(Boolean),
          subject: payload.subject,
          body_html: payload.body.trim().startsWith("<") ? payload.body : `<div>${payload.body.replace(/\n/g, "<br/>")}</div>`,
          attachment_ids: attachmentIds,
        },
      }).unwrap();
      setDayEndOpen(false);
      Alert.alert("Day end sent");
    } catch (err) {
      Alert.alert("Day end failed", apiErrorMessage(err, "Could not complete the plan"));
    }
  }

  if (planQuery.isLoading) return <Screen header><Loading /></Screen>;
  if (!plan) return <Screen header><Empty label="Plan not found" /></Screen>;

  const canApproveExpenses = manager || elevated;
  const visits = plan.visits || [];
  const works = plan.works || [];
  const planType = plan.plan_type || "Visits";
  const leavePlan = planType === "Leave";
  const visitsPlan = planType === "Visits" || planType === "Tasks & Visits";
  const taskPlan = planType === "Work From Home" || planType === "Work From Office" || planType === "Tasks & Visits";
  const hasRemarkStatus = (status?: string) => ["pending", "in_progress", "completed"].includes(status || "");
  const visitsReady = visits.length > 0 && visits.every((visit) => hasRemarkStatus(visit.status));
  const tasksReady = works.length > 0 && works.every((work) => hasRemarkStatus(work.status));
  const remarksReady =
    planType === "Tasks & Visits"
      ? visitsReady && tasksReady
      : visitsPlan
        ? visitsReady
        : taskPlan
          ? tasksReady
          : (visits.length === 0 && works.length === 0) ||
            (visits.every((visit) => hasRemarkStatus(visit.status)) && works.every((work) => hasRemarkStatus(work.status)));
  const planned = plan.status === "planned" || plan.status === "approved" || plan.status === "draft";
  const canDayEnd = !leavePlan && planned && canEditPlan && remarksReady;
  const completedVisits = visits.filter((visit) => visit.status === "completed").length;
  const completedTasks = works.filter((work) => work.status === "completed").length;
  const expenseTotal = (plan.expenses || []).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const storedDayEnd = plan.day_end;
  const dayEndRecord =
    storedDayEnd && (storedDayEnd.completed_at || storedDayEnd.subject || storedDayEnd.to_email || storedDayEnd.body_html)
      ? storedDayEnd
      : undefined;
  const sentLabel = sentAtLabel(dayEndRecord?.completed_at);
  const report = toDayEndSummary(
    plan,
    personName(plan.sales_user) || session?.user?.name || "Executive",
    dayEndRecord?.from_email || (typeof plan.sales_user === "object" ? plan.sales_user?.email : "") || session?.user?.email || "",
  );
  const dayEndHint = !remarksReady
    ? planType === "Tasks & Visits"
      ? "Update every visit and task to pending, in progress, or completed before day end."
      : taskPlan
        ? "Update every task to pending, in progress, or completed before day end."
        : "Update every visit to pending, in progress, or completed before day end."
    : "";

  return (
    <Screen header>
      <Headline
        title={formatPlanDate(plan.plan_date)}
        meta={[plan.plan_type || "Visits", plan.location || "No location", personName(plan.sales_user)].filter(Boolean).join(" · ")}
        memberName={personName(plan.sales_user) || undefined}
        status={plan.status}
        statusColor={statusColor[plan.status]}
      />
      {plan.remarks ? <Text style={{ color: colors.text }}>{stripHtml(plan.remarks)}</Text> : null}
      {completed ? (
        <Text style={{ color: colors.warning }}>This work plan is completed and is read only.</Text>
      ) : dateLocked ? (
        <Text style={{ color: colors.warning }}>
          The 3-day window has closed. Visits, tasks, and plan details can no longer be changed.
        </Text>
      ) : null}
      <SplitActions>
        {!completed && !leavePlan ? (
          <Button label="Day end" disabled={!canDayEnd} onPress={() => void openDayEnd()} />
        ) : null}
        {canEditPlan ? (
          <Button label="Edit" variant="ghost" onPress={() => router.push({ pathname: "/plan/form", params: { edit: planId } })} />
        ) : null}
        <Button label="Copy" variant="ghost" onPress={() => setCopyOpen(true)} />
        {canEditPlan ? (
          <Button
            label="Delete"
            variant="danger"
            onPress={() =>
              Alert.alert("Delete plan", "Delete this work plan?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => {
                    void removePlan(planId).unwrap().then(() => router.back()).catch((err) => Alert.alert("Delete failed", apiErrorMessage(err, "Could not delete")));
                  },
                },
              ])
            }
          />
        ) : null}
      </SplitActions>

      {visitsPlan ? (
        <>
          <Section>Visits</Section>
          {canEditPlan ? <Button label="Add visit" onPress={() => setVisitOpen(true)} /> : null}
        </>
      ) : null}
      {visitsPlan && (plan.visits || []).length === 0 ? <Empty label="No visits" /> : null}
      {visitsPlan ? (plan.visits || []).map((visit) => (
        <Card key={idOf(visit)}>
          <Headline title={visit.party_name || "Visit"} meta={visit.purpose} status={visit.status} statusColor={statusColor[visit.status]} />
          {visit.pending_remarks ? <Text style={{ color: colors.muted }}>Pending: {stripHtml(visit.pending_remarks)}</Text> : null}
          {visit.in_progress_remarks ? <Text style={{ color: colors.muted }}>In progress: {stripHtml(visit.in_progress_remarks)}</Text> : null}
          {visit.outcome ? <Text style={{ color: colors.muted }}>Outcome: {stripHtml(visit.outcome)}</Text> : null}
          {canEditPlan && !hasRemarkStatus(visit.status) ? (
            <Text style={{ color: colors.warning }}>Add a status remark before day end.</Text>
          ) : null}
          {canEditPlan ? <Button label="Update status" variant="ghost" onPress={() => setStatusTarget({ type: "visit", item: visit })} /> : null}
        </Card>
      )) : null}

      {taskPlan ? (
        <>
          <Section>Tasks</Section>
          {canEditPlan ? <Button label="Add task" onPress={() => setWorkOpen(true)} /> : null}
        </>
      ) : null}
      {taskPlan && (plan.works || []).length === 0 ? <Empty label="No tasks" /> : null}
      {taskPlan ? (plan.works || []).map((work) => (
        <Card key={idOf(work)}>
          <Headline title={work.title} meta={work.description} status={work.status} statusColor={statusColor[work.status]} />
          {work.pending_remarks ? <Text style={{ color: colors.muted }}>Pending: {stripHtml(work.pending_remarks)}</Text> : null}
          {work.in_progress_remarks ? <Text style={{ color: colors.muted }}>In progress: {stripHtml(work.in_progress_remarks)}</Text> : null}
          {work.completion_remarks || work.outcome ? (
            <Text style={{ color: colors.muted }}>Completed: {stripHtml(work.completion_remarks || work.outcome)}</Text>
          ) : null}
          {canEditPlan && !hasRemarkStatus(work.status) ? (
            <Text style={{ color: colors.warning }}>Add a status remark before day end.</Text>
          ) : null}
          {canEditPlan ? <Button label="Update status" variant="ghost" onPress={() => setStatusTarget({ type: "work", item: work })} /> : null}
        </Card>
      )) : null}

      <Section>Expenses</Section>
      {elevated || !dateLocked ? (
        <SplitActions>
          <Button
            label="Add expense"
            onPress={() => {
              setEditingExpense(null);
              setExpenseOpen(true);
            }}
          />
          <Button label="Submit drafts" variant="ghost" onPress={() => void submitAll({ planId }).unwrap().catch((err) => Alert.alert("Submit failed", apiErrorMessage(err, "Could not submit")))} />
        </SplitActions>
      ) : (
        <Text style={{ color: colors.muted }}>Expenses can only be added during the 3-day window.</Text>
      )}
      {(plan.expenses || []).map((expense: WorkPlanExpenseRecord) => {
        const expenseId = idOf(expense);
        return (
          <Card key={expenseId}>
            <Headline
              title={`${expense.category} · ${expense.amount}`}
              meta={expense.description}
              status={expense.status}
              statusColor={statusColor[expense.status]}
            />
            <SplitActions>
              {expense.status === "draft" && (elevated || !dateLocked) ? (
                <Button
                  label="Edit"
                  variant="ghost"
                  onPress={() => {
                    setEditingExpense(expense);
                    setExpenseOpen(true);
                  }}
                />
              ) : null}
              {expense.status === "draft" && (elevated || !dateLocked) ? (
                <Button label="Submit" variant="ghost" onPress={() => void submitExpense({ planId, expenseId }).unwrap().catch((err) => Alert.alert("Submit failed", apiErrorMessage(err, "Could not submit")))} />
              ) : null}
              {canApproveExpenses && expense.status === "submitted" ? (
                <Button label="Approve" onPress={() => void approveExpense({ planId, expenseId }).unwrap().catch((err) => Alert.alert("Approve failed", apiErrorMessage(err, "Could not approve")))} />
              ) : null}
              {canApproveExpenses && expense.status === "submitted" ? (
                <Button label="Reject" variant="danger" onPress={() => setRejectId(expenseId)} />
              ) : null}
            </SplitActions>
          </Card>
        );
      })}

      {leavePlan ? null : (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#ecfdf5" }}>
              <Ionicons name="mail-outline" size={18} color={colors.success} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>Day End Report</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {completed
                  ? "Official day end report submitted and dispatched to management"
                  : "Complete your day activities and dispatch the official email report"}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: completed ? "#ecfdf5" : "#fffbeb" }}>
              <Text style={{ color: completed ? colors.success : colors.warning, fontSize: 12, fontWeight: "700" }}>
                {completed ? `Day end completed${sentLabel ? ` · ${sentLabel}` : ""}` : "Pending day end submission"}
              </Text>
            </View>
            {dayEndRecord ? <Button label="View email" variant="ghost" onPress={() => setDayEndViewOpen(true)} /> : null}
          </View>

          {dayEndRecord ? (
            <View style={{ gap: 10 }}>
              <DayEndMailCard dayEnd={dayEndRecord} token={session?.token} />
              <Pressable
                onPress={() => setBodyExpanded((open) => !open)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
              >
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>EMAIL BODY</Text>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{bodyExpanded ? "Hide body" : "View body"}</Text>
              </Pressable>
              {bodyExpanded ? <DayEndMailPreview summary={report} /> : null}
            </View>
          ) : completed ? (
            <Text style={{ color: colors.muted }}>
              This work plan was marked as completed. The day end email was not captured for plans completed before this update.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {visits.length > 0 ? (
                  <View style={{ flexGrow: 1, minWidth: 140, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.cardAlt }}>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>Field visits</Text>
                    <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{completedVisits}<Text style={{ color: colors.muted, fontSize: 12, fontWeight: "500" }}> / {visits.length} completed</Text></Text>
                  </View>
                ) : null}
                {works.length > 0 ? (
                  <View style={{ flexGrow: 1, minWidth: 140, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.cardAlt }}>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>Tasks</Text>
                    <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{completedTasks}<Text style={{ color: colors.muted, fontSize: 12, fontWeight: "500" }}> / {works.length} completed</Text></Text>
                  </View>
                ) : null}
                <View style={{ flexGrow: 1, minWidth: 140, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.cardAlt }}>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Logged expenses</Text>
                  <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>₹{expenseTotal.toLocaleString("en-IN")}</Text>
                </View>
              </View>
              <View style={{ borderWidth: 1, borderColor: "#a7f3d0", borderRadius: 12, padding: 12, gap: 8, backgroundColor: "#f0fdf4" }}>
                <Text style={{ color: colors.success, fontWeight: "800" }}>Ready to wrap up today's work?</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Submit the day end report to review visits and tasks, attach files, and email your manager.
                </Text>
                {dateLocked ? (
                  <Text style={{ color: colors.warning, fontSize: 12 }}>The 3-day window has closed, so day end can no longer be submitted.</Text>
                ) : dayEndHint ? (
                  <Text style={{ color: colors.warning, fontSize: 12 }}>{dayEndHint}</Text>
                ) : null}
                <Button label="Submit day end report" disabled={!canDayEnd} onPress={() => void openDayEnd()} />
              </View>
            </View>
          )}
        </Card>
      )}

      <StatusSheet
        visible={Boolean(statusTarget)}
        itemType={statusTarget?.type || "visit"}
        initialStatus={statusTarget?.item.status}
        initialPendingRemarks={statusTarget?.item.pending_remarks}
        initialInProgressRemarks={statusTarget?.item.in_progress_remarks}
        initialOutcome={
          statusTarget?.type === "visit"
            ? statusTarget.item.outcome
            : statusTarget?.type === "work"
              ? statusTarget.item.completion_remarks || statusTarget.item.outcome
              : ""
        }
        initialAnswers={
          statusTarget?.type === "visit"
            ? {
                meeting_with_doctor: statusTarget.item.meeting_with_doctor,
                meeting_with_purchase: statusTarget.item.meeting_with_purchase,
                meeting_with_finance: statusTarget.item.meeting_with_finance,
                meeting_with_engineer: statusTarget.item.meeting_with_engineer,
                new_product_introduced: statusTarget.item.new_product_introduced,
                order_received: statusTarget.item.order_received,
              }
            : undefined
        }
        saving={visitState.isLoading || completeState.isLoading || workState.isLoading}
        onClose={() => setStatusTarget(null)}
        onConfirm={(payload) => void saveStatus(payload)}
      />
      <VisitFormSheet
        visible={visitOpen}
        saving={addVisitState.isLoading}
        planDate={String(plan.plan_date).slice(0, 10)}
        salesUserId={ownerId}
        onClose={() => setVisitOpen(false)}
        onSubmit={(body) => {
          void addVisit({ planId, body })
            .unwrap()
            .then(() => setVisitOpen(false))
            .catch((err) => Alert.alert("Visit failed", apiErrorMessage(err, "Could not add visit")));
        }}
      />
      <WorkFormSheet
        visible={workOpen}
        saving={addWorkState.isLoading}
        planDate={String(plan.plan_date).slice(0, 10)}
        salesUserId={ownerId}
        onClose={() => setWorkOpen(false)}
        onSubmit={(body) => {
          void addWork({ planId, body })
            .unwrap()
            .then(() => setWorkOpen(false))
            .catch((err) => Alert.alert("Task failed", apiErrorMessage(err, "Could not add task")));
        }}
      />
      <ExpenseFormSheet
        visible={expenseOpen}
        saving={addExpenseState.isLoading || updateExpenseState.isLoading}
        planDate={String(plan.plan_date).slice(0, 10)}
        initial={editingExpense}
        onClose={() => {
          setExpenseOpen(false);
          setEditingExpense(null);
        }}
        onSubmit={(body, file) => void saveExpense(body, file)}
      />
      <RejectSheet
        visible={Boolean(rejectId)}
        saving={rejectState.isLoading}
        onClose={() => setRejectId(null)}
        onSubmit={(reason) => {
          if (!rejectId) return;
          void rejectExpense({ planId, expenseId: rejectId, rejection_reason: reason })
            .unwrap()
            .then(() => setRejectId(null))
            .catch((err) => Alert.alert("Reject failed", apiErrorMessage(err, "Could not reject")));
        }}
      />
      <MailSheet
        visible={dayEndOpen}
        title="Day end"
        saving={completePlanState.isLoading}
        initialTo={draft.to}
        initialCc={draft.cc}
        initialSubject={draft.subject}
        initialBody={draft.body}
        dayEnd={draft.dayEnd}
        recipients={(managers.data || [])
          .filter((manager: { email?: string }) => manager.email)
          .map((manager: { _id?: string; name?: string; email: string; roleBadge?: string; wp_role?: string }) => ({
            id: String(manager._id || manager.email),
            name: manager.name || manager.email,
            email: manager.email,
            roleBadge: manager.roleBadge || (String(manager.wp_role || "").toLowerCase() === "admin" ? "Portal Admin" : "Portal Manager"),
          }))}
        onClose={() => setDayEndOpen(false)}
        onSubmit={(payload) => void sendDayEnd(payload)}
      />
      {dayEndRecord ? (
        <Sheet visible={dayEndViewOpen} title="Submitted day end mail" onClose={() => setDayEndViewOpen(false)}>
          <Text style={{ color: colors.muted }}>{sentLabel ? `Sent on ${sentLabel}` : "Submitted day end report"}</Text>
          <DayEndMailCard dayEnd={dayEndRecord} token={session?.token} />
          <DayEndMailPreview summary={report} />
          <Button label="Close" variant="ghost" onPress={() => setDayEndViewOpen(false)} />
        </Sheet>
      ) : null}
      <CopyPlanSheet
        visible={copyOpen}
        planId={planId}
        planDate={plan.plan_date}
        planType={plan.plan_type}
        executiveName={personName(plan.sales_user) || undefined}
        salesUserId={personId(plan.sales_user) || undefined}
        onClose={() => setCopyOpen(false)}
        onConfirm={(targetDate) => router.push({ pathname: "/plan/form", params: { copy: planId, date: targetDate } })}
      />
    </Screen>
  );
}
