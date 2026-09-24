import { baseApi } from "./baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "./unwrap";

export const notificationsApiSlice = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listNotifications: build.query<
      unknown,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "notifications",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Notifications", id: "LIST" }],
    }),
    markNotificationRead: build.mutation<unknown, string>({
      query: (id) => ({
        url: `notifications/${id}/read`,
        method: "PATCH",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: [{ type: "Notifications", id: "LIST" }],
    }),
    registerDevicePush: build.mutation<unknown, { token: string; platform: string }>({
      query: (body) => ({
        url: "push/device",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
    }),
  }),
});

export const {
  useListNotificationsQuery,
  useLazyListNotificationsQuery,
  useMarkNotificationReadMutation,
  useRegisterDevicePushMutation,
} = notificationsApiSlice;
