import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Field } from "@/components/ui";
import { useThemeColors, type ThemeColors } from "@/theme";

export type WorkflowStatus = "pending" | "in_progress" | "completed";

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

const STATUSES: Array<{ id: WorkflowStatus; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
];

type AnswerState = Record<keyof CompleteVisitAnswers, boolean | null>;

export function StatusSheet({
  visible,
  itemType,
  initialStatus,
  initialPendingRemarks,
  initialInProgressRemarks,
  initialOutcome,
  initialAnswers,
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
  initialAnswers?: Partial<CompleteVisitAnswers>;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    status: WorkflowStatus;
    remarks: string;
    visitAnswers?: CompleteVisitAnswers;
  }) => void;
}) {
  const starting = (["pending", "in_progress", "completed"].includes(String(initialStatus))
    ? initialStatus
    : "in_progress") as WorkflowStatus;
  const [status, setStatus] = useState<WorkflowStatus>(starting);
  const [remarks, setRemarks] = useState("");
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

  useEffect(() => {
    if (!visible) return;
    setStatus(starting);
    setError("");
    setAnswers({
      meeting_with_doctor: initialAnswers?.meeting_with_doctor ?? null,
      meeting_with_purchase: initialAnswers?.meeting_with_purchase ?? null,
      meeting_with_finance: initialAnswers?.meeting_with_finance ?? null,
      meeting_with_engineer: initialAnswers?.meeting_with_engineer ?? null,
      new_product_introduced: initialAnswers?.new_product_introduced ?? null,
      order_received: initialAnswers?.order_received ?? null,
    });
    // Reset only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (status === "pending") setRemarks(initialPendingRemarks || "");
    else if (status === "in_progress") setRemarks(initialInProgressRemarks || "");
    else setRemarks(initialOutcome || "");
  }, [status, initialPendingRemarks, initialInProgressRemarks, initialOutcome, visible]);

  function submit() {
    if (itemType === "visit" && status === "completed") {
      const missing = QUESTIONS.find((q) => answers[q.key] === null);
      if (missing) {
        setError(`Please answer: ${missing.label}`);
        return;
      }
    }
    if (!remarks.trim()) {
      setError(
        status === "completed"
          ? "Please provide outcome or completion remarks"
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
    setError("");
    onConfirm({ status, remarks: remarks.trim(), visitAnswers });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.handle} />
        <Text style={styles.heading}>Update {itemType === "visit" ? "visit" : "task"} status</Text>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
          <View style={styles.row}>
            {STATUSES.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setStatus(item.id)}
                style={[styles.choice, status === item.id && styles.choiceOn]}
              >
                <Text style={[styles.choiceText, status === item.id && styles.choiceTextOn]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
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
          <Field
            label={status === "completed" ? "Outcome" : "Remarks"}
            value={remarks}
            onChangeText={setRemarks}
            multiline
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label={saving ? "Saving…" : "Save status"} onPress={submit} disabled={saving} />
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
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 999, backgroundColor: colors.border, marginBottom: 12 },
  sheet: {
    maxHeight: "88%",
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heading: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceText: { color: colors.text, fontWeight: "600" },
  choiceTextOn: { color: colors.primary },
  question: { gap: 6 },
  questionText: { color: colors.text, fontSize: 14 },
  error: { color: colors.danger, fontSize: 13 },
  });
}
