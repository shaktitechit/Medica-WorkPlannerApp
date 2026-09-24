import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatPlanDate } from "@/lib/dates";
import { useThemeColors } from "@/theme";

function parseISO(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toISO(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<"from" | "to" | null>(null);
  const [cursor, setCursor] = useState(() => {
    const start = parseISO(from);
    return { year: start.getFullYear(), month: start.getMonth() };
  });
  const [gridWidth, setGridWidth] = useState(0);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: "row", gap: 10 },
        field: { flex: 1, minWidth: 0, gap: 6 },
        label: { color: colors.muted, fontSize: 12, fontWeight: "600" },
        input: {
          minHeight: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.input,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        },
        inputOn: { borderColor: colors.primary },
        value: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" },
        backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
        sheet: {
          backgroundColor: colors.card,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingHorizontal: 16,
          paddingTop: 10,
        },
        handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 999, backgroundColor: colors.border, marginBottom: 12 },
        heading: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 12 },
        month: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
        monthLabel: { flex: 1, textAlign: "center", color: colors.text, fontSize: 16, fontWeight: "800" },
        nav: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardAlt },
        weekday: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" },
        done: {
          marginTop: 16,
          minHeight: 44,
          borderRadius: 12,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        },
        doneText: { color: "#fff", fontWeight: "700", fontSize: 15 },
      }),
    [colors],
  );

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
  const label = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const gap = 6;
  const cell = gridWidth > 0 ? Math.floor((gridWidth - gap * 6) / 7) : 0;

  function openPicker(which: "from" | "to") {
    const current = parseISO(which === "from" ? from : to);
    setCursor({ year: current.getFullYear(), month: current.getMonth() });
    setOpen(which);
  }

  function selectDay(day: number) {
    if (!open) return;
    const picked = toISO(new Date(cursor.year, cursor.month, day));
    if (open === "from") {
      onChange(picked, picked > to ? picked : to);
      setOpen("to");
      return;
    }
    onChange(picked < from ? picked : from, picked < from ? from : picked);
    setOpen(null);
  }

  return (
    <>
      <View style={styles.row}>
        <DateField label="From" value={from} active={open === "from"} onPress={() => openPicker("from")} styles={styles} color={colors.primary} />
        <DateField label="To" value={to} active={open === "to"} onPress={() => openPicker("to")} styles={styles} color={colors.primary} />
      </View>
      <Modal visible={open !== null} animationType="slide" transparent onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(null)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <Text style={styles.heading}>{open === "from" ? "Start date" : "End date"}</Text>
          <View style={styles.month}>
            <Pressable
              accessibilityLabel="Previous month"
              onPress={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))}
              style={styles.nav}
            >
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <Text style={styles.monthLabel}>{label}</Text>
            <Pressable
              accessibilityLabel="Next month"
              onPress={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))}
              style={styles.nav}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
          </View>
          <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
            <View style={{ flexDirection: "row", marginBottom: 6 }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((name, index) => (
                <View key={`${name}-${index}`} style={{ width: cell || "14.28%" }}>
                  <Text style={styles.weekday}>{name}</Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
              {Array.from({ length: firstWeekday }, (_, index) => (
                <View key={`pad-${index}`} style={{ width: cell, height: cell }} />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
                const iso = toISO(new Date(cursor.year, cursor.month, day));
                const selected = iso === from || iso === to;
                const inRange = iso > from && iso < to;
                return (
                  <Pressable
                    key={day}
                    onPress={() => selectDay(day)}
                    style={{
                      width: cell,
                      height: cell,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: selected ? colors.primary : inRange ? colors.primarySoft : colors.cardAlt,
                    }}
                  >
                    <Text style={{ color: selected ? "#fff" : colors.text, fontWeight: "700" }}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Pressable onPress={() => setOpen(null)} style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

function DateField({
  label,
  value,
  active,
  onPress,
  styles,
  color,
}: {
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
  styles: {
    field: object;
    label: object;
    input: object;
    inputOn: object;
    value: object;
  };
  color: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={onPress} style={[styles.input, active && styles.inputOn]}>
        <Ionicons name="calendar-outline" size={18} color={color} />
        <Text style={styles.value} numberOfLines={1}>
          {formatPlanDate(value)}
        </Text>
      </Pressable>
    </View>
  );
}

export function DatePickerField({
  label,
  value,
  onChange,
  minDate,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const current = parseISO(value || toISO(new Date()));
    return { year: current.getFullYear(), month: current.getMonth() };
  });
  const [gridWidth, setGridWidth] = useState(0);
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const gap = 6;
  const cell = gridWidth > 0 ? Math.floor((gridWidth - gap * 6) / 7) : 0;

  function openPicker() {
    const current = parseISO(value || toISO(new Date()));
    setCursor({ year: current.getFullYear(), month: current.getMonth() });
    setOpen(true);
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={openPicker}
        style={{
          minHeight: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.input,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.primary} />
        <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
          {value ? formatPlanDate(value) : "Select a date"}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} onPress={() => setOpen(false)} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) }}>
          <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 999, backgroundColor: colors.border, marginBottom: 12 }} />
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 12 }}>{label}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <Pressable
              accessibilityLabel="Previous month"
              onPress={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))}
              style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardAlt }}
            >
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: "center", color: colors.text, fontSize: 16, fontWeight: "800" }}>{monthLabel}</Text>
            <Pressable
              accessibilityLabel="Next month"
              onPress={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))}
              style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.cardAlt }}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
          </View>
          <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
            <View style={{ flexDirection: "row", marginBottom: 6 }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((name, index) => (
                <View key={`${name}-${index}`} style={{ width: cell || "14.28%" }}>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }}>{name}</Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
              {Array.from({ length: firstWeekday }, (_, index) => (
                <View key={`pad-${index}`} style={{ width: cell, height: cell }} />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
                const iso = toISO(new Date(cursor.year, cursor.month, day));
                const selected = iso === value;
                const locked = Boolean(minDate && iso < minDate);
                return (
                  <Pressable
                    key={day}
                    disabled={locked}
                    onPress={() => {
                      if (locked) return;
                      onChange(iso);
                      setOpen(false);
                    }}
                    style={{
                      width: cell,
                      height: cell,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: selected ? colors.primary : locked ? "transparent" : colors.cardAlt,
                    }}
                  >
                    <Text style={{ color: selected ? "#fff" : locked ? colors.muted : colors.text, fontWeight: "700" }}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
