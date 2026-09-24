import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { File } from "expo-file-system";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { DatePickerField } from "@/components/DateRangePicker";
import { PersonSelect } from "@/components/PersonSelect";
import { Button, Field, SplitActions } from "@/components/ui";
import { earliestOpenPlanDate, formatPlanDate, personId } from "@/lib/dates";
import { useSession } from "@/lib/session";
import { useGetUsersQuery } from "@/store/api/authApiSlice";
import { useLazyGetPlansQuery, useGetMyTeamQuery, useGetPlansQuery, useGetUserSettingsQuery } from "@/store/api/workPlannerApiSlice";
import type { LeadRecord } from "@/types/lead";
import type { PartyRecord } from "@/types/party";
import { canReceiveWorkPlan, isWpAdmin, isWpElevated, isWpManager } from "@/utils/roles";
import { mailStatusLabel, type DayEndMailSummary, type PlanMailSummary } from "@/lib/planMail";
import { useGetLeadsQuery } from "@/store/api/leadsApiSlice";
import { useGetPartiesQuery } from "@/store/api/partyApiSlice";
import {
  WORK_PLAN_EXPENSE_CATEGORIES,
  WORK_PLAN_EXPENSE_PAYMENT_MODES,
  WORK_PLAN_TRAVEL_SUB_CATEGORIES,
  type WorkPlanExpenseCategory,
  type WorkPlanExpensePaymentMode,
  type WorkPlanVisitPartyType,
} from "@/types/workPlanner";
import { useThemeColors, type ThemeColors } from "@/theme";

function useSheetStyles() {
  const colors = useThemeColors();
  return useMemo(() => sheetStyles(colors), [colors]);
}

export type LocalFile = { uri: string; name: string; type: string };

export async function pickImageFile(): Promise<LocalFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const name = asset.fileName || `upload-${Date.now()}.jpg`;
  return { uri: asset.uri, name, type: asset.mimeType || "image/jpeg" };
}

export function toFormFile(file: LocalFile): Blob {
  const source = new File(file.uri);
  if (file.type && !source.type) {
    try {
      Object.defineProperty(source, "type", { value: file.type, enumerable: true });
    } catch {
      // The native file already exposes a content type.
    }
  }
  return source;
}

export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = useSheetStyles();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <Text style={styles.heading}>{title}</Text>
          {subtitle ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: -8, marginBottom: 8 }}>{subtitle}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const PARTY_TYPES: Array<{ id: WorkPlanVisitPartyType; label: string }> = [
  { id: "existing", label: "Existing Party" },
  { id: "existing_lead", label: "Existing Leads" },
  { id: "new_party", label: "New Party" },
  { id: "new_lead", label: "New Leads" },
];

function timeFromValue(value?: string | null) {
  if (!value) return "";
  const match = String(value).match(/T(\d{2}:\d{2})/);
  if (match) return match[1];
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function combineDateTime(date: string, time: string) {
  const trimmed = time.trim();
  if (!trimmed) return undefined;
  const clock = trimmed.length === 5 ? `${trimmed}:00` : trimmed;
  return `${date}T${clock}`;
}

function partyContact(party: PartyRecord) {
  const contact = party.contacts?.[0];
  return {
    name: party.contact_person || contact?.name || contact?.contact_person || "",
    phone: party.mobile || contact?.phone || contact?.contact_number || contact?.alternate_phone || "",
    email: party.email || contact?.email || contact?.contact_email || "",
  };
}

function formatPartyAddress(party: PartyRecord) {
  const line = (address?: PartyRecord["billing_address"]) =>
    [address?.street, address?.city, address?.state, address?.pincode].filter(Boolean).join(", ");
  return line(party.billing_address) || line(party.shipping_address) || [party.district, party.state].filter(Boolean).join(", ");
}

function formatLeadAddress(lead: LeadRecord) {
  const address = lead.billing_address;
  if (!address) return "";
  return [address.address_line_1, address.address_line_2, address.city, address.state, address.pincode].filter(Boolean).join(", ");
}

function useAssignablePeople(open: boolean) {
  const { session } = useSession();
  const selfId = personId(session?.user);
  const admin = isWpAdmin(session?.user);
  const manager = isWpManager(session?.user);
  const elevated = isWpElevated(session?.user);
  const users = useGetUsersQuery(undefined, { skip: !open || !admin });
  const team = useGetMyTeamQuery(undefined, { skip: !open || !elevated || admin });
  const people = useMemo(() => {
    type Person = { _id: string; name?: string; email?: string };
    const self: Person | null = selfId ? { _id: selfId, name: session?.user?.name || "Me", email: session?.user?.email } : null;
    const toPeople = (rows: Array<{ _id?: string; id?: string; name?: string; email?: string }>) => {
      const list: Person[] = [];
      for (const user of rows) {
        const id = String(user._id || user.id || "");
        if (id) list.push({ _id: id, name: user.name, email: user.email });
      }
      return list;
    };
    const withSelf = (list: Person[]) => {
      if (self && !list.some((user) => user._id === self._id)) list.unshift(self);
      return list.sort((a, b) => (a._id === selfId ? -1 : b._id === selfId ? 1 : 0));
    };
    if (!elevated) return self ? [self] : [];
    if (admin) return withSelf(toPeople((users.data || []).filter((user) => canReceiveWorkPlan(user, selfId))));
    return withSelf(toPeople((team.data?.members || []) as Array<{ _id?: string; id?: string; name?: string; email?: string }>));
  }, [admin, elevated, users.data, team.data, selfId, session?.user]);
  return { people, selfId, admin, manager, elevated, name: session?.user?.name || "Self" };
}

function useDatePlan(visible: boolean, date: string, userId: string) {
  const plans = useGetPlansQuery(
    { sales_user: userId, sales_user_id: userId, date, limit: 5 },
    { skip: !visible || !date || !userId },
  );
  const existing = (plans.data?.data || []).find(
    (plan) => !plan.is_standalone && !String(plan._id || plan.id || "").startsWith("standalone_"),
  );
  return {
    fetching: plans.isFetching,
    existing,
    completed: existing?.status === "completed",
  };
}

function PlanMatchBanner({
  visible,
  date,
  userId,
  noun,
}: {
  visible: boolean;
  date: string;
  userId: string;
  noun: "visit" | "task";
}) {
  const colors = useThemeColors();
  const { fetching, existing, completed } = useDatePlan(visible, date, userId);
  const border = completed ? colors.danger : existing ? "#a7f3d0" : colors.border;
  const background = completed ? colors.cardAlt : existing ? "#f0fdf4" : colors.cardAlt;
  return (
    <View style={{ borderWidth: 1, borderColor: border, borderRadius: 12, padding: 10, backgroundColor: background }}>
      {fetching ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>Checking for a work plan…</Text>
      ) : completed ? (
        <Text style={{ color: colors.danger, fontSize: 12 }}>
          The work plan for {formatPlanDate(date)} is completed. New {noun}s cannot be added to this day.
        </Text>
      ) : existing ? (
        <Text style={{ color: colors.success, fontSize: 12 }}>
          Work plan found ({existing.status || "planned"}). This {noun} will be added to the plan for {formatPlanDate(date)}.
        </Text>
      ) : (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          No work plan for this date. This {noun} will be created as a standalone {noun}.
        </Text>
      )}
    </View>
  );
}

export function VisitFormSheet({
  visible,
  saving,
  mode = "create",
  planDate,
  salesUserId,
  initial,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  saving?: boolean;
  mode?: "create" | "edit";
  planDate: string;
  salesUserId?: string;
  initial?: {
    party_type?: WorkPlanVisitPartyType;
    party?: string;
    party_name?: string;
    contact_person?: string;
    contact_number?: string;
    contact_email?: string;
    address?: string;
    purpose?: string;
    notes?: string;
    planned_start_time?: string;
    planned_end_time?: string;
  } | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const styles = useSheetStyles();
  const colors = useThemeColors();
  const roster = useAssignablePeople(visible);
  const [date, setDate] = useState(planDate);
  const [userId, setUserId] = useState(salesUserId || "");
  const [partyType, setPartyType] = useState<WorkPlanVisitPartyType>("existing");
  const [search, setSearch] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [partyName, setPartyName] = useState("");
  const [partyId, setPartyId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [address, setAddress] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const datePlan = useDatePlan(visible, date, userId || roster.selfId);
  const existingParty = partyType === "existing";
  const existingLead = partyType === "existing_lead";
  const existingType = existingParty || existingLead;
  const searchReady = listOpen && search.trim().length >= 2;
  const parties = useGetPartiesQuery(
    { search: search.trim(), limit: 8 },
    { skip: !visible || !existingParty || !searchReady },
  );
  const leads = useGetLeadsQuery(
    { search: search.trim(), assigned_to: userId || undefined, limit: 8, paginate: "true" },
    { skip: !visible || !existingLead || !searchReady },
  );

  useEffect(() => {
    if (!visible) return;
    setDate(planDate.slice(0, 10) || planDate);
    setUserId(salesUserId || roster.selfId);
    setPartyType(initial?.party_type || "existing");
    setPartyId(initial?.party || "");
    setLeadId("");
    setPartyName(initial?.party_name || "");
    setContactPerson(initial?.contact_person || "");
    setContactNumber(initial?.contact_number || "");
    setContactEmail(initial?.contact_email || "");
    setAddress(initial?.address || "");
    setPurpose(initial?.purpose || "");
    setNotes(initial?.notes || "");
    setStart(timeFromValue(initial?.planned_start_time));
    setEnd(timeFromValue(initial?.planned_end_time));
    setSearch("");
    setListOpen(false);
    setErrors({});
    // Hydrate once each time the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const subtitle = roster.admin
    ? "Portal Admin — assign and schedule a visit for any portal member"
    : roster.manager
      ? "Portal Manager — assign and schedule a visit for yourself or your team"
      : "Schedule your field visit details";

  function chooseParty(party: PartyRecord) {
    const contact = partyContact(party);
    setPartyId(party._id || party.id || "");
    setLeadId("");
    setPartyName(party.party_name || "");
    setContactPerson(contact.name);
    setContactNumber(contact.phone);
    setContactEmail(contact.email);
    setAddress(formatPartyAddress(party));
    setSearch("");
    setListOpen(false);
    setErrors((prev) => ({ ...prev, partyName: "", contactPerson: "", contactNumber: "" }));
  }

  function chooseLead(lead: LeadRecord) {
    const contacts = lead.contacts || [];
    const primary = contacts.find((contact) => contact.is_primary) || contacts[0];
    setLeadId(lead._id || lead.id || "");
    setPartyId("");
    setPartyName(lead.company_name?.trim() || lead.name?.trim() || lead.lead_no || "Lead");
    setContactPerson(primary?.name || lead.name || "");
    setContactNumber(primary?.phone || lead.phone || lead.alternate_phone || "");
    setContactEmail(primary?.email || lead.email || "");
    setAddress(formatLeadAddress(lead));
    setSearch("");
    setListOpen(false);
    setErrors((prev) => ({ ...prev, partyName: "", contactPerson: "", contactNumber: "" }));
  }

  function save() {
    if (datePlan.completed) {
      Alert.alert("Completed plan", `The work plan for ${formatPlanDate(date)} is completed. Visits cannot be added to this day.`);
      return;
    }
    const next: Record<string, string> = {};
    if (!date) next.planDate = "Plan date is required";
    if (!partyName.trim()) next.partyName = existingLead ? "Lead / company name is required" : "Party / company name is required";
    if (existingParty && !partyId) next.partyName = "Select an existing party from the list";
    if (!contactPerson.trim()) next.contactPerson = "Contact person name is required";
    if (!contactNumber.trim()) next.contactNumber = "Contact number is required";
    if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) next.contactEmail = "Enter a valid email address";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    const fallback = `${(contactPerson.trim().toLowerCase().replace(/[^a-z0-9]/g, "") || "contact")}@client.com`;
    onSubmit({
      planDate: date,
      salesUserId: userId || roster.selfId,
      party_type: partyType,
      ...(existingParty && partyId ? { party: partyId } : {}),
      party_name: partyName.trim(),
      contact_person: contactPerson.trim(),
      contact_number: contactNumber.trim(),
      contact_email: contactEmail.trim() || fallback,
      address: address.trim() || undefined,
      purpose: purpose.trim() || undefined,
      notes: notes.trim() || undefined,
      planned_start_time: combineDateTime(date, start),
      planned_end_time: combineDateTime(date, end),
    });
  }

  return (
    <Sheet visible={visible} title={mode === "create" ? "Add field visit" : "Edit field visit"} subtitle={subtitle} onClose={onClose}>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 10, backgroundColor: colors.cardAlt }}>
        <DatePickerField label="Plan date" value={date} minDate={earliestOpenPlanDate()} onChange={setDate} />
        {errors.planDate ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errors.planDate}</Text> : null}
        {roster.elevated ? (
          <PersonSelect label="Assign executive / team member" people={roster.people} value={userId} selfId={roster.selfId} onChange={setUserId} />
        ) : (
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>Assign executive / team member</Text>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{roster.name} (Executive)</Text>
          </View>
        )}
      </View>
      <PlanMatchBanner visible={visible} date={date} userId={userId || roster.selfId} noun="visit" />
      <View style={styles.row}>
        {PARTY_TYPES.map((item) => {
          const selected = partyType === item.id;
          return (
            <Pressable
              key={item.id}
              style={[styles.choice, selected && styles.choiceOn, { flexDirection: "row", alignItems: "center", gap: 6 }]}
              onPress={() => {
                setPartyType(item.id);
                if (item.id !== "existing") setPartyId("");
                if (item.id !== "existing_lead") setLeadId("");
                setListOpen(false);
              }}
            >
              <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={14} color={selected ? colors.primary : colors.muted} />
              <Text style={styles.choiceText}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {existingType ? (
        <View style={{ gap: 8 }}>
          {listOpen ? (
            <View style={{ gap: 8 }}>
              <Field
                label={existingLead ? "Search existing lead" : "Search existing party"}
                value={search}
                autoFocus
                placeholder={existingLead ? "Company, contact, phone, lead no" : "Party name, mobile, email"}
                onChangeText={setSearch}
              />
              <Button label="Close search" variant="ghost" onPress={() => { setListOpen(false); setSearch(""); }} />
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>
                {existingLead ? "Existing lead" : "Existing party"}
              </Text>
              <Pressable
                onPress={() => {
                  setSearch("");
                  setListOpen(true);
                }}
                style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Ionicons name="search-outline" size={18} color={colors.muted} />
                <Text style={{ color: partyName ? colors.text : colors.muted, flex: 1, fontWeight: partyName ? "700" : "400" }} numberOfLines={1}>
                  {partyName || (existingLead ? "Tap to search a lead" : "Tap to search a party")}
                </Text>
              </Pressable>
            </View>
          )}
          {errors.partyName ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errors.partyName}</Text> : null}
          {listOpen && existingLead && !userId ? (
            <Text style={{ color: colors.primary, fontSize: 12 }}>Showing accessible leads. Choose an executive to filter by assignee.</Text>
          ) : null}
          {listOpen ? (
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden" }}>
              {!searchReady ? (
                <Text style={{ color: colors.muted, padding: 12, fontSize: 12 }}>Type at least 2 letters to search.</Text>
              ) : existingLead ? (
                leads.isFetching ? (
                  <Text style={{ color: colors.muted, padding: 12, fontSize: 12 }}>Searching…</Text>
                ) : (leads.data || []).length === 0 ? (
                  <Text style={{ color: colors.muted, padding: 12, fontSize: 12 }}>No leads found. Switch to New Leads to add one manually.</Text>
                ) : (
                  (leads.data || []).slice(0, 8).map((lead) => {
                    const id = lead._id || lead.id || "";
                    const primary = (lead.contacts || []).find((contact) => contact.is_primary) || lead.contacts?.[0];
                    return (
                      <Pressable key={id} style={styles.option} onPress={() => chooseLead(lead)}>
                        <Text style={{ color: colors.text, fontWeight: "700" }}>{lead.company_name || lead.name || lead.lead_no || "Lead"}</Text>
                        {primary?.name || lead.phone ? (
                          <Text style={{ color: colors.muted, fontSize: 12 }}>{[primary?.name || lead.name, primary?.phone || lead.phone].filter(Boolean).join(" · ")}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })
                )
              ) : parties.isFetching ? (
                <Text style={{ color: colors.muted, padding: 12, fontSize: 12 }}>Searching…</Text>
              ) : (parties.data || []).length === 0 ? (
                <Text style={{ color: colors.muted, padding: 12, fontSize: 12 }}>No parties found. Switch to New Party to add one manually.</Text>
              ) : (
                (parties.data || []).slice(0, 8).map((party) => {
                  const id = party._id || party.id || "";
                  const contact = partyContact(party);
                  return (
                    <Pressable key={id} style={styles.option} onPress={() => chooseParty(party)}>
                      <Text style={{ color: colors.text, fontWeight: "700" }}>{party.party_name}</Text>
                      {contact.name || contact.phone ? (
                        <Text style={{ color: colors.muted, fontSize: 12 }}>{[contact.name, contact.phone].filter(Boolean).join(" · ")}</Text>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          <Field
            label={partyType === "new_lead" ? "Lead / company name" : "Party / company name"}
            value={partyName}
            onChangeText={setPartyName}
            placeholder="e.g. Apex Health Systems"
          />
          {errors.partyName ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errors.partyName}</Text> : null}
        </View>
      )}
      <Field label="Contact person name" value={contactPerson} onChangeText={setContactPerson} placeholder="Dr. Rajesh Gupta / Mr. Sharma" />
      {errors.contactPerson ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errors.contactPerson}</Text> : null}
      <Field label="Contact phone / mobile" value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" placeholder="9876543210" />
      {errors.contactNumber ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errors.contactNumber}</Text> : null}
      <Field label="Contact email (optional)" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" placeholder="contact@client.com" />
      {errors.contactEmail ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errors.contactEmail}</Text> : null}
      <Field label="Address / location" value={address} onChangeText={setAddress} placeholder="City, state, or full address" />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Field label="Planned start time" value={start} onChangeText={setStart} placeholder="HH:MM" /></View>
        <View style={{ flex: 1 }}><Field label="Planned end time" value={end} onChangeText={setEnd} placeholder="HH:MM" /></View>
      </View>
      <Field label="Purpose / objective" value={purpose} onChangeText={setPurpose} placeholder="Product demo, order collection, follow-up" />
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Preparatory notes or discussion points" />
      <SplitActions>
        <Button label="Cancel" variant="ghost" onPress={onClose} />
        <Button label={saving ? "Saving…" : mode === "create" ? "Add visit" : "Save changes"} disabled={saving || datePlan.completed || datePlan.fetching} onPress={save} />
      </SplitActions>
    </Sheet>
  );
}

export function WorkFormSheet({
  visible,
  saving,
  mode = "create",
  planDate,
  salesUserId,
  initial,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  saving?: boolean;
  mode?: "create" | "edit";
  planDate: string;
  salesUserId?: string;
  initial?: { title?: string; description?: string; planned_start_time?: string; planned_end_time?: string } | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const colors = useThemeColors();
  const roster = useAssignablePeople(visible);
  const [date, setDate] = useState(planDate);
  const [userId, setUserId] = useState(salesUserId || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");
  const datePlan = useDatePlan(visible, date, userId || roster.selfId);
  const settings = useGetUserSettingsQuery(userId || roster.selfId, { skip: !visible || !(userId || roster.selfId) });
  const templates = (settings.data?.customWorkTemplates || []) as Array<{
    id?: string;
    title: string;
    description?: string;
    planned_start_time?: string;
    planned_end_time?: string;
  }>;

  useEffect(() => {
    if (!visible) return;
    setDate(planDate.slice(0, 10) || planDate);
    setUserId(salesUserId || roster.selfId);
    setTitle(initial?.title || "");
    setDescription(initial?.description || "");
    setStart(timeFromValue(initial?.planned_start_time));
    setEnd(timeFromValue(initial?.planned_end_time));
    setError("");
    // Hydrate once each time the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const subtitle = roster.admin
    ? "Portal Admin — assign and schedule a task for any portal member"
    : roster.manager
      ? "Portal Manager — assign and schedule a task for yourself or your team"
      : "Schedule your work task details";

  function save() {
    if (datePlan.completed) {
      Alert.alert("Completed plan", `The work plan for ${formatPlanDate(date)} is completed. Tasks cannot be added to this day.`);
      return;
    }
    if (!date) {
      setError("Plan date is required");
      return;
    }
    if (!title.trim()) {
      setError("Task title is required");
      return;
    }
    onSubmit({
      planDate: date,
      salesUserId: userId || roster.selfId,
      title: title.trim(),
      description: description.trim() || undefined,
      planned_start_time: combineDateTime(date, start),
      planned_end_time: combineDateTime(date, end),
    });
  }

  return (
    <Sheet visible={visible} title={mode === "create" ? "Add work task" : "Edit work task"} subtitle={subtitle} onClose={onClose}>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 10, backgroundColor: colors.cardAlt }}>
        <DatePickerField label="Plan date" value={date} minDate={earliestOpenPlanDate()} onChange={setDate} />
        {roster.elevated ? (
          <PersonSelect label="Assign executive / team member" people={roster.people} value={userId} selfId={roster.selfId} onChange={setUserId} />
        ) : (
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>Assign executive / team member</Text>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{roster.name} (Executive)</Text>
          </View>
        )}
      </View>
      <PlanMatchBanner visible={visible} date={date} userId={userId || roster.selfId} noun="task" />
      {mode === "create" && templates.length > 0 ? (
        <View style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 12, padding: 12, gap: 8, backgroundColor: colors.primarySoft }}>
          <Text style={{ color: colors.primary, fontWeight: "800" }}>Quick fill from custom templates ({templates.length})</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {templates.map((template) => (
              <Pressable
                key={template.id || template.title}
                onPress={() => {
                  setTitle(template.title);
                  if (template.description) setDescription(template.description);
                  if (template.planned_start_time) setStart(timeFromValue(template.planned_start_time) || template.planned_start_time.slice(0, 5));
                  if (template.planned_end_time) setEnd(timeFromValue(template.planned_end_time) || template.planned_end_time.slice(0, 5));
                  setError("");
                }}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.card }}
              >
                <Text style={{ color: colors.text, fontWeight: "600" }}>
                  {template.title}
                  {template.planned_start_time ? ` · ${template.planned_start_time}${template.planned_end_time ? `-${template.planned_end_time}` : ""}` : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <Field label="Task title / core objective" value={title} onChangeText={setTitle} placeholder="Quotation review, follow-up call, documentation" />
      {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
      <Field label="Task description and details" value={description} onChangeText={setDescription} multiline placeholder="Deliverables or action points" />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Field label="Planned start time" value={start} onChangeText={setStart} placeholder="HH:MM" /></View>
        <View style={{ flex: 1 }}><Field label="Planned end time" value={end} onChangeText={setEnd} placeholder="HH:MM" /></View>
      </View>
      <SplitActions>
        <Button label="Cancel" variant="ghost" onPress={onClose} />
        <Button label={saving ? "Saving…" : mode === "create" ? "Add task" : "Save changes"} disabled={saving || datePlan.completed || datePlan.fetching} onPress={save} />
      </SplitActions>
    </Sheet>
  );
}

export function ExpenseFormSheet({
  visible,
  saving,
  planDate,
  initial,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  saving?: boolean;
  planDate: string;
  initial?: {
    category?: WorkPlanExpenseCategory;
    sub_category?: string;
    amount?: number;
    payment_mode?: WorkPlanExpensePaymentMode;
    vendor_name?: string;
    bill_number?: string;
    description?: string;
    start_reading?: number;
    closing_reading?: number;
  } | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>, file: LocalFile | null) => void;
}) {
  const [category, setCategory] = useState<WorkPlanExpenseCategory>("Travel");
  const [sub, setSub] = useState<(typeof WORK_PLAN_TRAVEL_SUB_CATEGORIES)[number]>("Cab");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<WorkPlanExpensePaymentMode>("Cash");
  const [vendor, setVendor] = useState("");
  const [bill, setBill] = useState("");
  const [description, setDescription] = useState("");
  const [startReading, setStartReading] = useState("");
  const [endReading, setEndReading] = useState("");
  const [file, setFile] = useState<LocalFile | null>(null);
  const bike = category === "Travel" && sub === "Private Bike";
  const styles = useSheetStyles();

  useEffect(() => {
    if (!visible) return;
    setCategory(initial?.category || "Travel");
    setSub((initial?.sub_category as (typeof WORK_PLAN_TRAVEL_SUB_CATEGORIES)[number]) || "Cab");
    setAmount(initial?.amount != null ? String(initial.amount) : "");
    setMode(initial?.payment_mode || "Cash");
    setVendor(initial?.vendor_name || "");
    setBill(initial?.bill_number || "");
    setDescription(initial?.description || "");
    setStartReading(initial?.start_reading != null ? String(initial.start_reading) : "");
    setEndReading(initial?.closing_reading != null ? String(initial.closing_reading) : "");
    setFile(null);
  }, [visible, initial]);

  return (
    <Sheet visible={visible} title="Expense" onClose={onClose}>
      <View style={styles.row}>
        {WORK_PLAN_EXPENSE_CATEGORIES.map((item) => (
          <Pressable key={item} style={[styles.choice, category === item && styles.choiceOn]} onPress={() => setCategory(item)}>
            <Text style={styles.choiceText}>{item}</Text>
          </Pressable>
        ))}
      </View>
      {category === "Travel" ? (
        <View style={styles.row}>
          {WORK_PLAN_TRAVEL_SUB_CATEGORIES.map((item) => (
            <Pressable key={item} style={[styles.choice, sub === item && styles.choiceOn]} onPress={() => setSub(item)}>
              <Text style={styles.choiceText}>{item}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <View style={styles.row}>
        {WORK_PLAN_EXPENSE_PAYMENT_MODES.map((item) => (
          <Pressable key={item} style={[styles.choice, mode === item && styles.choiceOn]} onPress={() => setMode(item)}>
            <Text style={styles.choiceText}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="Vendor" value={vendor} onChangeText={setVendor} />
      <Field label="Bill number" value={bill} onChangeText={setBill} />
      <Field label="Description" value={description} onChangeText={setDescription} multiline />
      {bike ? (
        <>
          <Field label="Start reading" value={startReading} onChangeText={setStartReading} keyboardType="decimal-pad" />
          <Field label="Closing reading" value={endReading} onChangeText={setEndReading} keyboardType="decimal-pad" />
        </>
      ) : null}
      <Button label={file ? file.name : "Attach receipt"} variant="ghost" onPress={() => void pickImageFile().then(setFile)} />
      <Button
        label={saving ? "Saving…" : "Save expense"}
        disabled={saving || !amount}
        onPress={() =>
          onSubmit(
            {
              expense_date: planDate,
              category,
              sub_category: category === "Travel" ? sub : undefined,
              amount: Number(amount),
              payment_mode: mode,
              vendor_name: vendor.trim() || undefined,
              bill_number: bill.trim() || undefined,
              description: description.trim() || undefined,
              start_reading: bike ? Number(startReading) : null,
              closing_reading: bike ? Number(endReading) : null,
            },
            file,
          )
        }
      />
    </Sheet>
  );
}

export type MailRecipient = { id: string; name: string; email: string; roleBadge?: string };

function splitEmails(value?: string) {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function MailSheet({
  visible,
  title,
  saving,
  initialTo,
  initialCc,
  initialSubject,
  initialBody,
  recipients,
  toLocked,
  summary,
  dayEnd,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  saving?: boolean;
  initialTo?: string;
  initialCc?: string;
  initialSubject?: string;
  initialBody?: string;
  recipients?: MailRecipient[];
  toLocked?: boolean;
  summary?: PlanMailSummary | null;
  dayEnd?: DayEndMailSummary | null;
  onClose: () => void;
  onSubmit: (payload: { toEmail: string; cc: string; subject: string; body: string; files: LocalFile[] }) => void;
}) {
  const colors = useThemeColors();
  const [toEmail, setToEmail] = useState(initialTo || "");
  const [ccList, setCcList] = useState<string[]>([]);
  const [addingCc, setAddingCc] = useState(false);
  const [ccDraft, setCcDraft] = useState("");
  const [subject, setSubject] = useState(initialSubject || "");
  const [body, setBody] = useState(initialBody || "");
  const [files, setFiles] = useState<LocalFile[]>([]);
  const seeded = useRef(false);

  useEffect(() => {
    if (!visible) {
      seeded.current = false;
      return;
    }
    if (seeded.current) return;
    seeded.current = true;
    setToEmail(initialTo || "");
    setCcList(splitEmails(initialCc));
    setAddingCc(false);
    setCcDraft("");
    setSubject(initialSubject || "");
    setBody(initialBody || "");
    setFiles([]);
  }, [visible, initialTo, initialCc, initialSubject, initialBody]);

  function addCc(email: string) {
    const next = email.trim().toLowerCase();
    if (!next || !next.includes("@")) return;
    if (next === toEmail.trim().toLowerCase()) return;
    setCcList((list) => (list.some((item) => item === next) ? list : [...list, next]));
    setCcDraft("");
    setAddingCc(false);
  }

  const picks = (recipients || []).filter((person) => person.email);

  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <Field
        label="To"
        value={toEmail}
        onChangeText={toLocked ? undefined : setToEmail}
        editable={!toLocked}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Manager or admin email"
      />
      {toLocked ? <Text style={{ color: colors.muted, fontSize: 12 }}>Assigned executive. This address stays fixed.</Text> : null}
      {!toLocked && picks.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>Admins and managers</Text>
          {picks.map((person) => {
            const selected = toEmail.trim().toLowerCase() === person.email.toLowerCase();
            const inCc = ccList.includes(person.email.toLowerCase());
            return (
              <View key={person.id || person.email} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  onPress={() => setToEmail(person.email)}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primarySoft : colors.cardAlt,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: "700" }} numberOfLines={1}>
                    {person.name}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                    {person.roleBadge || "Manager"} · {person.email}
                  </Text>
                </Pressable>
                {!selected && !inCc ? (
                  <Pressable onPress={() => addCc(person.email)} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                    <Text style={{ color: colors.primary, fontWeight: "700" }}>+ CC</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>CC</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {ccList.map((email) => (
          <View
            key={email}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.cardAlt,
              paddingLeft: 10,
              paddingRight: 6,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 12 }}>{email}</Text>
            <Pressable accessibilityLabel={`Remove ${email}`} onPress={() => setCcList((list) => list.filter((item) => item !== email))}>
              <Ionicons name="close" size={14} color={colors.muted} />
            </Pressable>
          </View>
        ))}
        {addingCc ? null : (
          <Pressable
            onPress={() => setAddingCc(true)}
            style={{ borderRadius: 999, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6 }}
          >
            <Text style={{ color: colors.muted, fontWeight: "700" }}>Add CC</Text>
          </Pressable>
        )}
      </View>
      {addingCc ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput
            value={ccDraft}
            onChangeText={setCcDraft}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="email@company.com"
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => addCc(ccDraft)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.input,
              color: colors.text,
              paddingHorizontal: 12,
            }}
          />
          <Button label="Add" onPress={() => addCc(ccDraft)} />
        </View>
      ) : null}
      <Field label="Subject" value={subject} onChangeText={setSubject} />
      {dayEnd ? <DayEndMailPreview summary={dayEnd} /> : summary ? <PlanMailPreview summary={summary} /> : <Field label="Message" value={body} onChangeText={setBody} multiline />}
      <Button
        label={files.length ? `${files.length} attachment(s)` : "Add attachment"}
        variant="ghost"
        onPress={() =>
          void pickImageFile().then((file) => {
            if (file) setFiles((prev) => [...prev, file]);
          })
        }
      />
      <Button
        label={saving ? "Sending…" : "Send"}
        disabled={saving || !toEmail.trim() || !subject.trim()}
        onPress={() => {
          const to = toEmail.trim().toLowerCase();
          const selected = ccList.filter((email) => email && email !== to);
          onSubmit({ toEmail: toEmail.trim(), cc: selected.join(", "), subject: subject.trim(), body, files });
        }}
      />
    </Sheet>
  );
}

export function DayEndMailPreview({ summary }: { summary: DayEndMailSummary }) {
  const colors = useThemeColors();
  const checks = (visit: DayEndMailSummary["visits"][number]) =>
    [
      ["Doctor", visit.meeting_with_doctor],
      ["Purchase", visit.meeting_with_purchase],
      ["Finance", visit.meeting_with_finance],
      ["Engineer", visit.meeting_with_engineer],
      ["New product", visit.new_product_introduced],
      ["Order", visit.order_received],
    ] as const;
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.text, fontWeight: "800" }}>Day End Report — Summary</Text>
      <Text style={{ color: colors.muted }}>
        {summary.executiveName}
        {summary.fromEmail ? ` (${summary.fromEmail})` : ""} · {summary.planDate}
      </Text>
      <Text style={{ color: colors.muted }}>
        {summary.planType} · {summary.location || "N/A"} · Expenses ₹{summary.expensesTotal.toLocaleString("en-IN")}
      </Text>
      <Text style={{ color: colors.text, fontWeight: "800" }}>Field visits ({summary.visits.length})</Text>
      {summary.visits.length === 0 ? <Text style={{ color: colors.muted }}>No visits recorded for this plan.</Text> : null}
      {summary.visits.map((visit, index) => {
        const status = String(visit.status || "pending").toLowerCase();
        const note =
          status === "completed"
            ? visit.outcome
            : status === "in_progress"
              ? visit.in_progress_remarks
              : visit.pending_remarks || visit.outcome;
        const flagged = checks(visit).some(([, value]) => value !== undefined && value !== null);
        return (
          <View key={`${visit.party_name}-${index}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, gap: 2 }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{index + 1}. {visit.party_name || "N/A"}</Text>
            {visit.contact_person ? <Text style={{ color: colors.muted }}>Contact: {visit.contact_person}</Text> : null}
            <Text style={{ color: colors.muted }}>{visit.purpose || "General"} · {visit.planned_start_time || "—"}{visit.planned_end_time ? ` – ${visit.planned_end_time}` : ""}</Text>
            <Text style={{ color: colors.muted }}>{mailStatusLabel(status)}{note ? ` · ${note}` : ""}</Text>
            {status === "completed" && flagged ? (
              <Text style={{ color: colors.muted }}>
                {checks(visit).map(([label, value]) => `${label}: ${value ? "Yes" : "No"}`).join(" · ")}
              </Text>
            ) : null}
          </View>
        );
      })}
      <Text style={{ color: colors.text, fontWeight: "800" }}>Tasks / work items ({summary.tasks.length})</Text>
      {summary.tasks.length === 0 ? <Text style={{ color: colors.muted }}>No tasks recorded for this plan.</Text> : null}
      {summary.tasks.map((task, index) => {
        const status = String(task.status || "pending").toLowerCase();
        const note =
          status === "completed"
            ? task.completion_remarks || task.outcome
            : status === "in_progress"
              ? task.in_progress_remarks
              : task.pending_remarks;
        return (
          <View key={`${task.title}-${index}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, gap: 2 }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{index + 1}. {task.title || "Task"}</Text>
            {task.description ? <Text style={{ color: colors.muted }}>{task.description}</Text> : null}
            <Text style={{ color: colors.muted }}>{mailStatusLabel(status)}{note ? ` · ${note}` : ""}</Text>
          </View>
        );
      })}
      <Text style={{ color: colors.text, fontWeight: "800" }}>Key highlights</Text>
      <Text style={{ color: colors.muted }}>{summary.remarks || "Please add any specific highlights, order wins, follow-ups, or escalations here..."}</Text>
    </View>
  );
}

function PlanMailPreview({ summary }: { summary: PlanMailSummary }) {
  const colors = useThemeColors();
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.text, fontWeight: "800" }}>Work Plan {summary.action} — Summary</Text>
      <Text style={{ color: colors.muted }}>
        {summary.executiveName} · {summary.planDate} · {summary.planType} · {summary.location || "N/A"}
      </Text>
      <Text style={{ color: colors.muted }}>Discussed with manager: {summary.discussedLabel}</Text>
      {summary.visits.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Planned field visits ({summary.visits.length})</Text>
          {summary.visits.map((visit, index) => (
            <View key={`${visit.party_name}-${index}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{index + 1}. {visit.party_name || "N/A"}</Text>
              <Text style={{ color: colors.muted }}>{visit.contact_person || "—"}{visit.contact_number ? ` · ${visit.contact_number}` : ""}</Text>
              <Text style={{ color: colors.muted }}>{visit.address || "—"}</Text>
              <Text style={{ color: colors.muted }}>{mailStatusLabel(visit.status)} · {visit.planned_start_time || "Full day"}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {summary.tasks.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Planned work tasks ({summary.tasks.length})</Text>
          {summary.tasks.map((task, index) => (
            <View key={`${task.title}-${index}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{index + 1}. {task.title || "Task"}</Text>
              {task.description ? <Text style={{ color: colors.muted }}>{task.description}</Text> : null}
              <Text style={{ color: colors.muted }}>{mailStatusLabel(task.status)} · {task.planned_start_time || "Full day"}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={{ color: colors.text, fontWeight: "800" }}>Remarks</Text>
      <Text style={{ color: colors.muted }}>{summary.remarks || "No additional remarks added for this work plan."}</Text>
    </View>
  );
}

export function RejectSheet({
  visible,
  saving,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Sheet visible={visible} title="Reject expense" onClose={onClose}>
      <Field label="Reason" value={reason} onChangeText={setReason} multiline />
      <Button label={saving ? "Rejecting…" : "Reject"} variant="danger" disabled={saving || !reason.trim()} onPress={() => onSubmit(reason.trim())} />
    </Sheet>
  );
}

function sheetStyles(colors: ThemeColors) {
  return StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 999, backgroundColor: colors.border, marginBottom: 12 },
  sheet: {
    maxHeight: "88%",
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  heading: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  option: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  });
}

// ─── Copy Plan Sheet ────────────────────────────────────────────────────────

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function CopyPlanSheet({
  visible,
  planId,
  planDate,
  planType,
  executiveName,
  salesUserId,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  planId: string;
  planDate?: string;
  planType?: string;
  executiveName?: string;
  salesUserId?: string;
  onClose: () => void;
  /** Called with the chosen ISO target date; caller navigates to /plan/form?copy=planId&date=targetDate */
  onConfirm: (targetDate: string) => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useSheetStyles();
  const [lazyGetPlans, { isFetching: checking }] = useLazyGetPlansQuery();
  const [targetDate, setTargetDate] = useState(tomorrowISO);
  const [existing, setExisting] = useState<{ id: string; status: string } | null>(null);

  // Reset state each time the sheet opens
  useEffect(() => {
    if (visible) {
      setTargetDate(tomorrowISO());
      setExisting(null);
    }
  }, [visible, planId]);

  // Check for collision when date changes
  useEffect(() => {
    if (!visible || !targetDate) return;
    let alive = true;
    void (async () => {
      try {
        const res = await lazyGetPlans({
          date: targetDate,
          ...(salesUserId ? { sales_user: salesUserId } : {}),
          limit: 1,
        }).unwrap();
        if (!alive) return;
        const active = (res?.data || []).filter(
          (p: { status?: string; deletedAt?: unknown; is_deleted?: boolean }) =>
            String(p.status) !== "deleted" && !p.deletedAt && !p.is_deleted,
        );
        setExisting(active.length > 0 ? { id: String(active[0]._id || active[0].id), status: String(active[0].status || "planned") } : null);
      } catch {
        if (alive) setExisting(null);
      }
    })();
    return () => { alive = false; };
  }, [visible, targetDate, salesUserId, lazyGetPlans]);

  const isCompleted = existing?.status === "completed";
  const hasActive = existing && !isCompleted;

  function StatusBanner() {
    if (checking) {
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, padding: 12 }}>
          <Ionicons name="time-outline" size={16} color={colors.muted} />
          <Text style={{ color: colors.muted, fontSize: 13 }}>Checking {formatPlanDate(targetDate)}…</Text>
        </View>
      );
    }
    if (isCompleted) {
      return (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: "#f87171", backgroundColor: "#fef2f2", padding: 12 }}>
          <Ionicons name="close-circle-outline" size={16} color="#ef4444" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#991b1b", fontWeight: "700", fontSize: 13 }}>Completed plan already exists</Text>
            <Text style={{ color: "#991b1b", fontSize: 12, marginTop: 2 }}>Pick a different date — this plan is locked.</Text>
          </View>
        </View>
      );
    }
    if (hasActive) {
      return (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: "#f59e0b", backgroundColor: "#fffbeb", padding: 12 }}>
          <Ionicons name="warning-outline" size={16} color="#d97706" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#92400e", fontWeight: "700", fontSize: 13 }}>Existing plan found ({existing.status.replace(/_/g, " ").toUpperCase()})</Text>
            <Text style={{ color: "#92400e", fontSize: 12, marginTop: 2 }}>Copied items will be merged into this active plan.</Text>
          </View>
        </View>
      );
    }
    if (targetDate) {
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: "#34d399", backgroundColor: "#ecfdf5", padding: 12 }}>
          <Ionicons name="checkmark-circle-outline" size={16} color="#10b981" />
          <Text style={{ color: "#065f46", fontSize: 13 }}>No existing plan on {formatPlanDate(targetDate)}. A new plan will be created.</Text>
        </View>
      );
    }
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="copy-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>Copy Work Plan</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Duplicate visits and tasks to a new date</Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
            {/* Source plan info */}
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, padding: 12, gap: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>Source Plan</Text>
              <View style={{ flexDirection: "row", gap: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>Original Date</Text>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{planDate ? formatPlanDate(planDate) : "—"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>Plan Type</Text>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{planType || "Visits"}</Text>
                </View>
              </View>
              {executiveName ? (
                <View>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>Executive</Text>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{executiveName}</Text>
                </View>
              ) : null}
            </View>

            {/* Target date picker */}
            <DatePickerField
              label="Select Target Date *"
              value={targetDate}
              onChange={setTargetDate}
              minDate={earliestOpenPlanDate()}
            />

            {/* Collision banner */}
            <StatusBanner />

            {/* Action buttons */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="ghost" onPress={onClose} />
              </View>
              <View style={{ flex: 2 }}>
                <Button
                  label={hasActive ? "Merge & Proceed" : "Proceed to Copy"}
                  disabled={checking || isCompleted || !targetDate}
                  onPress={() => { onConfirm(targetDate); onClose(); }}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
