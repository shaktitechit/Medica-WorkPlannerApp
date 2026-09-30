import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { router } from "expo-router";
import { AUTH_SERVICE_URL, WORK_PLANNER_SERVICE_URL } from "@/lib/env";
import { getSession, persistSession } from "@/lib/session";
import type { UserSession } from "@/types/workPlanner";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${WORK_PLANNER_SERVICE_URL}/api`,
  prepareHeaders(headers) {
    const session = getSession();
    if (session?.token) {
      headers.set("Authorization", `Bearer ${session.token}`);
    }
    return headers;
  },
});

function requestUrl(args: string | FetchArgs): string {
  return typeof args === "string" ? args : args.url;
}

function skipRefresh(url: string): boolean {
  return url.includes("auth/login") || url.includes("auth/refresh");
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const session = getSession();
  if (!session?.refreshToken) return false;
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      token?: string;
      refreshToken?: string;
      user?: UserSession["user"];
      data?: { token?: string; refreshToken?: string; user?: UserSession["user"] };
    };
    const token = data.token || data.data?.token;
    const refreshToken = data.refreshToken || data.data?.refreshToken || session.refreshToken;
    const user = data.user || data.data?.user || session.user;
    if (!token || !user) return false;
    await persistSession({ token, refreshToken, user });
    return true;
  } catch {
    return false;
  }
}

async function forceLogout(): Promise<void> {
  await persistSession(null);
  router.replace("/login");
}

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status !== 401 || skipRefresh(requestUrl(args))) return result;

  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  const ok = await refreshInFlight;
  if (!ok) {
    await forceLogout();
    return result;
  }
  return rawBaseQuery(args, api, extraOptions);
};

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithAuth,
  tagTypes: [
    "AuthSession",
    "CompanyInfo",
    "WorkPlan",
    "WorkPlannerStats",
    "WorkPlannerTeam",
    "Expense",
    "Party",
    "Lead",
    "PowerFacility",
    "PowerEnquiry",
    "Notifications",
    "Project",
    "ProjectMessage",
  ],
  endpoints: () => ({}),
});
