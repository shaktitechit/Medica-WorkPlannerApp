import { useMemo } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CompanyLogo } from "@/components/chrome";
import { useGetCompanyInfoQuery } from "@/store/api/companyApiSlice";
import { useListNotificationsQuery } from "@/store/api/notificationsApiSlice";
import { useSession } from "@/lib/session";
import { useThemeColors } from "@/theme";

function IconLink({
  name,
  label,
  onPress,
}: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={[stylesBase.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Ionicons name={name} size={20} color={colors.text} />
    </Pressable>
  );
}

function unreadCount(raw: unknown) {
  const record = raw && typeof raw === "object" ? (raw as { data?: unknown; items?: unknown }) : null;
  const source = Array.isArray(raw) ? raw : Array.isArray(record?.items) ? record.items : Array.isArray(record?.data) ? record.data : [];
  return source.filter((note) => {
    const row = note as { read?: boolean; is_read?: boolean };
    return !(row.read || row.is_read);
  }).length;
}

export function AppHeader({
  title,
  subtitle,
  showBack,
  onBack,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
}) {
  const router = useRouter();
  const { session } = useSession();
  const { data } = useGetCompanyInfoQuery();
  const colors = useThemeColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
        brandText: { flex: 1, minWidth: 0, gap: 1 },
        title: { color: colors.text, fontSize: 20, fontWeight: "800" },
        meta: { color: colors.muted, fontSize: 12 },
        actions: { flexDirection: "row", gap: 8, flexShrink: 0 },
      }),
    [colors],
  );
  const company = data?.trade_name || data?.legal_name || "Work Planner";
  const notifications = useListNotificationsQuery(undefined, { skip: !session, pollingInterval: 20000 });
  const unread = unreadCount(notifications.data);
  const badge = unread > 99 ? "99+" : String(unread);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/projects" as any);
    }
  };

  return (
    <View style={styles.wrap}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={6}
          onPress={handleBack}
          style={[stylesBase.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
      ) : (
        <CompanyLogo size={40} />
      )}
      <View style={styles.brandText}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {subtitle || company}
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"}
          hitSlop={6}
          onPress={() => router.push("/notifications")}
          style={[stylesBase.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Ionicons name={unread ? "notifications" : "notifications-outline"} size={20} color={colors.text} />
          {unread > 0 ? (
            <View
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                paddingHorizontal: 4,
                backgroundColor: colors.danger,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{badge}</Text>
            </View>
          ) : null}
        </Pressable>
        <IconLink name="person-circle-outline" label="Profile" onPress={() => router.push("/profile")} />
      </View>
    </View>
  );
}

const stylesBase = StyleSheet.create({
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
