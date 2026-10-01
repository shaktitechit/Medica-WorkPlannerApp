import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { DatePickerField } from "@/components/DateRangePicker";
import { PersonSelect } from "@/components/PersonSelect";
import { Button, Card, Chip, Field, FilterBar, Loading, Screen, Section, SplitActions } from "@/components/ui";
import { MailSheet, Sheet, VisitFormSheet, WorkFormSheet, toFormFile, type LocalFile } from "@/components/sheets";
import { apiErrorMessage } from "@/lib/apiError";
import { earliestOpenPlanDate, formatPlanDate, isPlanWindowClosed, personId, stripHtml, todayISO } from "@/lib/dates";
import { buildPlanMailHtml } from "@/lib/planMail";
import { useSession } from "@/lib/session";
import { uploadMobileFile } from "@/lib/mobileUpload";
import { useGetUsersQuery } from "@/store/api/authApiSlice";
import {
  useAddVisitMutation,
  useAddWorkMutation,
  useCreatePlanMutation,
  useGetEligibleManagersQuery,
  useGetMyTeamQuery,
  useGetPlanQuery,
  useGetPlansQuery,
  useGetUserSettingsQuery,
  useLazyGetPlanQuery,
  useLazyGetPlansQuery,
  useSubmitPlanMutation,
  useUpdatePlanMutation,
  useUploadWorkPlanAttachmentMutation,
} from "@/store/api/workPlannerApiSlice";
import type { WorkPlanRecord, WorkPlanVisitRecord, WorkPlanWorkRecord } from "@/types/workPlanner";
import { canReceiveWorkPlan, isWpAdmin, isWpElevated } from "@/utils/roles";
import { useStatusColors, useThemeColors } from "@/theme";

const PLAN_TYPES = ["Visits", "Tasks & Visits", "Leave", "Work From Home", "Work From Office"] as const;
const METHODS = [
  { id: "on_call", label: "On call" },
  { id: "on_direct_meeting", label: "In person" },
  { id: "on_email", label: "Email" },
  { id: "other", label: "Other" },
] as const;

function showsVisits(type: string) {
  return type === "Visits" || type === "Tasks & Visits";
}
function showsTasks(type: string) {
  return type === "Work From Home" || type === "Work From Office" || type === "Tasks & Visits";
}
function recordId(item?: { _id?: string; id?: string } | null) {
  return String(item?._id || item?.id || "");
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    created: "Created",
    pending: "Pending",
    in_progress: "In progress",
    checked_in: "Checked in",
    completed: "Completed",
    cancelled: "Cancelled",
    skipped: "Skipped",
    rescheduled: "Rescheduled",
  };
  return labels[status || ""] || status || "Created";
}

function clock(value?: string | null) {
  if (!value) return "";
  const match = String(value).match(/T(\d{2}:\d{2})/);
  if (match) return match[1];
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

type PendingRow = {
  key: string;
  title: string;
  status: string;
  planDate: string;
  detail?: string;
  notes?: string;
  remarks?: string;
  raw: WorkPlanVisitRecord | WorkPlanWorkRecord;
};

type DraftVisit = WorkPlanVisitRecord & { localId: string; is_from_previous_plan?: boolean; previous_plan_date?: string };
type DraftWork = WorkPlanWorkRecord & { localId: string; is_from_previous_plan?: boolean; previous_plan_date?: string };
type ManagerOption = { _id: string; name?: string; email?: string; roleBadge?: string; wp_role?: string };

export default function PlanFormScreen() {
  const colors = useThemeColors();
  const statusColor = useStatusColors();
  const params = useLocalSearchParams<{ edit?: string; copy?: string; date?: string }>();
  const sourceId = String(params.edit || params.copy || "");
  const isEdit = Boolean(params.edit);
  const { session } = useSession();
  const elevated = isWpElevated(session?.user);
  const admin = isWpAdmin(session?.user);
  const selfId = personId(session?.user);
  const source = useGetPlanQuery(sourceId, { skip: !sourceId });
  const team = useGetMyTeamQuery(undefined, { skip: !elevated || admin });
  const users = useGetUsersQuery(undefined, { skip: !admin });
  const managers = useGetEligibleManagersQuery();

  const [planDate, setPlanDate] = useState(String(params.date || todayISO()));
  const [planType, setPlanType] = useState<(typeof PLAN_TYPES)[number]>("Visits");
  const [location, setLocation] = useState("");
  const [remarks, setRemarks] = useState("");
  const [discussed, setDiscussed] = useState(false);
  const [discussedManagerId, setDiscussedManagerId] = useState("");
  const [managerName, setManagerName] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("on_call");
  const [salesUserId, setSalesUserId] = useState(selfId);
  const [visits, setVisits] = useState<DraftVisit[]>([]);
  const [works, setWorks] = useState<DraftWork[]>([]);
  const [visitOpen, setVisitOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<"visits" | "tasks" | null>(null);
  const [pendingQuery, setPendingQuery] = useState("");
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [loadedPlan, setLoadedPlan] = useState<WorkPlanRecord | null>(null);
  const [checkingPlan, setCheckingPlan] = useState(false);
  const [sourceApplied, setSourceApplied] = useState(!sourceId);
  const copiedVisits = useRef<DraftVisit[]>([]);
  const copiedWorks = useRef<DraftWork[]>([]);
  const loadedKey = useRef("");
  const templatesSeeded = useRef("");
  const autoRolloverRanRef = useRef("");
  const [autoRolloverLoading, setAutoRolloverLoading] = useState(false);

  const targetUserId = elevated && salesUserId ? salesUserId : selfId;
  const settings = useGetUserSettingsQuery(targetUserId, { skip: !targetUserId });
  const [fetchPlans] = useLazyGetPlansQuery();
  const [fetchPlan] = useLazyGetPlanQuery();

  const pendingPlans = useGetPlansQuery(
    {
      limit: 200,
      include_visits: true,
      include_works: true,
      sales_user: targetUserId,
      sales_user_id: targetUserId,
    },
    { skip: !pendingMode || !targetUserId },
  );

  const [createPlan, createState] = useCreatePlanMutation();
  const [updatePlan, updateState] = useUpdatePlanMutation();
  const [addVisit] = useAddVisitMutation();
  const [addWork] = useAddWorkMutation();
  const [submitPlan, submitState] = useSubmitPlanMutation();
  const [uploadAttachment] = useUploadWorkPlanAttachmentMutation();

  useEffect(() => {
    if (!source.data || sourceApplied) return;
    const plan = source.data;
    if (!isEdit) {
      copiedVisits.current = (plan.visits || []).map((visit, index) => ({
        ...visit,
        _id: undefined,
        id: undefined,
        localId: `c-${index}`,
        status: "created",
      }));
      copiedWorks.current = (plan.works || []).map((work, index) => ({
        ...work,
        _id: undefined,
        id: undefined,
        localId: `w-${index}`,
        status: "created",
      }));
    } else {
      setPlanDate(String(plan.plan_date || todayISO()).slice(0, 10));
      setSalesUserId(personId(plan.sales_user) || selfId);
    }
    setSourceApplied(true);
  }, [source.data, sourceApplied, isEdit, selfId]);

  useEffect(() => {
    if (!sourceApplied || !planDate || !targetUserId) return;
    const key = `${targetUserId}_${planDate}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    templatesSeeded.current = "";
    let cancelled = false;
    let finished = false;

    async function loadForSelection() {
      setCheckingPlan(true);
      try {
        const res = await fetchPlans({
          sales_user: targetUserId,
          sales_user_id: targetUserId,
          from: planDate,
          to: planDate,
          limit: 5,
          include_standalone: true,
          include_visits: true,
          include_works: true,
        }).unwrap();
        if (cancelled) return;
        const rows = res.data || [];
        const found = rows.find((plan) => {
          const id = recordId(plan);
          return Boolean(id) && !id.startsWith("standalone_") && !plan.is_standalone;
        });
        const standalone = rows.find((plan) => plan.is_standalone || recordId(plan).startsWith("standalone_"));
        if (found) {
          const full = await fetchPlan(recordId(found)).unwrap();
          if (cancelled) return;
          const plan = full || found;
          setLoadedPlan(plan);
          setPlanType((plan.plan_type || "Visits") as (typeof PLAN_TYPES)[number]);
          setLocation(plan.location || "");
          setRemarks(stripHtml(plan.remarks));
          setDiscussed(Boolean(plan.is_discussed_with_manager));
          setDiscussedManagerId(
            typeof plan.discussed_manager_id === "string" ? plan.discussed_manager_id : recordId(plan.discussed_manager_id),
          );
          setManagerName(
            plan.discussed_manager_name ||
              (typeof plan.discussed_manager_id === "object" ? plan.discussed_manager_id?.name || "" : ""),
          );
          if (plan.discussion_method) setMethod(plan.discussion_method);
          setVisits(params.copy ? copiedVisits.current : []);
          setWorks(params.copy ? copiedWorks.current : []);
          return;
        }
        setLoadedPlan(null);
        setLocation(standalone?.location || "");
        setRemarks(stripHtml(standalone?.remarks));
        setDiscussed(false);
        setDiscussedManagerId("");
        setManagerName("");
        setMethod("on_call");
        if (standalone && !params.copy) {
          const standaloneVisits = (standalone.visits || []).map((visit, index) => ({
            ...visit,
            _id: undefined,
            id: undefined,
            localId: `s-${index}`,
            status: "created" as const,
          }));
          const standaloneWorks = (standalone.works || []).map((work, index) => ({
            ...work,
            _id: undefined,
            id: undefined,
            localId: `s-${index}`,
            status: "created" as const,
          }));
          setVisits(standaloneVisits);
          setWorks(standaloneWorks);
          setPlanType(
            (standalone.plan_type ||
              (standaloneVisits.length && standaloneWorks.length
                ? "Tasks & Visits"
                : standaloneVisits.length
                  ? "Visits"
                  : "Tasks & Visits")) as (typeof PLAN_TYPES)[number],
          );
          return;
        }
        if (params.copy) {
          setVisits(copiedVisits.current);
          setWorks(copiedWorks.current);
          setPlanType((source.data?.plan_type || "Visits") as (typeof PLAN_TYPES)[number]);
        } else {
          setVisits([]);
          setWorks([]);
          setPlanType("Visits");
        }
      } catch (err) {
        if (!cancelled) Alert.alert("Could not load plan", apiErrorMessage(err, "Lookup failed"));
      } finally {
        finished = true;
        if (!cancelled) setCheckingPlan(false);
      }
    }

    void loadForSelection();
    return () => {
      cancelled = true;
      if (!finished) loadedKey.current = "";
    };
  }, [sourceApplied, planDate, targetUserId, elevated, fetchPlans, fetchPlan, params.copy, source.data]);

  const assignees = useMemo(() => {
    type Person = { _id: string; name?: string; email?: string };
    const self: Person | null = selfId
      ? { _id: selfId, name: session?.user?.name || "Me", email: session?.user?.email }
      : null;
    const toPeople = (users: Array<{ _id?: string; id?: string; name?: string; email?: string }>) => {
      const people: Person[] = [];
      for (const user of users) {
        const id = String(user._id || user.id || "");
        if (id) people.push({ _id: id, name: user.name, email: user.email });
      }
      return people;
    };
    const withSelf = (people: Person[]) => {
      if (self && !people.some((user) => user._id === self._id)) people.unshift(self);
      return people.sort((a, b) => (a._id === selfId ? -1 : b._id === selfId ? 1 : 0));
    };
    if (!elevated) return self ? [self] : [];
    if (admin) return withSelf(toPeople((users.data || []).filter((user) => canReceiveWorkPlan(user, selfId))));
    return withSelf(toPeople((team.data?.members || []) as Array<{ _id?: string; id?: string; name?: string; email?: string }>));
  }, [admin, elevated, users.data, team.data, selfId, session?.user]);

  const rosterReady = !elevated || (admin ? users.isSuccess : team.isSuccess);
  useEffect(() => {
    if (!rosterReady || !selfId) return;
    if (!assignees.some((user) => user._id === salesUserId)) setSalesUserId(selfId);
  }, [rosterReady, assignees, salesUserId, selfId]);

  const managerOptions = useMemo(() => {
    return (managers.data || [])
      .map((manager: ManagerOption) => ({
        _id: String(manager._id || ""),
        name: manager.name || manager.email || "Manager",
        email: manager.email || "",
        roleBadge: manager.roleBadge || (String(manager.wp_role || "").toLowerCase() === "admin" ? "Portal Admin" : String(manager.wp_role || "").toLowerCase() === "coordinator" ? "Portal Coordinator" : "Portal Manager"),
      }))
      .filter((manager) => manager._id);
  }, [managers.data]);

  const selectedManager = managerOptions.find((manager) => manager._id === discussedManagerId);
  const activePlanId = recordId(loadedPlan);
  const updating = Boolean(activePlanId);
  const completedLocked = loadedPlan?.status === "completed";
  const dateLocked = isPlanWindowClosed(planDate);
  const readOnly = completedLocked || dateLocked;

  useEffect(() => {
    if (checkingPlan || updating || params.copy || !sourceApplied || !settings.data || isPlanWindowClosed(planDate)) return;
    const key = `${targetUserId}_${planDate}`;
    if (templatesSeeded.current === key) return;
    templatesSeeded.current = key;
    const templates = (settings.data.customWorkTemplates || []) as Array<{ title: string; description?: string }>;
    if (!templates.length) return;
    setWorks((current) => {
      if (current.length) return current;
      return templates.map((template, index) => ({
        localId: `tpl-${index}-${planDate}`,
        sequence: index + 1,
        status: "created" as const,
        title: template.title,
        description: template.description,
      }));
    });
    setPlanType((current) => (current === "Visits" ? "Tasks & Visits" : current));
  }, [checkingPlan, updating, params.copy, sourceApplied, settings.data, targetUserId, planDate]);

  const handleAutoRollover = async (isManual = false) => {
    if (completedLocked || dateLocked || !planDate || !targetUserId) return;
    try {
      setAutoRolloverLoading(true);
      const res = await fetchPlans({
        sales_user: targetUserId,
        sales_user_id: targetUserId,
        limit: 50,
        include_standalone: false,
        include_visits: false,
        include_works: true,
      }).unwrap();

      const allPlans = (res?.data || []) as WorkPlanRecord[];
      const currentPlanDateNormalized = planDate.split("T")[0];

      const previousPlans = allPlans
        .filter((p: WorkPlanRecord) => {
          if (!p.plan_date) return false;
          const pDateNormalized = p.plan_date.split("T")[0];
          if (pDateNormalized >= currentPlanDateNormalized) return false;
          if (isPlanWindowClosed(p.plan_date)) return false;
          return true;
        })
        .sort((a: WorkPlanRecord, b: WorkPlanRecord) => new Date(b.plan_date).getTime() - new Date(a.plan_date).getTime());

      if (previousPlans.length === 0) {
        if (isManual) {
          Alert.alert("Auto Rollover", "No eligible previous plans within the 3-day window found for auto-rollover.");
        }
        return;
      }

      const existingWorkIds = new Set(
        [...works.map((w) => recordId(w)), ...(loadedPlan?.works || []).map((w) => recordId(w))].filter(Boolean)
      );

      const newWorksToAdd: DraftWork[] = [];

      for (const p of previousPlans) {
        for (const w of p.works || []) {
          const wId = recordId(w);
          if (wId && existingWorkIds.has(wId)) continue;
          if (["created", "pending", "in_progress"].includes(w.status)) {
            if (wId) existingWorkIds.add(wId);
            newWorksToAdd.push({
              ...w,
              localId: `rollover-${wId || Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              is_from_previous_plan: true,
              previous_plan_date: p.plan_date,
            });
          }
        }
      }

      const tasksCount = newWorksToAdd.length;

      if (tasksCount === 0) {
        if (isManual) {
          Alert.alert("Auto Rollover", "No uncompleted tasks found to roll over.");
        }
        return;
      }

      if (tasksCount > 0) {
        setWorks((prev) => [...prev, ...newWorksToAdd]);
      }

      if (tasksCount > 0 && (planType === "Visits" || visits.length > 0)) {
        setPlanType("Tasks & Visits");
      }

      Alert.alert(
        "Auto Rollover Completed",
        `🔄 Rolled over ${tasksCount} task${tasksCount === 1 ? "" : "s"} from previous plans.`
      );
    } catch (err: any) {
      if (isManual) {
        Alert.alert("Auto Rollover Failed", apiErrorMessage(err, "Could not roll over previous items."));
      }
    } finally {
      setAutoRolloverLoading(false);
    }
  };

  useEffect(() => {
    if (isEdit || params.copy || updating || checkingPlan || !sourceApplied || dateLocked || completedLocked) return;
    const key = `${targetUserId}_${planDate}`;
    if (autoRolloverRanRef.current === key) return;
    autoRolloverRanRef.current = key;
    void handleAutoRollover(false);
  }, [isEdit, params.copy, updating, checkingPlan, sourceApplied, dateLocked, completedLocked, targetUserId, planDate]);

  const pendingItems = useMemo(() => {
    const plans = (pendingPlans.data?.data || []).filter((plan) => {
      const owner = personId(plan.sales_user);
      return !owner || owner === targetUserId;
    });
    const taken = new Set(
      [
        ...visits.map((visit) => recordId(visit)),
        ...works.map((work) => recordId(work)),
        ...(loadedPlan?.visits || []).map((visit) => recordId(visit)),
        ...(loadedPlan?.works || []).map((work) => recordId(work)),
      ].filter(Boolean),
    );
    const rows: PendingRow[] = [];
    for (const plan of plans) {
      if (plan.status === "completed" || isPlanWindowClosed(plan.plan_date)) continue;
      if (pendingMode === "visits") {
        for (const visit of plan.visits || []) {
          const key = recordId(visit);
          if (!key || taken.has(key)) continue;
          if (["created", "pending", "in_progress", "checked_in"].includes(visit.status)) {
            rows.push({
              key,
              title: visit.party_name || "Field visit",
              status: visit.status,
              planDate: plan.plan_date,
              detail: visit.address || plan.location || "",
              notes: visit.purpose || stripHtml(visit.notes),
              remarks: stripHtml(visit.in_progress_remarks || visit.pending_remarks),
              raw: visit,
            });
          }
        }
      } else if (pendingMode === "tasks") {
        for (const work of plan.works || []) {
          const key = recordId(work);
          if (!key || taken.has(key)) continue;
          if (["created", "pending", "in_progress"].includes(work.status)) {
            rows.push({
              key,
              title: work.title || "Work task",
              status: work.status,
              planDate: plan.plan_date,
              detail: plan.location || "",
              notes: stripHtml(work.description),
              remarks: stripHtml(work.in_progress_remarks || work.pending_remarks),
              raw: work,
            });
          }
        }
      }
    }
    const query = pendingQuery.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => `${row.title} ${row.detail} ${row.notes} ${row.remarks} ${row.status}`.toLowerCase().includes(query));
  }, [pendingPlans.data, pendingMode, pendingQuery, targetUserId, visits, works, loadedPlan]);

  const templates = (settings.data?.customWorkTemplates || []) as Array<{ id?: string; title: string; description?: string }>;
  const editingVisit = visits.find((visit) => visit.localId === editingVisitId) || null;
  const editingWork = works.find((work) => work.localId === editingWorkId) || null;

  function assignedManager() {
    const pts = settings.data?.planTypeSettings?.[planType];
    const id = String(pts?.assignedManagerId || settings.data?.assignedManagerId || "");
    const match = managerOptions.find((manager) => manager._id === id);
    return {
      id: match?._id || id,
      name: match?.name || pts?.assignedManagerName || settings.data?.assignedManagerName || "",
      email: match?.email || pts?.assignedManagerEmail || settings.data?.assignedManagerEmail || "",
    };
  }

  function payload(): Partial<WorkPlanRecord> {
    return {
      plan_date: planDate,
      plan_type: planType,
      location: location.trim(),
      remarks: remarks.trim(),
      is_discussed_with_manager: discussed,
      discussed_manager_id: discussed && discussedManagerId ? discussedManagerId : undefined,
      discussed_manager_name: discussed ? selectedManager?.name || managerName.trim() || undefined : undefined,
      discussion_method: discussed ? method : undefined,
      ...(elevated && salesUserId ? { sales_user: salesUserId } : {}),
    };
  }

  function mailDefaults() {
    const assigned = assignedManager();
    const target = assignees.find((user) => String(user._id) === salesUserId);
    const creatingForOther = Boolean(elevated && salesUserId && salesUserId !== selfId && target?.email);
    const executiveName = creatingForOther ? target?.name || "Executive" : session?.user?.name || "Executive";
    const dateLabel = formatPlanDate(planDate);
    const subject = creatingForOther
      ? `Work Plan Assigned (${planType}) — ${executiveName} (${dateLabel})`
      : `Work Plan ${updating ? "Updated" : "Created"} (${planType}) — ${executiveName} (${dateLabel})`;
    const to = creatingForOther ? target?.email || "" : assigned.email || selectedManager?.email || "";
    const pts = settings.data?.planTypeSettings?.[planType];
    const configured = (pts?.ccEmails?.length ? pts.ccEmails : settings.data?.ccEmails) || [];
    const skip = new Set([to, session?.user?.email || ""].map((email) => email.toLowerCase()));
    const cc = configured.filter((email: string) => email && !skip.has(email.toLowerCase())).join(", ");
    const summary = {
      action: updating ? "Updated" : "Created",
      executiveName,
      fromEmail: session?.user?.email || "",
      planDate: dateLabel,
      planType,
      location: location.trim(),
      discussedLabel: discussed ? `Yes (${selectedManager?.name || managerName || "Manager"})` : "No",
      remarks: remarks.trim(),
      visits: [...(loadedPlan?.visits || []), ...visits].map((visit) => ({
        party_name: visit.party_name,
        contact_person: visit.contact_person,
        contact_number: visit.contact_number,
        contact_email: visit.contact_email,
        contacts: visit.contacts,
        address: visit.address,
        status: visit.status,
        planned_start_time: visit.planned_start_time,
      })),
      tasks: [...(loadedPlan?.works || []), ...works].map((work) => ({
        title: work.title,
        description: work.description,
        status: work.status,
        planned_start_time: work.planned_start_time,
      })),
    };
    return { to, cc, subject, body: buildPlanMailHtml(summary), toLocked: creatingForOther, summary };
  }

  function prepareMail() {
    if (completedLocked) {
      Alert.alert("Completed plan", "This work plan is completed and is read only.");
      return;
    }
    if (!planDate) {
      Alert.alert("Date required", "Choose a plan date.");
      return;
    }
    if (dateLocked) {
      Alert.alert("3-day window closed", "Work plans can only be changed on the plan day and the next 2 days.");
      return;
    }
    if (discussed && !discussedManagerId && !managerName.trim()) {
      Alert.alert("Manager required", "Select the manager you discussed this plan with.");
      return;
    }
    const savedVisits = loadedPlan?.visits?.length || 0;
    const savedTasks = loadedPlan?.works?.length || 0;
    if (showsVisits(planType) && savedVisits + visits.length === 0) {
      Alert.alert("Visits required", "Add at least one visit for this plan type.");
      return;
    }
    if (showsTasks(planType) && savedTasks + works.length === 0) {
      Alert.alert("Tasks required", "Add at least one task for this plan type.");
      return;
    }
    setMailOpen(true);
  }

  async function sendMail(mail: { toEmail: string; cc: string; subject: string; body: string; files: LocalFile[] }) {
    try {
      let targetId = activePlanId;
      if (targetId) {
        await updatePlan({ id: targetId, body: payload() }).unwrap();
      } else {
        const created = await createPlan(payload()).unwrap();
        targetId = recordId(created);
      }
      for (const visit of visits) {
        await addVisit({
          planId: targetId,
          body: {
            party_type: visit.party_type,
            party: typeof visit.party === "string" ? visit.party : visit.party?._id,
            party_name: visit.party_name,
            contact_person: visit.contact_person,
            contact_number: visit.contact_number,
            contact_email: visit.contact_email,
            contacts: visit.contacts,
            address: visit.address,
            purpose: visit.purpose,
            notes: visit.notes,
            planned_start_time: visit.planned_start_time,
          },
        }).unwrap();
      }
      for (const work of works) {
        await addWork({
          planId: targetId,
          body: {
            title: work.title,
            description: work.description,
            planned_start_time: work.planned_start_time,
          },
        }).unwrap();
      }
      const attachmentIds: string[] = [];
      for (const file of mail.files) {
        const uploaded = await uploadMobileFile(toFormFile(file), "attachments/upload", { resourceId: targetId });
        const fid = uploaded?._id || uploaded?.id;
        if (fid) attachmentIds.push(fid);
      }
      await submitPlan({
        id: targetId,
        body: {
          to_email: mail.toEmail,
          cc_emails: mail.cc.split(",").map((item) => item.trim()).filter(Boolean),
          subject: mail.subject,
          body_html: mail.body.trim().startsWith("<") ? mail.body : `<div>${mail.body.replace(/\n/g, "<br/>")}</div>`,
          attachment_ids: attachmentIds,
        },
      }).unwrap();
      setMailOpen(false);
      router.replace(`/plan/${targetId}`);
    } catch (err) {
      Alert.alert("Could not save plan", apiErrorMessage(err, "Save failed"));
    }
  }

  const mail = mailDefaults();
  const saving = createState.isLoading || updateState.isLoading || submitState.isLoading;

  function StatusTag({ status }: { status?: string }) {
    return (
      <Text style={{ color: statusColor[status || "created"] || colors.primary, fontSize: 11, fontWeight: "800" }}>
        {statusLabel(status)}
      </Text>
    );
  }

  function VisitCard({ visit, onPress, onRemove }: { visit: WorkPlanVisitRecord; onPress?: () => void; onRemove?: () => void }) {
    const when = clock(visit.planned_start_time);
    const contacts = Array.isArray(visit.contacts) && visit.contacts.length > 0
      ? visit.contacts
      : (visit.contact_person || visit.contact_number || visit.contact_email)
        ? [{ contact_person: visit.contact_person, contact_number: visit.contact_number, contact_email: visit.contact_email }]
        : [];
    const contactSummary = contacts.length > 0
      ? contacts.map((c) => [c.contact_person, c.contact_number].filter(Boolean).join(" · ")).filter(Boolean).join(" | ")
      : [visit.contact_person, visit.contact_number].filter(Boolean).join(" · ");

    return (
      <Card>
        <Pressable onPress={onPress} disabled={!onPress}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800", flex: 1 }}>{visit.party_name || "Party visit"}</Text>
            <StatusTag status={visit.status} />
          </View>
          {visit.purpose ? <Text style={{ color: colors.muted, fontSize: 12 }}>Purpose: {visit.purpose}</Text> : null}
          {contactSummary ? (
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
              {contactSummary}
            </Text>
          ) : null}
          {visit.address ? <Text style={{ color: colors.muted, fontSize: 12 }}>{visit.address}</Text> : null}
          {when ? <Text style={{ color: colors.muted, fontSize: 12 }}>{when}</Text> : null}
        </Pressable>
        {onRemove ? <Button label="Remove" variant="ghost" onPress={onRemove} /> : null}
      </Card>
    );
  }

  function WorkCard({ work, onPress, onRemove }: { work: WorkPlanWorkRecord; onPress?: () => void; onRemove?: () => void }) {
    const when = clock(work.planned_start_time);
    return (
      <Card>
        <Pressable onPress={onPress} disabled={!onPress}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <Text style={{ color: colors.text, fontWeight: "800", flex: 1 }}>{work.title}</Text>
            <StatusTag status={work.status} />
          </View>
          {work.description ? <Text style={{ color: colors.muted, fontSize: 12 }}>{stripHtml(work.description)}</Text> : null}
          {when ? <Text style={{ color: colors.muted, fontSize: 12 }}>{when}</Text> : null}
        </Pressable>
        {onRemove ? <Button label="Remove" variant="ghost" onPress={onRemove} /> : null}
      </Card>
    );
  }

  if (sourceId && source.isLoading) return <Screen header><Loading /></Screen>;

  const scopeHint = admin
    ? "All work planner users"
    : elevated
      ? "You and your reporting team"
      : "This plan is for you";

  return (
    <Screen header>
      <Card>
        <Text style={{ color: colors.text, fontWeight: "800" }}>Schedule</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {checkingPlan ? "Checking this date…" : scopeHint}
        </Text>
        {elevated ? (
          <PersonSelect label="Plan for" people={assignees} value={salesUserId} selfId={selfId} onChange={setSalesUserId} />
        ) : null}
        <DatePickerField label="Plan date" value={planDate} minDate={earliestOpenPlanDate()} onChange={setPlanDate} />
        {dateLocked ? (
          <Text style={{ color: colors.warning }}>
            This date is outside the 3-day window. The plan day and the next 2 days stay editable.
          </Text>
        ) : null}
      </Card>
      {completedLocked ? (
        <Card>
          <Text style={{ color: colors.danger, fontWeight: "800", fontSize: 15 }}>
            🔒 Plan Completed — Visits & Tasks Locked
          </Text>
          <Text style={{ color: colors.muted }}>
            The work plan for {formatPlanDate(planDate)} is already completed and locked. New visits and tasks cannot be added to a completed plan. Please select a different date.
          </Text>
        </Card>
      ) : updating && !dateLocked ? (
        <Card>
          <Text style={{ color: colors.text, fontWeight: "700" }}>
            Existing {loadedPlan?.status} plan for {formatPlanDate(planDate)}
          </Text>
          <Text style={{ color: colors.muted }}>The details below are that plan. Saving will update and mail it.</Text>
        </Card>
      ) : null}
      <FilterBar>
        {PLAN_TYPES.map((type) => (
          <Chip key={type} label={type} active={planType === type} onPress={readOnly ? undefined : () => setPlanType(type)} />
        ))}
      </FilterBar>
      {planType === "Leave" ? <Text style={{ color: colors.muted }}>Leave plans do not include visits or tasks.</Text> : null}
      <Field label="Location" value={location} onChangeText={setLocation} placeholder="City or area" editable={!readOnly} />
      <Field label="Remarks" value={remarks} onChangeText={setRemarks} multiline editable={!readOnly} />
      <Chip
        label={discussed ? "Discussed with manager / coordinator" : "Not discussed with manager / coordinator"}
        active={discussed}
        onPress={readOnly ? undefined : () => {
          setDiscussed((value) => {
            const next = !value;
            if (next && !discussedManagerId) {
              const preset = assignedManager();
              if (preset.id) {
                setDiscussedManagerId(preset.id);
                setManagerName(preset.name);
              }
            }
            return next;
          });
        }}
      />
      {discussed ? (
        <>
          <Section>Discussed with</Section>
          <FilterBar>
            {managerOptions.map((manager) => (
              <Chip
                key={manager._id}
                label={manager.name || manager.email || "Manager"}
                active={discussedManagerId === manager._id}
                onPress={readOnly ? undefined : () => {
                  setDiscussedManagerId(manager._id);
                  setManagerName(manager.name || "");
                }}
              />
            ))}
          </FilterBar>
          <FilterBar>
            {METHODS.map((item) => (
              <Chip key={item.id} label={item.label} active={method === item.id} onPress={readOnly ? undefined : () => setMethod(item.id)} />
            ))}
          </FilterBar>
        </>
      ) : null}
      {showsVisits(planType) ? (
        <>
          <Section>Planned visits ({(loadedPlan?.visits?.length || 0) + visits.length})</Section>
          {completedLocked ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>Cannot add visits to a completed plan.</Text>
          ) : null}
          {!completedLocked && !readOnly ? (
            <SplitActions>
              <Button label="Add visit" onPress={() => { setEditingVisitId(null); setVisitOpen(true); }} />
              <Button label="Previous visits" variant="ghost" onPress={() => { setPendingQuery(""); setPickedIds([]); setPendingMode("visits"); }} />
            </SplitActions>
          ) : null}
          {(loadedPlan?.visits || []).length + visits.length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>No visits added yet.</Text>
          ) : null}
          {(loadedPlan?.visits || []).map((visit) => (
            <VisitCard key={recordId(visit)} visit={visit} />
          ))}
          {visits.map((visit) => (
            <VisitCard
              key={visit.localId}
              visit={visit}
              onPress={readOnly ? undefined : () => { setEditingVisitId(visit.localId); setVisitOpen(true); }}
              onRemove={readOnly ? undefined : () => setVisits((list) => list.filter((item) => item.localId !== visit.localId))}
            />
          ))}
        </>
      ) : null}

      {showsTasks(planType) ? (
        <>
          <Section>Planned tasks ({(loadedPlan?.works?.length || 0) + works.length})</Section>
          {completedLocked ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>Cannot add tasks to a completed plan.</Text>
          ) : null}
          {templates.length && !readOnly ? (
            <FilterBar>
              {templates.map((template) => (
                <Chip
                  key={template.id || template.title}
                  label={template.title}
                  onPress={() =>
                    setWorks((list) =>
                      list.some((work) => work.title === template.title)
                        ? list
                        : [...list, { localId: `tpl-${Date.now()}`, sequence: list.length + 1, status: "created", title: template.title, description: template.description }],
                    )
                  }
                />
              ))}
            </FilterBar>
          ) : null}
          {!completedLocked && !readOnly ? (
            <View style={{ gap: 8 }}>
              <SplitActions>
                <Button label="Add task" onPress={() => { setEditingWorkId(null); setWorkOpen(true); }} />
                <Button label="Previous tasks" variant="ghost" onPress={() => { setPendingQuery(""); setPickedIds([]); setPendingMode("tasks"); }} />
              </SplitActions>
              <Button
                label={autoRolloverLoading ? "Rolling over…" : "Auto Rollover (3 Days)"}
                variant="ghost"
                onPress={() => void handleAutoRollover(true)}
                disabled={autoRolloverLoading}
              />
            </View>
          ) : null}
          {(loadedPlan?.works || []).length + works.length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>No tasks added yet.</Text>
          ) : null}
          {(loadedPlan?.works || []).map((work) => (
            <WorkCard key={recordId(work)} work={work} />
          ))}
          {works.map((work) => (
            <WorkCard
              key={work.localId}
              work={work}
              onPress={readOnly ? undefined : () => { setEditingWorkId(work.localId); setWorkOpen(true); }}
              onRemove={readOnly ? undefined : () => setWorks((list) => list.filter((item) => item.localId !== work.localId))}
            />
          ))}
        </>
      ) : null}

      <Sheet
        visible={Boolean(pendingMode)}
        title={pendingMode === "visits" ? "Add previous visits" : "Add previous tasks"}
        subtitle="Created, pending, and in-progress items from open plans. Status and remarks stay as they are."
        onClose={() => setPendingMode(null)}
      >
        <Field label="Search" value={pendingQuery} onChangeText={setPendingQuery} placeholder={pendingMode === "visits" ? "Party, purpose, address" : "Title, description"} />
        {pendingItems.length > 0 ? (
          <Button
            label={pickedIds.length === pendingItems.length ? "Deselect all" : "Select all"}
            variant="ghost"
            onPress={() => setPickedIds(pickedIds.length === pendingItems.length ? [] : pendingItems.map((item) => item.key))}
          />
        ) : null}
        {pendingPlans.isFetching ? <Text style={{ color: colors.muted }}>Loading previous items…</Text> : null}
        {!pendingPlans.isFetching && pendingItems.length === 0 ? (
          <Text style={{ color: colors.muted }}>No created, pending, or in-progress {pendingMode} found.</Text>
        ) : null}
        {pendingItems.map((item) => {
          const selected = pickedIds.includes(item.key);
          return (
            <Pressable
              key={item.key}
              onPress={() => setPickedIds((current) => (current.includes(item.key) ? current.filter((id) => id !== item.key) : [...current, item.key]))}
              style={{ borderWidth: 1, borderColor: selected ? colors.primary : colors.border, borderRadius: 12, padding: 12, gap: 4, backgroundColor: selected ? colors.primarySoft : colors.cardAlt }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <Text style={{ color: colors.text, fontWeight: "800", flex: 1 }}>{item.title}</Text>
                <Text style={{ color: statusColor[item.status] || colors.primary, fontSize: 11, fontWeight: "800" }}>{statusLabel(item.status)}</Text>
              </View>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{formatPlanDate(item.planDate)}</Text>
              {item.detail ? <Text style={{ color: colors.muted, fontSize: 12 }}>{item.detail}</Text> : null}
              {item.notes ? <Text style={{ color: colors.text, fontSize: 12 }}>{item.notes}</Text> : null}
              {item.remarks ? <Text style={{ color: colors.warning, fontSize: 12 }}>Remarks: {item.remarks}</Text> : null}
            </Pressable>
          );
        })}
        <SplitActions>
          <Button label="Cancel" variant="ghost" onPress={() => setPendingMode(null)} />
          <Button
            label={`Add selected (${pickedIds.length})`}
            disabled={pickedIds.length === 0}
            onPress={() => {
              const chosen = pendingItems.filter((item) => pickedIds.includes(item.key));
              if (pendingMode === "visits") {
                setVisits((list) => [
                  ...list,
                  ...chosen.map((item) => ({ ...(item.raw as WorkPlanVisitRecord), localId: `p-${item.key}` })),
                ]);
              } else {
                setWorks((list) => [
                  ...list,
                  ...chosen.map((item) => ({ ...(item.raw as WorkPlanWorkRecord), localId: `p-${item.key}` })),
                ]);
              }
              setPendingMode(null);
            }}
          />
        </SplitActions>
      </Sheet>

      <Button label={updating ? "Update and mail" : "Create and mail"} disabled={!planDate || saving || checkingPlan || readOnly} onPress={prepareMail} />

      <VisitFormSheet
        visible={visitOpen}
        mode={editingVisit ? "edit" : "create"}
        planDate={planDate}
        salesUserId={targetUserId}
        initial={editingVisit ? {
          party_type: editingVisit.party_type,
          party: typeof editingVisit.party === "string" ? editingVisit.party : editingVisit.party?._id,
          party_name: editingVisit.party_name,
          contact_person: editingVisit.contact_person,
          contact_number: editingVisit.contact_number,
          contact_email: editingVisit.contact_email,
          contacts: editingVisit.contacts,
          address: editingVisit.address,
          purpose: editingVisit.purpose,
          notes: editingVisit.notes,
          planned_start_time: editingVisit.planned_start_time,
          planned_end_time: editingVisit.planned_end_time,
        } : null}
        onClose={() => { setVisitOpen(false); setEditingVisitId(null); }}
        onSubmit={(body) => {
          if (completedLocked) {
            Alert.alert("Completed plan", "This work plan is completed. Visits cannot be added to this day.");
            return;
          }
          const fields = {
            party_type: body.party_type as WorkPlanVisitRecord["party_type"],
            party: body.party as string | undefined,
            party_name: String(body.party_name || ""),
            contact_person: String(body.contact_person || ""),
            contact_number: String(body.contact_number || ""),
            contact_email: body.contact_email as string | undefined,
            contacts: body.contacts as WorkPlanVisitRecord["contacts"],
            address: body.address as string | undefined,
            purpose: body.purpose as string | undefined,
            notes: body.notes as string | undefined,
            planned_start_time: body.planned_start_time as string | undefined,
            planned_end_time: body.planned_end_time as string | undefined,
          };
          setVisits((list) =>
            editingVisitId
              ? list.map((item) => (item.localId === editingVisitId ? { ...item, ...fields } : item))
              : [...list, { localId: `n-${Date.now()}`, sequence: list.length + 1, status: "created", ...fields }],
          );
          setVisitOpen(false);
          setEditingVisitId(null);
        }}
      />
      <WorkFormSheet
        visible={workOpen}
        mode={editingWork ? "edit" : "create"}
        planDate={planDate}
        salesUserId={targetUserId}
        initial={editingWork}
        onClose={() => { setWorkOpen(false); setEditingWorkId(null); }}
        onSubmit={(body) => {
          if (completedLocked) {
            Alert.alert("Completed plan", "This work plan is completed. Tasks cannot be added to this day.");
            return;
          }
          const fields = {
            title: String(body.title || ""),
            description: body.description as string | undefined,
            planned_start_time: body.planned_start_time as string | undefined,
            planned_end_time: body.planned_end_time as string | undefined,
          };
          setWorks((list) =>
            editingWorkId
              ? list.map((item) => (item.localId === editingWorkId ? { ...item, ...fields } : item))
              : [...list, { localId: `n-${Date.now()}`, sequence: list.length + 1, status: "created", ...fields }],
          );
          setWorkOpen(false);
          setEditingWorkId(null);
        }}
      />
      <MailSheet
        visible={mailOpen}
        title={updating ? "Update plan mail" : "Create plan mail"}
        saving={saving}
        initialTo={mail.to}
        initialCc={mail.cc}
        initialSubject={mail.subject}
        initialBody={mail.body}
        toLocked={mail.toLocked}
        summary={mail.summary}
        recipients={managerOptions
          .filter((manager) => manager.email)
          .map((manager) => ({
            id: manager._id,
            name: manager.name,
            email: manager.email,
            roleBadge: manager.roleBadge,
          }))}
        onClose={() => setMailOpen(false)}
        onSubmit={(next) => void sendMail(next)}
      />
    </Screen>
  );
}
