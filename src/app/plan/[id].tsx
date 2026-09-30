import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Button, Card, Empty, Headline, Loading, Screen, Section, SplitActions } from "@/components/ui";
import { DayEndMailPreview, ExpenseFormSheet, MailSheet, PlanRemarkSheet, RejectSheet, Sheet, VisitFormSheet, WorkFormSheet, CopyPlanSheet, toFormFile, type LocalFile } from "@/components/sheets";
import { WORK_PLANNER_SERVICE_URL, resolvePublicAssetUrl } from "@/lib/env";
import { StatusSheet, type CompleteVisitAnswers, type WorkflowStatus } from "@/components/StatusSheet";
import { apiErrorMessage } from "@/lib/apiError";
import { formatPlanDate, isPlanWindowClosed, personId, personName, stripHtml } from "@/lib/dates";
import { buildDayEndMailHtml, type DayEndMailSummary } from "@/lib/planMail";
import { useSession } from "@/lib/session";
import { uploadMobileFile } from "@/lib/mobileUpload";
import { formatLocalityCity, getVisitLocationDisplay } from "@/lib/location";
import {
  useAddExpenseMutation,
  useAddVisitMutation,
  useAddWorkMutation,
  useAddWorkPlanAuthorityRemarkMutation,
  useUpdateExpenseMutation,
  useApproveExpenseMutation,
  useCompletePlanMutation,
  useCheckInVisitMutation,
  useCheckOutVisitMutation,
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

function isImageFile(mimeType?: string, fileName?: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf") || /\.pdf(\?|$)/i.test(name)) return false;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv") || /\.(xlsx?|csv)(\?|$)/i.test(name)) return false;
  if (mime.includes("word") || /\.(docx?|zip|rar|txt)(\?|$)/i.test(name)) return false;
  return (
    mime.includes("image") ||
    /\.(png|jpe?g|webp|gif|bmp|heic|svg)(\?|$)/i.test(name) ||
    (!mime && !/\.(pdf|xlsx?|docx?|csv|zip|rar|txt)(\?|$)/i.test(name))
  );
}

function attachmentUrl(file: WorkPlanDayEndAttachment | any, token?: string) {
  if (!file) return "";
  if (typeof file === "string") {
    return resolvePublicAssetUrl(file, token);
  }
  const fid = file._id || file.id;
  if (fid) {
    const base = `${WORK_PLANNER_SERVICE_URL}/api/work-planner/attachments/${fid}/view`;
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }
  return resolvePublicAssetUrl(file.url || file.storage_path || "", token);
}

function expenseReceiptUrl(file: any, token?: string) {
  if (!file) return "";
  if (typeof file === "string") {
    return resolvePublicAssetUrl(file, token);
  }
  const fid = file._id || file.id;
  if (fid) {
    const base = `${WORK_PLANNER_SERVICE_URL}/api/work-planner/attachments/${fid}/view`;
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }
  if (file.url || file.storage_path) return resolvePublicAssetUrl(file.url || file.storage_path, token);
  return "";
}

function sentAtLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function DayEndMailCard({
  dayEnd,
  token,
  onPreview,
}: {
  dayEnd: WorkPlanDayEnd;
  token?: string;
  onPreview?: (file: WorkPlanDayEndAttachment, url: string) => void;
}) {
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
                if (onPreview) {
                  onPreview(file, url);
                } else {
                  void Linking.openURL(url).catch(() => Alert.alert("Attachment", "Could not open this file"));
                }
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
  const currentUserId = String(session?.user?._id || (session?.user as any)?.id || "");
  const planQuery = useGetPlanQuery(planId, { skip: !planId });
  const plan = planQuery.data;
  const ownerId = personId(plan?.sales_user) || personId(session?.user);
  const settings = useGetUserSettingsQuery(ownerId, { skip: !ownerId });
  const managers = useGetEligibleManagersQuery();
  const completed = plan?.status === "completed";
  const dateLocked = Boolean(plan && isPlanWindowClosed(plan.plan_date));
  const canEditPlan = Boolean(plan) && !completed && !dateLocked;

  const [updateVisit, visitState] = useUpdateVisitMutation();
  const [checkInVisit, checkInState] = useCheckInVisitMutation();
  const [checkOutVisit, checkOutState] = useCheckOutVisitMutation();
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
  const [addPlanRemark, planRemarkState] = useAddWorkPlanAuthorityRemarkMutation();
  const [planRemarkOpen, setPlanRemarkOpen] = useState(false);
  const [dayEndOpen, setDayEndOpen] = useState(false);
  const [dayEndViewOpen, setDayEndViewOpen] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(true);
  const [previewDocModal, setPreviewDocModal] = useState<{
    url: string;
    title: string;
    mimeType?: string;
    isImage?: boolean;
  } | null>(null);

  const [draft, setDraft] = useState<{
    to?: string;
    cc?: string;
    subject: string;
    body: string;
    dayEnd?: DayEndMailSummary | null;
  }>({
    to: "",
    cc: "",
    subject: "",
    body: "",
    dayEnd: null,
  });



  async function saveStatus(payload: {
    status: WorkflowStatus;
    remarks: string;
    managerRemarks?: string;
    rescheduledDate?: string;
    visitAnswers?: CompleteVisitAnswers;
    selfieUrl?: string;
    lat?: number;
    lng?: number;
    address?: string;
  }) {
    if (!statusTarget || !plan) return;
    if (!elevated && (plan.status === "completed" || isPlanWindowClosed(plan.plan_date))) {
      Alert.alert("Read only", plan.status === "completed" ? "This work plan is completed." : "The 3-day window has closed.");
      return;
    }
    const itemId = idOf(statusTarget.item);
    try {
      if (statusTarget.type === "visit") {
        const body: Record<string, unknown> = {
          status: payload.status,
          pending_remarks: payload.remarks,
          in_progress_remarks: payload.remarks,
          outcome: payload.remarks,
          ...(payload.selfieUrl ? { selfie_url: payload.selfieUrl, check_in_selfie_url: payload.selfieUrl, check_out_selfie_url: payload.selfieUrl, outcome_selfie_url: payload.selfieUrl } : {}),
          ...(payload.lat !== undefined ? { lat: payload.lat, check_in_lat: payload.lat, check_out_lat: payload.lat } : {}),
          ...(payload.lng !== undefined ? { lng: payload.lng, check_in_lng: payload.lng, check_out_lng: payload.lng } : {}),
          ...(payload.address ? { address: payload.address, check_in_address: payload.address, check_out_address: payload.address } : {}),
          ...(payload.managerRemarks ? { manager_remarks: payload.managerRemarks } : {}),
          ...(payload.rescheduledDate ? { rescheduled_date: payload.rescheduledDate } : {}),
          ...(payload.visitAnswers || {}),
        };
        if (payload.status === "checked_in") {
          await checkInVisit({ planId, visitId: itemId, body }).unwrap();
        } else if (payload.status === "checked_out") {
          await checkOutVisit({ planId, visitId: itemId, body }).unwrap();
        } else if (payload.status === "completed") {
          await completeVisit({ planId, visitId: itemId, body }).unwrap();
        } else {
          await updateVisit({ planId, visitId: itemId, body }).unwrap();
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
        await updateWork({ planId, workId: itemId, body }).unwrap();
      }
      setStatusTarget(null);
    } catch (err) {
      Alert.alert("Status update failed", apiErrorMessage(err, "Could not update status"));
    }
  }

  async function saveExpense(body: Record<string, unknown>, files: LocalFile[]) {
    try {
      const uploadedIds: string[] = [];
      for (const f of files) {
        const uploaded = await uploadMobileFile(toFormFile(f), "expenses/upload", { plan_id: planId });
        const fid = uploaded?._id || uploaded?.id;
        if (fid) uploadedIds.push(fid);
      }
      const existingIds = (body.existing_attachments as string[]) || [];
      const allAttachments = [...existingIds, ...uploadedIds];
      const payload = {
        ...body,
        existing_attachments: undefined,
        ...(allAttachments.length > 0
          ? {
              receipt_attachment: allAttachments[0],
              attachments: allAttachments,
            }
          : {
              receipt_attachment: null,
              attachments: [],
            }),
      };
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
    const visitOk = (plan.visits || []).length > 0 && (plan.visits || []).every((visit) => hasRemarkStatus(visit.status));
    const taskOk = (plan.works || []).length > 0 && (plan.works || []).every((work) => hasRemarkStatus(work.status));
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
        const uploaded = await uploadMobileFile(toFormFile(file), "attachments/upload", { resourceId: planId });
        const fid = uploaded?._id || uploaded?.id;
        if (fid) attachmentIds.push(fid);
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
  const canUpdateItemStatus = elevated || canEditPlan;
  const visits = plan.visits || [];
  const works = plan.works || [];
  const planType = plan.plan_type || "Visits";
  const leavePlan = planType === "Leave";
  const visitsPlan = planType === "Visits" || planType === "Tasks & Visits";
  const taskPlan = planType === "Work From Home" || planType === "Work From Office" || planType === "Tasks & Visits";
  const hasRemarkStatus = (status?: string) => ["pending", "in_progress", "completed", "rescheduled", "skipped", "cancelled"].includes(status || "");
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
      ? "Update every visit and task to pending, in progress, completed, or rescheduled before day end."
      : taskPlan
        ? "Update every task to pending, in progress, completed, or rescheduled before day end."
        : "Update every visit to pending, in progress, completed, or rescheduled before day end."
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

      {/* Senior Remarks Section — visible to plan owners, executives, and seniors */}
      {(() => {
        const planOwnerId = personId(plan.sales_user) || "";
        const isSeniorViewing = elevated && (!planOwnerId || currentUserId !== planOwnerId);
        const hasSeniorRemarks = Boolean(plan.manager_remarks) || (Array.isArray(plan.authority_remarks) && plan.authority_remarks.length > 0);
        return isSeniorViewing || hasSeniorRemarks ? (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 160 }}>
              <Ionicons name="shield-checkmark" size={18} color="#7c3aed" />
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800", flexShrink: 1 }}>Directives & Remarks</Text>
            </View>
            {isSeniorViewing ? (
              <Pressable
                onPress={() => setPlanRemarkOpen(true)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  borderWidth: 1,
                  borderColor: "#c4b5fd",
                  backgroundColor: "#faf5ff",
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                }}
              >
                <Ionicons name="add" size={14} color="#7c3aed" />
                <Text style={{ color: "#7c3aed", fontWeight: "700", fontSize: 12 }}>Add Remark</Text>
              </Pressable>
            ) : null}
          </View>
          {plan.manager_remarks ? (
            <View style={{ backgroundColor: "#faf5ff", borderWidth: 1, borderColor: "#e9d5ff", borderRadius: 10, padding: 10, gap: 4 }}>
              <Text style={{ color: "#7e22ce", fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Active Manager Directive</Text>
              <Text style={{ color: colors.text, fontSize: 13 }}>{stripHtml(plan.manager_remarks)}</Text>
            </View>
          ) : null}
          {plan.authority_remarks && plan.authority_remarks.length > 0 ? (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Remarks Timeline ({plan.authority_remarks.length})</Text>
              {plan.authority_remarks.map((r, idx) => (
                <View key={r._id || `${r.created_at}-${idx}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, gap: 4, backgroundColor: colors.cardAlt }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flexShrink: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
                        {r.user_name || (typeof r.user === "object" ? r.user?.name : "Manager") || "Authority"}
                      </Text>
                      {r.role ? (
                        <View style={{ backgroundColor: "#ede9fe", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ color: "#6d28d9", fontSize: 10, fontWeight: "800" }}>{r.role.toUpperCase()}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      {r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 13 }}>{stripHtml(r.remark)}</Text>
                </View>
              ))}
            </View>
          ) : !plan.manager_remarks ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>No supervisory remarks recorded yet.</Text>
          ) : null}
        </Card>
      ) : null;
      })()}

      {visitsPlan ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>Visits ({visits.length})</Text>
          {canEditPlan ? (
            <Pressable
              onPress={() => setVisitOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: colors.primary,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
              }}
            >
              <Ionicons name="add" size={15} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Add visit</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {visitsPlan && (plan.visits || []).length === 0 ? <Empty label="No visits" /> : null}
      {visitsPlan ? (plan.visits || []).map((visit) => (
        <Card key={idOf(visit)}>
          <Headline title={visit.party_name || "Visit"} meta={visit.purpose} status={visit.status} statusColor={statusColor[visit.status]} />
          {(() => {
            const visitContacts = Array.isArray(visit.contacts) && visit.contacts.length > 0
              ? visit.contacts
              : (visit.contact_person || visit.contact_number || visit.phone || visit.contact_email)
                ? [
                    {
                      contact_person: visit.contact_person,
                      contact_number: visit.contact_number || visit.phone,
                      contact_email: visit.contact_email,
                    },
                  ]
                : [];

            if (visitContacts.length === 0) return null;

            return (
              <View style={{ backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, gap: 6, marginVertical: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Ionicons name="people-outline" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>
                    Contacts ({visitContacts.length})
                  </Text>
                </View>
                <View style={{ gap: 6 }}>
                  {visitContacts.map((c, cIdx) => (
                    <View
                      key={cIdx}
                      style={{
                        backgroundColor: colors.card,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 8,
                        padding: 8,
                        gap: 4,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
                          <Ionicons name="person-outline" size={13} color={colors.muted} />
                          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>
                            {c.contact_person || "Contact"}
                          </Text>
                        </View>
                        {cIdx === 0 && visitContacts.length > 1 && (
                          <View style={{ backgroundColor: "#eff6ff", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                            <Text style={{ fontSize: 9, fontWeight: "800", color: colors.primary, textTransform: "uppercase" }}>Primary</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        {c.contact_number ? (
                          <Pressable
                            onPress={() => Linking.openURL(`tel:${c.contact_number}`)}
                            style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                          >
                            <Ionicons name="call-outline" size={12} color={colors.primary} />
                            <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600" }}>
                              {c.contact_number}
                            </Text>
                          </Pressable>
                        ) : null}
                        {c.contact_email ? (
                          <Pressable
                            onPress={() => Linking.openURL(`mailto:${c.contact_email}`)}
                            style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                          >
                            <Ionicons name="mail-outline" size={12} color={colors.muted} />
                            <Text style={{ fontSize: 11, color: colors.muted }}>
                              {c.contact_email}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}
          {visit.rescheduled_date ? (
            <View style={{ alignSelf: "flex-start", backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: "#c2410c", fontSize: 11, fontWeight: "700" }}>
                Rescheduled to: {formatPlanDate(visit.rescheduled_date)}
              </Text>
            </View>
          ) : null}
          {visit.actual_check_in ? (
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              Check-in: {new Date(visit.actual_check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {visit.actual_check_out ? ` · Check-out: ${new Date(visit.actual_check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
            </Text>
          ) : null}
          {visit.check_in_selfie_url || visit.check_out_selfie_url || visit.outcome_selfie_url ? (
            <View style={{ marginVertical: 6, gap: 6 }}>
              <Text style={{ fontSize: 11, color: colors.text, fontWeight: "700" }}>Verified Client Selfies:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {visit.check_in_selfie_url ? (() => {
                  const checkInUrl = resolvePublicAssetUrl(visit.check_in_selfie_url, session?.token);
                  return (
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "700" }}>Check-In Selfie</Text>
                    <Pressable
                      onPress={() => {
                        if (checkInUrl) setPreviewDocModal({ url: checkInUrl, title: `Check-In Selfie · ${visit.party_name || "Visit"}`, isImage: true });
                      }}
                      style={{ position: "relative", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border, width: 200, height: 170 }}
                    >
                      <Image
                        source={{ uri: checkInUrl }}
                        style={{ width: "100%", height: "100%" }}
                      />
                      <View
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          backgroundColor: "rgba(0,0,0,0.75)",
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          gap: 2,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons name="time" size={12} color="#fcd34d" />
                          <Text style={{ color: "#ffffff", fontSize: 10, fontWeight: "700" }}>
                            {visit.actual_check_in ? new Date(visit.actual_check_in).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Check-in Time"}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons name="location" size={12} color="#60a5fa" />
                          <Text style={{ color: "#e2e8f0", fontSize: 10, fontWeight: "600" }} numberOfLines={1}>
                            {getVisitLocationDisplay(visit.check_in_address || visit.check_out_address || visit.address, visit.check_in_lat ?? visit.check_out_lat, visit.check_in_lng ?? visit.check_out_lng)}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  </View>
                  );
                })() : null}
                {(visit.check_out_selfie_url || (visit.outcome_selfie_url && visit.outcome_selfie_url !== visit.check_in_selfie_url)) ? (() => {
                  const checkOutUrl = resolvePublicAssetUrl(visit.check_out_selfie_url || visit.outcome_selfie_url || "", session?.token);
                  return (
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "700" }}>Check-Out Selfie</Text>
                    <Pressable
                      onPress={() => {
                        if (checkOutUrl) setPreviewDocModal({ url: checkOutUrl, title: `Check-Out Selfie · ${visit.party_name || "Visit"}`, isImage: true });
                      }}
                      style={{ position: "relative", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border, width: 200, height: 170 }}
                    >
                      <Image
                        source={{ uri: checkOutUrl }}
                        style={{ width: "100%", height: "100%" }}
                      />
                      <View
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          backgroundColor: "rgba(0,0,0,0.75)",
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          gap: 2,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons name="time" size={12} color="#fcd34d" />
                          <Text style={{ color: "#ffffff", fontSize: 10, fontWeight: "700" }}>
                            {visit.actual_check_out ? new Date(visit.actual_check_out).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Check-out Time"}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons name="location" size={12} color="#60a5fa" />
                          <Text style={{ color: "#e2e8f0", fontSize: 10, fontWeight: "600" }} numberOfLines={1}>
                            {getVisitLocationDisplay(visit.check_out_address || visit.check_in_address || visit.address, visit.check_out_lat ?? visit.check_in_lat, visit.check_out_lng ?? visit.check_in_lng)}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  </View>
                  );
                })() : null}
              </ScrollView>
            </View>
          ) : null}
          {visit.pending_remarks ? <Text style={{ color: colors.muted }}>Pending: {stripHtml(visit.pending_remarks)}</Text> : null}
          {visit.in_progress_remarks ? <Text style={{ color: colors.muted }}>In progress: {stripHtml(visit.in_progress_remarks)}</Text> : null}
          {visit.outcome ? <Text style={{ color: colors.muted }}>Outcome: {stripHtml(visit.outcome)}</Text> : null}
          {visit.manager_remarks ? (
            <View style={{ backgroundColor: "#faf5ff", borderWidth: 1, borderColor: "#e9d5ff", borderRadius: 8, padding: 8, gap: 2 }}>
              <Text style={{ color: "#7e22ce", fontSize: 11, fontWeight: "700" }}>Senior Remark</Text>
              <Text style={{ color: colors.text, fontSize: 12 }}>{stripHtml(visit.manager_remarks)}</Text>
            </View>
          ) : null}
          {visit.authority_remarks && visit.authority_remarks.length > 0 ? (
            <View style={{ backgroundColor: "#faf5ff", borderWidth: 1, borderColor: "#e9d5ff", borderRadius: 8, padding: 8, gap: 4 }}>
              <Text style={{ color: "#7e22ce", fontSize: 11, fontWeight: "700" }}>
                Senior Remarks ({visit.authority_remarks.length})
              </Text>
              {visit.authority_remarks.map((r, idx) => (
                <View key={r._id || `ar-${idx}`} style={{ borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: "#f3e8ff", paddingTop: idx > 0 ? 4 : 0 }}>
                  <Text style={{ color: "#6b21a8", fontSize: 11, fontWeight: "700" }}>
                    {r.role ? `[${r.role.toUpperCase()}] ` : ""}{r.user_name || "Authority"}
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 12 }}>{stripHtml(r.remark)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {canEditPlan && !hasRemarkStatus(visit.status) ? (
            <Text style={{ color: colors.warning }}>Add a status remark before day end.</Text>
          ) : null}
          {canUpdateItemStatus ? (
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {visit.status === "checked_in" ? (
                <>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Button
                      label="Check Out"
                      variant="primary"
                      onPress={() => setStatusTarget({ type: "visit", item: visit })}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Button
                      label="Complete Outcome"
                      variant="ghost"
                      onPress={() => setStatusTarget({ type: "visit", item: visit })}
                    />
                  </View>
                </>
              ) : visit.status === "checked_out" ? (
                <View style={{ flex: 1 }}>
                  <Button
                    label="Complete Outcome"
                    variant="primary"
                    onPress={() => setStatusTarget({ type: "visit", item: visit })}
                  />
                </View>
              ) : visit.status === "completed" ? (
                <View style={{ flex: 1 }}>
                  <Button
                    label="Edit Outcome"
                    variant="ghost"
                    onPress={() => setStatusTarget({ type: "visit", item: visit })}
                  />
                </View>
              ) : (
                <View style={{ flex: 1 }}>
                  <Button
                    label="Check In"
                    variant="primary"
                    onPress={() => setStatusTarget({ type: "visit", item: visit })}
                  />
                </View>
              )}
            </View>
          ) : null}
        </Card>
      )) : null}

      {taskPlan ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>Tasks ({works.length})</Text>
          {canEditPlan ? (
            <Pressable
              onPress={() => setWorkOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: colors.primary,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
              }}
            >
              <Ionicons name="add" size={15} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Add task</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {taskPlan && (plan.works || []).length === 0 ? <Empty label="No tasks" /> : null}
      {taskPlan ? (plan.works || []).map((work) => (
        <Card key={idOf(work)}>
          <Headline title={work.title} meta={work.description} status={work.status} statusColor={statusColor[work.status]} />
          {work.rescheduled_date ? (
            <View style={{ alignSelf: "flex-start", backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: "#c2410c", fontSize: 11, fontWeight: "700" }}>
                Rescheduled to: {formatPlanDate(work.rescheduled_date)}
              </Text>
            </View>
          ) : null}
          {work.pending_remarks ? <Text style={{ color: colors.muted }}>Pending: {stripHtml(work.pending_remarks)}</Text> : null}
          {work.in_progress_remarks ? <Text style={{ color: colors.muted }}>In progress: {stripHtml(work.in_progress_remarks)}</Text> : null}
          {work.completion_remarks || work.outcome ? (
            <Text style={{ color: colors.muted }}>Completed: {stripHtml(work.completion_remarks || work.outcome)}</Text>
          ) : null}
          {work.manager_remarks ? (
            <View style={{ backgroundColor: "#faf5ff", borderWidth: 1, borderColor: "#e9d5ff", borderRadius: 8, padding: 8, gap: 2 }}>
              <Text style={{ color: "#7e22ce", fontSize: 11, fontWeight: "700" }}>Senior Remark</Text>
              <Text style={{ color: colors.text, fontSize: 12 }}>{stripHtml(work.manager_remarks)}</Text>
            </View>
          ) : null}
          {work.authority_remarks && work.authority_remarks.length > 0 ? (
            <View style={{ backgroundColor: "#faf5ff", borderWidth: 1, borderColor: "#e9d5ff", borderRadius: 8, padding: 8, gap: 4 }}>
              <Text style={{ color: "#7e22ce", fontSize: 11, fontWeight: "700" }}>
                Senior Remarks ({work.authority_remarks.length})
              </Text>
              {work.authority_remarks.map((r, idx) => (
                <View key={r._id || `ar-${idx}`} style={{ borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: "#f3e8ff", paddingTop: idx > 0 ? 4 : 0 }}>
                  <Text style={{ color: "#6b21a8", fontSize: 11, fontWeight: "700" }}>
                    {r.role ? `[${r.role.toUpperCase()}] ` : ""}{r.user_name || "Authority"}
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 12 }}>{stripHtml(r.remark)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {canEditPlan && !hasRemarkStatus(work.status) ? (
            <Text style={{ color: colors.warning }}>Add a status remark before day end.</Text>
          ) : null}
          {canUpdateItemStatus ? <Button label="Update status" variant="ghost" onPress={() => setStatusTarget({ type: "work", item: work })} /> : null}
        </Card>
      )) : null}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>Expenses ({plan.expenses?.length || 0})</Text>
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>Total: ₹{expenseTotal.toLocaleString("en-IN")}</Text>
      </View>
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
              title={`${expense.category}${expense.sub_category ? ` · ${expense.sub_category}` : ""} · ₹${Number(expense.amount || 0).toLocaleString("en-IN")}`}
              meta={[expense.payment_mode, expense.vendor_name, expense.bill_number ? `Bill #${expense.bill_number}` : ""].filter(Boolean).join(" · ")}
              status={expense.status}
              statusColor={statusColor[expense.status]}
            />
            {expense.description ? <Text style={{ color: colors.text, fontSize: 13 }}>{expense.description}</Text> : null}

            {isPrivateBike && (expense.start_reading != null || expense.closing_reading != null) ? (
              <View style={{ backgroundColor: "#0284c715", borderWidth: 1, borderColor: "#38bdf840", borderRadius: 8, padding: 8, gap: 2 }}>
                <Text style={{ color: "#0284c7", fontSize: 11, fontWeight: "700" }}>🚲 Private Bike Mileage (₹3.50 / KM)</Text>
                <Text style={{ color: colors.text, fontSize: 12 }}>
                  {expense.start_reading ?? "—"} KM → {expense.closing_reading ?? "—"} KM
                  {totalKm != null ? ` (${totalKm} KM = ₹${(totalKm * 3.5).toFixed(2)})` : ""}
                </Text>
              </View>
            ) : null}

            {allAttachments.length > 0 ? (
              <View style={{ gap: 4 }}>
                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>Attachments ({allAttachments.length}):</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {allAttachments.map((att, idx) => {
                    const url = expenseReceiptUrl(att, session?.token);
                    const name = typeof att === "object" ? att.original_name || att.file_name || `Receipt ${idx + 1}` : `Receipt ${idx + 1}`;
                    const mime = typeof att === "object" ? att.mime_type : undefined;
                    return (
                      <Pressable
                        key={idx}
                        onPress={() => {
                          if (url) {
                            const isImg = isImageFile(mime, name);
                            setPreviewDocModal({ url, title: name, mimeType: mime, isImage: isImg });
                          }
                        }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
                      >
                        <Ionicons name={fileIcon(mime, name)} size={13} color={colors.primary} />
                        <Text numberOfLines={1} style={{ fontSize: 11, color: colors.primary, fontWeight: "600", maxWidth: 160 }}>
                          {name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {expense.rejection_reason ? (
              <Text style={{ color: colors.danger, fontSize: 12 }}>Reason: {expense.rejection_reason}</Text>
            ) : null}

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
                  <View style={{ flex: 1, minWidth: 100, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.cardAlt }}>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>Visits</Text>
                    <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>{completedVisits}<Text style={{ color: colors.muted, fontSize: 11, fontWeight: "500" }}>/{visits.length}</Text></Text>
                  </View>
                ) : null}
                {works.length > 0 ? (
                  <View style={{ flex: 1, minWidth: 100, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.cardAlt }}>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>Tasks</Text>
                    <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>{completedTasks}<Text style={{ color: colors.muted, fontSize: 11, fontWeight: "500" }}>/{works.length}</Text></Text>
                  </View>
                ) : null}
                <View style={{ flex: 1, minWidth: 100, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.cardAlt }}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>Expenses</Text>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>₹{expenseTotal.toLocaleString("en-IN")}</Text>
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
        initialManagerRemarks={statusTarget?.item.manager_remarks}
        initialRescheduledDate={statusTarget?.item.rescheduled_date}
        authorityRemarks={statusTarget?.item.authority_remarks}
        isElevated={elevated && currentUserId !== (personId(plan.sales_user) || "")}
        isSeniorViewing={elevated && (!personId(plan.sales_user) || currentUserId !== personId(plan.sales_user))}
        visitRecord={statusTarget?.type === "visit" ? statusTarget.item : undefined}
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
      <PlanRemarkSheet
        visible={planRemarkOpen}
        saving={planRemarkState.isLoading}
        initialRemarks={plan.manager_remarks}
        onClose={() => setPlanRemarkOpen(false)}
        onSubmit={(remark) => {
          void addPlanRemark({ planId, remark })
            .unwrap()
            .then(() => setPlanRemarkOpen(false))
            .catch((err) => Alert.alert("Remark failed", apiErrorMessage(err, "Could not save supervisory remark")));
        }}
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
          <DayEndMailCard
            dayEnd={dayEndRecord}
            token={session?.token}
            onPreview={(file, url) => {
              const name = file.original_name || file.file_name || "Attachment";
              const isImg = isImageFile(file.mime_type, name);
              setPreviewDocModal({ url, title: name, mimeType: file.mime_type, isImage: isImg });
            }}
          />
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

      <Modal
        visible={Boolean(previewDocModal)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewDocModal(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center" }}>
          <View style={{ position: "absolute", top: 50, left: 0, right: 0, zIndex: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 }}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700", flex: 1, marginRight: 12 }} numberOfLines={1}>
              {previewDocModal?.title || "Document Preview"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable
                onPress={() => {
                  if (previewDocModal?.url) {
                    void Linking.openURL(previewDocModal.url);
                  }
                }}
                style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="open-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => setPreviewDocModal(null)}
                style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>
          </View>

          {previewDocModal?.url ? (
            previewDocModal.isImage ? (
              <View style={{ width: "100%", height: "75%", justifyContent: "center", alignItems: "center", padding: 12 }}>
                <Image
                  source={{ uri: previewDocModal.url }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="contain"
                />
              </View>
            ) : (
              <View style={{ backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155", borderRadius: 16, padding: 24, marginHorizontal: 24, alignItems: "center", gap: 14, width: "85%", maxWidth: 360 }}>
                <Ionicons name="document-text" size={54} color="#38bdf8" />
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "center" }}>
                  {previewDocModal.title}
                </Text>
                <Text style={{ color: "#94a3b8", fontSize: 13, textAlign: "center" }}>
                  Tap below to open or download this document in your browser / file viewer.
                </Text>
                <View style={{ width: "100%", gap: 8, marginTop: 6 }}>
                  <Button
                    label="Open Document"
                    variant="primary"
                    onPress={() => {
                      if (previewDocModal?.url) {
                        void Linking.openURL(previewDocModal.url);
                      }
                    }}
                  />
                  <Button
                    label="Close"
                    variant="ghost"
                    onPress={() => setPreviewDocModal(null)}
                  />
                </View>
              </View>
            )
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}
