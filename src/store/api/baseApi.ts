import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { getSession } from "@/lib/session";
import { WORK_PLANNER_SERVICE_URL } from "@/lib/env";

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: `${WORK_PLANNER_SERVICE_URL}/api`,
    prepareHeaders(headers) {
      const session = getSession();
      if (session?.token) {
        headers.set("Authorization", `Bearer ${session.token}`);
      }
      return headers;
    },
  }),
  tagTypes: [
    "AuthSession",
    "CompanyInfo",
    "WorkPlan",
    "WorkPlannerStats",
    "WorkPlannerTeam",
    "Expense",
    "Party",
    "Lead",
    "Notifications",
  ],
  endpoints: () => ({}),
});
