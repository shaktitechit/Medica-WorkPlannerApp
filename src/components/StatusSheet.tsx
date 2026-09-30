import { useEffect, useMemo, useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { Button, Field } from "@/components/ui";
import { shiftISO, stripHtml, todayISO } from "@/lib/dates";
import { useThemeColors, type ThemeColors } from "@/theme";
import type { AuthorityRemarkItem } from "@/types/workPlanner";
import { useUploadWorkPlanAttachmentMutation } from "@/store/api/workPlannerApiSlice";
import { uploadMobileFile } from "@/lib/mobileUpload";
import { formatLocalityCity, getVisitLocationDisplay } from "@/lib/location";
import { resolvePublicAssetUrl } from "@/lib/env";
import { useSession } from "@/lib/session";

export type WorkflowStatus =
  | "created"
  | "pending"
  | "in_progress"
  | "checked_in"
  | "checked_out"
  | "completed"
  | "cancelled"
  | "skipped"
  | "rescheduled";

export type CompleteVisitAnswers = {
  meeting_with_doctor: boolean;
  meeting_with_purchase: boolean;
  meeting_with_finance: boolean;
  meeting_with_engineer: boolean;
  new_product_introduced: boolean;
  order_received: boolean;
};

const QUESTIONS: Array<{ key: keyof CompleteVisitAnswers; label: string }> = [
  { key: "meeting_with_doctor", label: "Meeting with doctor?" },
  { key: "meeting_with_purchase", label: "Meeting with purchase?" },
  { key: "meeting_with_finance", label: "Meeting with finance?" },
  { key: "meeting_with_engineer", label: "Meeting with engineer/technician?" },
  { key: "new_product_introduced", label: "New product introduced?" },
  { key: "order_received", label: "Order received?" },
];

const VISIT_STATUSES: Array<{ id: WorkflowStatus; label: string; badgeColor?: string }> = [
  { id: "checked_in", label: "Check In" },
  { id: "completed", label: "Complete (Outcome)" },
  { id: "rescheduled", label: "Reschedule" },
  { id: "skipped", label: "Skipped" },
  { id: "cancelled", label: "Cancelled" },
];

const TASK_STATUSES: Array<{ id: WorkflowStatus; label: string; badgeColor?: string }> = [
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
  { id: "rescheduled", label: "Reschedule" },
  { id: "skipped", label: "Skipped" },
  { id: "cancelled", label: "Cancelled" },
];

type AnswerState = Record<keyof CompleteVisitAnswers, boolean | null>;

export function StatusSheet({
  visible,
  itemType,
  initialStatus,
  initialPendingRemarks,
  initialInProgressRemarks,
  initialOutcome,
  initialManagerRemarks,
  initialRescheduledDate,
  authorityRemarks,
  initialAnswers,
  visitRecord,
  isSeniorViewing,
  isElevated,
  saving,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  itemType: "visit" | "work";
  initialStatus?: string;
  initialPendingRemarks?: string;
  initialInProgressRemarks?: string;
  initialOutcome?: string;
  initialManagerRemarks?: string;
  initialRescheduledDate?: string;
  authorityRemarks?: AuthorityRemarkItem[];
  initialAnswers?: Partial<CompleteVisitAnswers>;
  visitRecord?: any;
  isSeniorViewing?: boolean;
  isElevated?: boolean;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    status: WorkflowStatus;
    remarks: string;
    managerRemarks?: string;
    rescheduledDate?: string;
    visitAnswers?: CompleteVisitAnswers;
    selfieUrl?: string;
    lat?: number;
    lng?: number;
    address?: string;
  }) => void;
}) {
  const validStatusList: WorkflowStatus[] = [
    "created",
    "pending",
    "in_progress",
    "completed",
    "cancelled",
    "skipped",
    "rescheduled",
  ];
  const starting = (validStatusList.includes(String(initialStatus) as WorkflowStatus)
    ? initialStatus
    : "in_progress") as WorkflowStatus;

  const { session } = useSession();
  const [status, setStatus] = useState<WorkflowStatus>(starting);
  const [remarks, setRemarks] = useState("");
  const [managerRemarks, setManagerRemarks] = useState("");
  const [rescheduledDate, setRescheduledDate] = useState("");
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfieTimestamp, setSelfieTimestamp] = useState<string>("");
  const [selfieAddress, setSelfieAddress] = useState<string>("");
  const [selfieLat, setSelfieLat] = useState<number | null>(null);
  const [selfieLng, setSelfieLng] = useState<number | null>(null);
  const [isUploadingSelfie, setIsUploadingSelfie] = useState(false);
  const [uploadAttachment] = useUploadWorkPlanAttachmentMutation();
  const [answers, setAnswers] = useState<AnswerState>({
    meeting_with_doctor: null,
    meeting_with_purchase: null,
    meeting_with_finance: null,
    meeting_with_engineer: null,
    new_product_introduced: null,
    order_received: null,
  });
  const [error, setError] = useState("");
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => statusStyles(colors), [colors]);

  const fetchCurrentDeviceLocation = async () => {
    try {
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setSelfieLat(lat);
        setSelfieLng(lng);
        try {
          const geocoded = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          if (geocoded && geocoded.length > 0) {
            const item = geocoded[0];
            const locality = item.district || item.subregion || item.street || item.name || "";
            const city = item.city || item.region || "";
            const formatted = locality && city && locality !== city ? `${locality}, ${city}` : (locality || city || item.name || "");
            if (formatted) {
              setSelfieAddress(formatted);
              return { lat, lng, address: formatted };
            }
          }
        } catch (_geoErr) {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
              headers: { "User-Agent": "OPMS-WorkPlanner-Mobile/1.0" },
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.display_name) {
                setSelfieAddress(data.display_name);
                return { lat, lng, address: data.display_name };
              }
            }
          } catch (_nomErr) {}
        }
        return { lat, lng, address: `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}` };
      }
    } catch (_err) {}
    return null;
  };

  useEffect(() => {
    if (!visible) return;
    setStatus(itemType === "visit" && (starting === "pending" || starting === "created") ? "checked_in" : starting);
    setError("");
    setSelfieUri(null);
    setSelfieLat(null);
    setSelfieLng(null);
    setSelfieAddress("");
    setManagerRemarks(initialManagerRemarks || "");
    setRescheduledDate(initialRescheduledDate || shiftISO(todayISO(), 1));
    setAnswers({
      meeting_with_doctor: initialAnswers?.meeting_with_doctor ?? null,
      meeting_with_purchase: initialAnswers?.meeting_with_purchase ?? null,
      meeting_with_finance: initialAnswers?.meeting_with_finance ?? null,
      meeting_with_engineer: initialAnswers?.meeting_with_engineer ?? null,
      new_product_introduced: initialAnswers?.new_product_introduced ?? null,
      order_received: initialAnswers?.order_received ?? null,
    });
    fetchCurrentDeviceLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (status === "pending") setRemarks(initialPendingRemarks || "");
    else if (status === "in_progress") setRemarks(initialInProgressRemarks || "");
    else if (status === "completed") setRemarks(initialOutcome || "");
    else if (status === "cancelled" || status === "skipped" || status === "rescheduled") {
      setRemarks(initialPendingRemarks || initialOutcome || "");
    } else {
      setRemarks("");
    }
  }, [status, initialPendingRemarks, initialInProgressRemarks, initialOutcome, visible]);

  function getRemarksLabel() {
    switch (status) {
      case "completed":
        return "Outcome / Completion Remarks";
      case "pending":
        return "Pending Reason / Remarks";
      case "in_progress":
        return "In-Progress Remarks";
      case "rescheduled":
        return "Reschedule Reason";
      case "skipped":
        return "Skipped Reason";
      case "cancelled":
        return "Cancellation Reason";
      case "created":
      default:
        return "Remarks / Instructions";
    }
  }

  const takeClientSelfie = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Camera access is needed to take a selfie with the client.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setSelfieUri(result.assets[0].uri);
        setSelfieTimestamp(new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }));
        await fetchCurrentDeviceLocation();
      }
    } catch (err: any) {
      Alert.alert("Camera Error", err?.message || "Could not open camera");
    }
  };

  async function submit() {
    if (itemType === "visit" && status === "completed") {
      const missing = QUESTIONS.find((q) => answers[q.key] === null);
      if (missing) {
        setError(`Please answer: ${missing.label}`);
        return;
      }
    }

    if (status === "rescheduled") {
      const trimmedDate = rescheduledDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        setError("Please enter a valid target reschedule date in YYYY-MM-DD format.");
        return;
      }
    }

    if (status !== "created" && !remarks.trim() && !(isElevated && managerRemarks.trim())) {
      setError(
        status === "completed"
          ? "Please provide outcome or completion remarks"
          : status === "rescheduled"
            ? "Please provide a reason for rescheduling"
            : status === "cancelled"
              ? "Please enter cancellation reason"
              : status === "skipped"
                ? "Please enter skip reason"
                : status === "pending"
                  ? "Please enter pending remarks"
                  : "Please enter in-progress remarks",
      );
      return;
    }

    const visitAnswers =
      itemType === "visit" && status === "completed"
        ? {
            meeting_with_doctor: Boolean(answers.meeting_with_doctor),
            meeting_with_purchase: Boolean(answers.meeting_with_purchase),
            meeting_with_finance: Boolean(answers.meeting_with_finance),
            meeting_with_engineer: Boolean(answers.meeting_with_engineer),
            new_product_introduced: Boolean(answers.new_product_introduced),
            order_received: Boolean(answers.order_received),
          }
        : undefined;

    let uploadedSelfieUrl: string | undefined = undefined;
    if (selfieUri && !isSeniorViewing) {
      try {
        setIsUploadingSelfie(true);
        const uploaded = await uploadMobileFile(selfieUri, "attachments/upload");
        uploadedSelfieUrl = (uploaded as any)?.url || (uploaded as any)?.file_name || (uploaded as any)?.data?.url;
      } catch (err: any) {
        console.error("Selfie upload from phone failed", err);
        Alert.alert("Upload Failed", err?.message || "Could not upload client selfie photo from phone");
        setIsUploadingSelfie(false);
        return;
      } finally {
        setIsUploadingSelfie(false);
      }
    }

    let finalLat = selfieLat;
    let finalLng = selfieLng;
    let finalAddress = selfieAddress;

    if (!finalLat || !finalLng || !finalAddress) {
      const loc = await fetchCurrentDeviceLocation();
      if (loc) {
        finalLat = finalLat || loc.lat;
        finalLng = finalLng || loc.lng;
        finalAddress = finalAddress || loc.address;
      }
    }

    setError("");
    onConfirm({
      status,
      remarks: remarks.trim(),
      managerRemarks: managerRemarks.trim() || undefined,
      rescheduledDate: status === "rescheduled" ? rescheduledDate.trim() : undefined,
      visitAnswers,
      selfieUrl: uploadedSelfieUrl,
      lat: finalLat || undefined,
      lng: finalLng || undefined,
      address: finalAddress || undefined,
    });
  }

  const remarksList = authorityRemarks || [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Text style={[styles.heading, { flex: 1, minWidth: 160, marginBottom: 0 }]}>
              Update {itemType === "visit" ? "Visit" : "Task"} Status
            </Text>
            {isElevated ? (
              <View style={styles.authorityBadge}>
                <Text style={styles.authorityBadgeText}>Elevated Authority</Text>
              </View>
            ) : null}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 16 }}>
            {/* Status Choices */}
            <View>
              <Text style={styles.sectionLabel}>SELECT STATUS</Text>
              <View style={styles.row}>
                {(itemType === "visit" ? VISIT_STATUSES : TASK_STATUSES).map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setStatus(item.id)}
                    style={[styles.choice, status === item.id && styles.choiceOn]}
                  >
                    <Text style={[styles.choiceText, status === item.id && styles.choiceTextOn]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Reschedule Date input */}
            {status === "rescheduled" ? (
              <View style={styles.rescheduleBox}>
                <Text style={styles.rescheduleTitle}>Reschedule to Date (YYYY-MM-DD)</Text>
                <Field
                  label="Target Date"
                  value={rescheduledDate}
                  onChangeText={setRescheduledDate}
                  placeholder="YYYY-MM-DD"
                />
                <Text style={styles.rescheduleNote}>
                  A new {itemType === "visit" ? "visit" : "task"} will be created in the work plan for this target date.
                </Text>
              </View>
            ) : null}

            {/* Visit Questions */}
            {itemType === "visit" && status === "completed"
              ? QUESTIONS.map((q) => (
                  <View key={q.key} style={styles.question}>
                    <Text style={styles.questionText}>{q.label}</Text>
                    <View style={styles.row}>
                      <Pressable
                        style={[styles.choice, answers[q.key] === true && styles.choiceOn]}
                        onPress={() => setAnswers((prev) => ({ ...prev, [q.key]: true }))}
                      >
                        <Text style={styles.choiceText}>Yes</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.choice, answers[q.key] === false && styles.choiceOn]}
                        onPress={() => setAnswers((prev) => ({ ...prev, [q.key]: false }))}
                      >
                        <Text style={styles.choiceText}>No</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              : null}
            {/* Client Selfie Section for Visits */}
            {itemType === "visit" ? (
              <View style={{ borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, padding: 12, backgroundColor: "#f8fafc", gap: 8, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="camera" size={18} color={colors.primary} />
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
                      {isSeniorViewing ? "Senior Inspection — Client Selfies" : "Client Selfie Verification"}
                    </Text>
                  </View>
                  {!isSeniorViewing && selfieUri ? (
                    <Pressable onPress={() => setSelfieUri(null)}>
                      <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>

                {(() => {
                  const checkInUrl = visitRecord?.check_in_selfie_url;
                  const checkOutUrl = visitRecord?.check_out_selfie_url || visitRecord?.outcome_selfie_url;

                  if (isSeniorViewing) {
                    if (!checkInUrl && !checkOutUrl) {
                      return (
                        <View style={{ padding: 10, borderRadius: 8, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2e8f0" }}>
                          <Text style={{ color: colors.muted, fontSize: 11, textAlign: "center" }}>
                            ℹ️ No Client Selfie recorded by executive for this visit yet.
                          </Text>
                        </View>
                      );
                    }
                    return (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                        {checkInUrl ? (
                          <View style={{ gap: 4 }}>
                            <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "700" }}>Check-In Selfie</Text>
                            <View style={{ position: "relative", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border, width: 180, height: 160 }}>
                              <Image source={{ uri: resolvePublicAssetUrl(checkInUrl, session?.token) }} style={{ width: "100%", height: "100%" }} />
                              <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 6, paddingVertical: 4, gap: 2 }}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                  <Ionicons name="time" size={11} color="#fcd34d" />
                                  <Text style={{ color: "#ffffff", fontSize: 9, fontWeight: "700" }}>
                                    {visitRecord?.actual_check_in ? new Date(visitRecord.actual_check_in).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Timestamp Verified"}
                                  </Text>
                                </View>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                  <Ionicons name="location" size={11} color="#60a5fa" />
                                  <Text style={{ color: "#e2e8f0", fontSize: 9, fontWeight: "600" }} numberOfLines={1}>
                                    {getVisitLocationDisplay(visitRecord?.check_in_address || visitRecord?.check_out_address || visitRecord?.address, visitRecord?.check_in_lat ?? visitRecord?.check_out_lat, visitRecord?.check_in_lng ?? visitRecord?.check_out_lng)}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        ) : null}
                        {checkOutUrl ? (
                          <View style={{ gap: 4 }}>
                            <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "700" }}>Check-Out Selfie</Text>
                            <View style={{ position: "relative", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border, width: 180, height: 160 }}>
                              <Image source={{ uri: resolvePublicAssetUrl(checkOutUrl, session?.token) }} style={{ width: "100%", height: "100%" }} />
                              <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 6, paddingVertical: 4, gap: 2 }}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                  <Ionicons name="time" size={11} color="#fcd34d" />
                                  <Text style={{ color: "#ffffff", fontSize: 9, fontWeight: "700" }}>
                                    {visitRecord?.actual_check_out ? new Date(visitRecord.actual_check_out).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Timestamp Verified"}
                                  </Text>
                                </View>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                  <Ionicons name="location" size={11} color="#60a5fa" />
                                  <Text style={{ color: "#e2e8f0", fontSize: 9, fontWeight: "600" }} numberOfLines={1}>
                                    {getVisitLocationDisplay(visitRecord?.check_out_address || visitRecord?.check_in_address || visitRecord?.address, visitRecord?.check_out_lat ?? visitRecord?.check_in_lat, visitRecord?.check_out_lng ?? visitRecord?.check_in_lng)}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        ) : null}
                      </ScrollView>
                    );
                  }

                  // Junior Executive view: Camera capture or preview
                  return (
                    <View>
                      {selfieUri ? (
                        <View style={{ alignItems: "center", gap: 6 }}>
                          <View style={{ position: "relative", borderRadius: 12, overflow: "hidden", borderWidth: 2, borderColor: colors.primary, width: 200, height: 180 }}>
                            <Image source={{ uri: selfieUri }} style={{ width: "100%", height: "100%" }} />
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
                                  {selfieTimestamp || new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </Text>
                              </View>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <Ionicons name="location" size={12} color="#60a5fa" />
                                <Text style={{ color: "#e2e8f0", fontSize: 10, fontWeight: "600" }} numberOfLines={1}>
                                  {selfieAddress || "Verified Location Timestamp"}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>Verified Client Selfie Preview</Text>
                        </View>
                      ) : (status === "checked_in" || status === "completed" || status === "checked_out") ? (
                        <Pressable
                          onPress={takeClientSelfie}
                          style={{
                            borderWidth: 1.5,
                            borderColor: colors.primary,
                            borderStyle: "dashed",
                            borderRadius: 12,
                            padding: 16,
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            backgroundColor: colors.card,
                          }}
                        >
                          <Ionicons name="camera-outline" size={28} color={colors.primary} />
                          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>Take Selfie with Client</Text>
                          <Text style={{ color: colors.muted, fontSize: 11 }}>Use front camera for verification</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })()}
              </View>
            ) : null}

            {/* Executive / General Remarks */}
            <Field
              label={getRemarksLabel()}
              value={remarks}
              onChangeText={setRemarks}
              multiline
              placeholder={`Enter ${getRemarksLabel().toLowerCase()}…`}
            />

            {/* Read-only Senior Directive Callout for Executives / Plan Owners */}
            {!isSeniorViewing && (initialManagerRemarks || managerRemarks) ? (
              <View style={[styles.managerRemarkBox, { backgroundColor: "#faf5ff", borderColor: "#e9d5ff" }]}>
                <Text style={[styles.managerRemarkTitle, { color: "#7e22ce" }]}>Active Senior Directive / Instruction</Text>
                <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>{stripHtml(initialManagerRemarks || managerRemarks)}</Text>
              </View>
            ) : null}

            {/* Supervisory Remarks Field for Seniors inspecting Subordinates */}
            {isSeniorViewing ? (
              <View style={styles.managerRemarkBox}>
                <Text style={styles.managerRemarkTitle}>Senior Remarks / Review Guidance</Text>
                <Field
                  label="Manager Directive / Remark"
                  value={managerRemarks}
                  onChangeText={setManagerRemarks}
                  multiline
                  placeholder="Add higher authority instruction or review remark…"
                />
              </View>
            ) : null}

            {/* Authority Remarks Audit History */}
            {remarksList.length > 0 ? (
              <View style={styles.auditBox}>
                <Text style={styles.auditTitle}>Senior Remarks History ({remarksList.length})</Text>
                {remarksList.map((r, idx) => (
                  <View key={r._id || `${r.created_at}-${idx}`} style={styles.auditItem}>
                    <View style={styles.auditHeader}>
                      <Text style={styles.auditUser}>{r.user_name || (typeof r.user === "object" ? r.user?.name : "Manager") || "Authority"}</Text>
                      {r.role ? <Text style={styles.auditRoleBadge}>{r.role.toUpperCase()}</Text> : null}
                      <Text style={styles.auditDate}>
                        {r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                      </Text>
                    </View>
                    <Text style={styles.auditRemark}>{stripHtml(r.remark)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label={saving || isUploadingSelfie ? "Saving & Uploading…" : "Save status"} onPress={submit} disabled={saving || isUploadingSelfie} />
            <Button label="Cancel" variant="ghost" onPress={onClose} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function statusStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    sheet: {
      maxHeight: "92%",
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    heading: { color: colors.text, fontSize: 18, fontWeight: "700" },
    authorityBadge: {
      backgroundColor: "#f5f3ff",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "#ddd6fe",
    },
    authorityBadgeText: {
      color: "#7c3aed",
      fontSize: 11,
      fontWeight: "700",
    },
    sectionLabel: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    choice: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.cardAlt,
    },
    choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    choiceText: { color: colors.text, fontWeight: "600", fontSize: 13 },
    choiceTextOn: { color: colors.primary },
    question: { gap: 6 },
    questionText: { color: colors.text, fontSize: 14 },
    rescheduleBox: {
      borderWidth: 1,
      borderColor: "#fed7aa",
      borderRadius: 12,
      padding: 12,
      backgroundColor: "#fff7ed",
      gap: 6,
    },
    rescheduleTitle: {
      color: "#c2410c",
      fontSize: 13,
      fontWeight: "700",
    },
    rescheduleNote: {
      color: "#9a3412",
      fontSize: 12,
    },
    managerRemarkBox: {
      borderWidth: 1,
      borderColor: "#e9d5ff",
      borderRadius: 12,
      padding: 12,
      backgroundColor: "#faf5ff",
      gap: 6,
    },
    managerRemarkTitle: {
      color: "#7e22ce",
      fontSize: 13,
      fontWeight: "700",
    },
    auditBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      backgroundColor: colors.cardAlt,
      gap: 8,
    },
    auditTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 4,
    },
    auditItem: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: 6,
      marginBottom: 6,
      gap: 3,
    },
    auditHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
    },
    auditUser: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "700",
    },
    auditRoleBadge: {
      fontSize: 10,
      fontWeight: "800",
      color: "#6b21a8",
      backgroundColor: "#f3e8ff",
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
    },
    auditDate: {
      color: colors.muted,
      fontSize: 11,
      marginLeft: "auto",
    },
    auditRemark: {
      color: colors.text,
      fontSize: 13,
    },
    error: { color: colors.danger, fontSize: 13 },
  });
}
