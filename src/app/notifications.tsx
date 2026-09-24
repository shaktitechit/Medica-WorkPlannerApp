import { Pressable, Text, View } from "react-native";
import { Button, Card, Empty, Loading, Screen } from "@/components/ui";
import { useListNotificationsQuery, useMarkNotificationReadMutation } from "@/store/api/notificationsApiSlice";
import { useThemeColors } from "@/theme";

type Note = {
  _id?: string;
  id?: string;
  title?: string;
  message?: string;
  body?: string;
  module?: string;
  type?: string;
  read?: boolean;
  is_read?: boolean;
  createdAt?: string;
  created_at?: string;
};

function asList(raw: unknown): Note[] {
  if (Array.isArray(raw)) return raw as Note[];
  if (raw && typeof raw === "object") {
    const record = raw as { items?: Note[]; data?: Note[] };
    if (Array.isArray(record.items)) return record.items;
    if (Array.isArray(record.data)) return record.data;
  }
  return [];
}

function isUnread(note: Note) {
  return !(note.read || note.is_read);
}

function formatRelative(value?: string) {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const seconds = Math.round((Date.now() - time) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotificationsScreen() {
  const colors = useThemeColors();
  const query = useListNotificationsQuery(undefined, { pollingInterval: 30000 });
  const [markRead] = useMarkNotificationReadMutation();
  const notes = asList(query.data);
  const unread = notes.filter(isUnread).length;

  return (
    <Screen header>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
              {unread ? "Unread" : "You are caught up"}
            </Text>
            {unread > 0 ? (
              <View
                accessibilityLabel={`${unread} unread`}
                style={{
                  minWidth: 22,
                  height: 22,
                  borderRadius: 11,
                  paddingHorizontal: 6,
                  backgroundColor: colors.danger,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>{unread > 99 ? "99+" : unread}</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Updates every 30 seconds</Text>
        </View>
        <Button label="Refresh" variant="ghost" onPress={() => void query.refetch()} />
      </View>
      {query.isLoading ? <Loading /> : null}
      {query.isError ? <Text style={{ color: colors.danger }}>Could not load notifications.</Text> : null}
      {!query.isLoading && !query.isError && notes.length === 0 ? <Empty label="No notifications yet" /> : null}
      {notes.map((note, index) => {
        const id = String(note._id || note.id || index);
        const unreadNote = isUnread(note);
        const when = formatRelative(note.createdAt || note.created_at);
        return (
          <Pressable
            key={id}
            onPress={() => {
              if (unreadNote && (note._id || note.id)) void markRead(id);
            }}
          >
            <Card style={unreadNote ? { borderColor: colors.primary, backgroundColor: colors.primarySoft } : undefined}>
              <Text style={{ color: colors.text, fontWeight: "800" }}>{note.title || "Notification"}</Text>
              {note.message || note.body ? <Text style={{ color: colors.muted }}>{note.message || note.body}</Text> : null}
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {[note.module || note.type, when, unreadNote ? "Unread" : "Read"].filter(Boolean).join(" · ")}
              </Text>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
