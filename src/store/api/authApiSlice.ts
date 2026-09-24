import { baseApi } from "./baseApi";
import { AUTH_SERVICE_URL } from "@/lib/env";
import type { AuthUser, UserSession } from "@/types/workPlanner";

export const authApiSlice = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    login: builder.mutation<UserSession, { email?: string; password?: string }>({
      query: (credentials) => ({
        url: `${AUTH_SERVICE_URL}/api/auth/login`,
        method: "POST",
        body: credentials,
      }),
      invalidatesTags: ["AuthSession"],
    }),
    getMe: builder.query<{ user: AuthUser }, void>({
      query: () => `${AUTH_SERVICE_URL}/api/auth/me`,
      transformResponse: (raw: { user?: AuthUser; data?: AuthUser }) => ({
        user: raw.user || raw.data!,
      }),
      providesTags: ["AuthSession"],
    }),
    changePassword: builder.mutation<
      { success: boolean; message?: string },
      { currentPassword: string; newPassword: string }
    >({
      query: (body) => ({
        url: `${AUTH_SERVICE_URL}/api/auth/change-password`,
        method: "POST",
        body,
      }),
    }),
    getUsers: builder.query<
      Array<{
        _id: string;
        id?: string;
        name: string;
        email: string;
        department?: string;
        roles?: unknown;
        role_codes?: unknown;
        role_names?: unknown;
        portals?: unknown;
      }>,
      void
    >({
      query: () => `${AUTH_SERVICE_URL}/api/users`,
      transformResponse: (res: any) => res.data || res || [],
    }),
  }),
});

export const {
  useLoginMutation,
  useGetMeQuery,
  useChangePasswordMutation,
  useGetUsersQuery,
} = authApiSlice;
