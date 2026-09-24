import { Children, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, type ThemeColors } from "@/theme";

function useUiStyles() {
  const colors = useThemeColors();
  const styles = useMemo(() => createUiStyles(colors), [colors]);
  return { styles, colors };
}

export function Screen({
  children,
  scroll = true,
  header = false,
  centered = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  header?: boolean;
  centered?: boolean;
}) {
  const { styles } = useUiStyles();
  const insets = useSafeAreaInsets();
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      setAndroidKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setAndroidKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const edges = header ? (["left", "right"] as const) : (["top", "left", "right"] as const);
  const bottomPad = header ? Math.max(insets.bottom, 16) : 28;
  const body = (
    <View style={styles.frame}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }, centered && styles.contentCentered]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          style={androidKeyboardHeight > 0 ? { marginBottom: androidKeyboardHeight } : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1, paddingBottom: bottomPad + androidKeyboardHeight }, centered && styles.contentCentered]}>{children}</View>
      )}
    </View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {body}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const { styles } = useUiStyles();
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  const { styles } = useUiStyles();
  return <Text style={styles.muted}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { styles } = useUiStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({
  label,
  active,
  onPress,
  tone,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: string;
}) {
  const { styles } = useUiStyles();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive, tone ? { borderColor: tone } : null]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive, tone ? { color: tone } : null]}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  disabled,
  variant = "primary",
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
}) {
  const { styles } = useUiStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        variant === "ghost" && styles.buttonGhost,
        variant === "danger" && styles.buttonDanger,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={[styles.buttonText, variant === "ghost" && styles.buttonGhostText]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Section({ children }: { children: ReactNode }) {
  const { styles } = useUiStyles();
  return <Text style={styles.section}>{children}</Text>;
}

export function FilterBar({ children }: { children: ReactNode }) {
  const { styles } = useUiStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
      {children}
    </ScrollView>
  );
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  const { styles } = useUiStyles();
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <Pressable key={option.id} onPress={() => onChange(option.id)} style={[styles.segment, active && styles.segmentOn]}>
            <Text style={[styles.segmentText, active && styles.segmentTextOn]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  const { styles } = useUiStyles();
  return <View style={styles.grid}>{children}</View>;
}

export function GridItem({ children }: { children: ReactNode }) {
  const { styles } = useUiStyles();
  return <View style={styles.gridItem}>{children}</View>;
}

export function SplitActions({ children }: { children: ReactNode }) {
  const { styles } = useUiStyles();
  const items = Children.toArray(children);
  const width = items.length <= 1 ? "100%" : items.length === 2 ? "50%" : "33.33%";
  return (
    <View style={styles.split}>
      {items.map((child, index) => (
        <View key={index} style={[styles.splitItem, { width }]}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function Headline({
  title,
  meta,
  memberName,
  status,
  statusColor,
}: {
  title: string;
  meta?: string;
  memberName?: string;
  status?: string;
  statusColor?: string;
}) {
  const { styles, colors } = useUiStyles();
  const tone = statusColor || colors.primary;

  function renderMeta() {
    if (!meta) return null;
    if (!memberName || !meta.includes(memberName)) {
      return (
        <Text style={styles.muted} numberOfLines={2}>
          {meta}
        </Text>
      );
    }
    const parts = meta.split(memberName);
    return (
      <Text style={styles.muted} numberOfLines={2}>
        {parts[0]}
        <Text style={{ fontWeight: "700", color: styles.headlineTitle.color }}>{memberName}</Text>
        {parts.slice(1).join(memberName)}
      </Text>
    );
  }

  return (
    <View style={styles.headline}>
      <View style={styles.headlineText}>
        <Text style={styles.headlineTitle} numberOfLines={2}>
          {title}
        </Text>
        {renderMeta()}
      </View>
      {status ? (
        <View style={[styles.badge, { backgroundColor: `${tone}22` }]}>
          <Text style={[styles.badgeText, { color: tone }]} numberOfLines={1}>
            {status.replace(/_/g, " ")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function DateRange({ children }: { children: ReactNode }) {
  const { styles } = useUiStyles();
  return (
    <View style={styles.dateRange}>
      {Children.map(children, (child, index) => (
        <View key={index} style={styles.dateCell}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function Field({
  label,
  ...input
}: { label: string } & TextInputProps) {
  const { styles, colors } = useUiStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...input}
        style={[styles.input, input.multiline && styles.inputMulti, input.style]}
      />
    </View>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  const { styles, colors } = useUiStyles();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function Empty({ label }: { label: string }) {
  const { styles } = useUiStyles();
  return (
    <View style={styles.center}>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  const { styles } = useUiStyles();
  return <View style={styles.row}>{children}</View>;
}

function createUiStyles(colors: ThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  frame: { flex: 1, width: "100%", maxWidth: 720, alignSelf: "center" },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  contentCentered: { flexGrow: 1, justifyContent: "center" },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  section: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 4 },
  muted: { color: colors.muted, fontSize: 13 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  filterBar: { gap: 8, paddingVertical: 2, alignItems: "center" },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segment: { flex: 1, minHeight: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  segmentOn: { backgroundColor: colors.card },
  segmentText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  segmentTextOn: { color: colors.text },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 },
  gridItem: { width: "50%", padding: 6 },
  split: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  splitItem: { padding: 4 },
  headline: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  headlineText: { flex: 1, gap: 2 },
  headlineTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, maxWidth: "46%", flexShrink: 1 },
  badgeText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  dateRange: { flexDirection: "row", gap: 10 },
  dateCell: { flex: 1, minWidth: 0 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: colors.primary },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  buttonGhostText: { color: colors.text },
  field: { gap: 6 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  input: {
    backgroundColor: colors.input,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputMulti: { minHeight: 90, textAlignVertical: "top" },
  center: { padding: 24, alignItems: "center", gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  });
}
