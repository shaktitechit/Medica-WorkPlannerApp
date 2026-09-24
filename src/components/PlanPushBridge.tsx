import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import {
  ensureNotificationPermission,
  planRouteFromData,
  presentPlanNotification,
  readExpoPushToken,
  subscribeToPlanNotificationOpens,
} from "@/lib/devicePush";
import { useSession } from "@/lib/session";
import { useListNotificationsQuery, useRegisterDevicePushMutation } from "@/store/api/notificationsApiSlice";

type Note = {
  _id?: string;
  id?: string;
  title?: string;
  message?: string;
  body?: string;
  module?: string;
  entity_type?: string;
  entity_id?: string;
  read?: boolean;
  is_read?: boolean;
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

function noteId(note: Note) {
  return String(note._id || note.id || "");
}

function isUnread(note: Note) {
  return !(note.read || note.is_read);
}

const seen = new Set<string>();
let primed = false;

export function PlanPushBridge() {
  const router = useRouter();
  const { session } = useSession();
  const query = useListNotificationsQuery(undefined, {
    skip: !session,
    pollingInterval: 20000,
  });
  const [registerDevice] = useRegisterDevicePushMutation();
  const registered = useRef("");
  const remoteReady = useRef(false);

  useEffect(() => {
    if (!session) {
      primed = false;
      seen.clear();
      registered.current = "";
      remoteReady.current = false;
      return;
    }
    let active = true;
    void (async () => {
      const allowed = await ensureNotificationPermission();
      if (!allowed || !active) return;
      try {
        const token = await readExpoPushToken();
        if (!token || token === registered.current || !active) return;
        await registerDevice({ token, platform: Platform.OS }).unwrap();
        registered.current = token;
        remoteReady.current = true;
      } catch {
        // Expo Go can show local alerts without a remote push token.
      }
    })();
    return () => {
      active = false;
    };
  }, [session, registerDevice]);

  useEffect(() => {
    if (!session) return;
    const notes = asList(query.data);
    if (!query.isSuccess) return;
    if (!primed) {
      for (const note of notes) {
        const id = noteId(note);
        if (id) seen.add(id);
      }
      primed = true;
      return;
    }
    for (const note of notes) {
      const id = noteId(note);
      if (!id || seen.has(id) || !isUnread(note)) continue;
      if (note.entity_type !== "work_plan" && note.module !== "work_planner") continue;
      seen.add(id);
      if (remoteReady.current) continue;
      void presentPlanNotification({
        title: note.title || "Work plan",
        body: note.message || note.body || "",
        data: {
          notificationId: id,
          entity_type: note.entity_type,
          entity_id: note.entity_id ? String(note.entity_id) : undefined,
          module: note.module,
        },
      });
    }
  }, [session, query.data, query.isSuccess]);

  useEffect(() => {
    return subscribeToPlanNotificationOpens((data) => {
      router.push(planRouteFromData(data));
    });
  }, [router]);

  return null;
}
