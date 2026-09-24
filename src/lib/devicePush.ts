import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

// Importing expo-notifications throws on Android Expo Go (SDK 53+). Keep the import lazy.
const notificationsUnavailable = Platform.OS === "android" && isRunningInExpoGo();

let notificationsPromise: Promise<NotificationsModule | null> | null = null;

function loadNotifications() {
  if (notificationsUnavailable) return Promise.resolve(null);
  if (!notificationsPromise) {
    notificationsPromise = import("expo-notifications")
      .then((mod) => {
        mod.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });
        return mod;
      })
      .catch(() => null);
  }
  return notificationsPromise;
}

export type PlanPushData = {
  notificationId?: string;
  entity_type?: string;
  entity_id?: string;
  module?: string;
};

export async function ensureNotificationPermission() {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("work-plans", {
      name: "Work plans",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

export async function readExpoPushToken() {
  const Notifications = await loadNotifications();
  if (!Notifications) return "";
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;
  if (!projectId) return "";
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data || "";
}

export async function presentPlanNotification(input: {
  title: string;
  body: string;
  data?: PlanPushData;
}) {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      sound: "default",
      data: input.data || {},
      ...(Platform.OS === "android" ? { channelId: "work-plans" as const } : {}),
    },
    trigger: null,
  });
}

export function subscribeToPlanNotificationOpens(
  onOpen: (data: Record<string, unknown>) => void,
) {
  if (notificationsUnavailable) return () => {};
  let active = true;
  let subscription: { remove: () => void } | null = null;
  void loadNotifications().then((Notifications) => {
    if (!Notifications || !active) return;
    subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      onOpen(response.notification.request.content.data as Record<string, unknown>);
    });
  });
  return () => {
    active = false;
    subscription?.remove();
  };
}

export function planRouteFromData(data: Record<string, unknown> | undefined) {
  const entityType = String(data?.entity_type || "");
  const entityId = String(data?.entity_id || "");
  if (entityType === "work_plan" && entityId) return `/plan/${entityId}` as const;
  return "/notifications" as const;
}
