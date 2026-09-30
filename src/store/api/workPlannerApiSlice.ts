import { baseApi } from "./baseApi";
import { WORK_PLANNER_SERVICE_URL } from "@/lib/env";
import type {
  DayEndDraftResponse,
  DayEndPayload,
  WorkPlanDayEndAttachment,
  WorkPlanExpenseRecord,
  WorkPlanRecord,
  WorkPlannerStats,
} from "@/types/workPlanner";

function normalizePaginatedResponse<T>(res: any): {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
} {
  if (!res) {
    return { data: [], total: 0, page: 1, limit: 50, pages: 1 };
  }

  // Handle nested standard express wrapper res = { success: true, data: { total, page, limit, pages, data: [...] } }
  const payload = res.data !== undefined && res.success !== undefined ? res.data : res;

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.data)) {
      const total = payload.total ?? payload.data.length;
      const limit = payload.limit ?? 50;
      return {
        data: payload.data,
        total,
        page: payload.page ?? 1,
        limit,
        pages: payload.pages ?? (limit > 0 ? Math.ceil(total / limit) : 1),
      };
    }
    if (Array.isArray(payload)) {
      return {
        data: payload,
        total: payload.length,
        page: 1,
        limit: payload.length || 50,
        pages: 1,
      };
    }
  }

  if (Array.isArray(res)) {
    return {
      data: res,
      total: res.length,
      page: 1,
      limit: res.length || 50,
      pages: 1,
    };
  }

  return { data: [], total: 0, page: 1, limit: 50, pages: 1 };
}

export const workPlannerApiSlice = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getPlans: builder.query<
      { data: WorkPlanRecord[]; total: number; page: number; limit: number; pages: number },
      Record<string, string | number | boolean | undefined> | void
    >({
      query: (params) => {
        const query = new URLSearchParams();
        if (params) {
          Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== "") query.append(k, String(v));
          });
        }
        return `${WORK_PLANNER_SERVICE_URL}/api/work-planner?${query.toString()}`;
      },
      transformResponse: (res: any) => normalizePaginatedResponse<WorkPlanRecord>(res),
      providesTags: (result) => {
        const list = Array.isArray(result?.data) ? result.data : [];
        return [
          ...list.map(({ _id, id }) => ({ type: "WorkPlan" as const, id: _id || id })),
          { type: "WorkPlan", id: "LIST" },
        ];
      },
    }),
    getStats: builder.query<WorkPlannerStats, Record<string, string | number | undefined> | void>({
      query: (params) => {
        const query = new URLSearchParams();
        if (params) {
          Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== "") query.append(k, String(v));
          });
        }
        return `${WORK_PLANNER_SERVICE_URL}/api/work-planner/stats?${query.toString()}`;
      },
      transformResponse: (res: any) => res.data || res,
      providesTags: ["WorkPlannerStats"],
    }),
    getPlan: builder.query<WorkPlanRecord, string>({
      query: (id) => `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${id}`,
      transformResponse: (res: any) => res.data || res,
      providesTags: (_result, _error, id) => [{ type: "WorkPlan", id }],
    }),
    createPlan: builder.mutation<WorkPlanRecord, Partial<WorkPlanRecord>>({
      query: (body) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner`,
        method: "POST",
        body,
      }),
      transformResponse: (res: any) => res.data || res,
      invalidatesTags: [{ type: "WorkPlan", id: "LIST" }, "WorkPlannerStats"],
    }),
    updatePlan: builder.mutation<WorkPlanRecord, { id: string; body: Partial<WorkPlanRecord> }>({
      query: ({ id, body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${id}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (res: any) => res.data || res,
      invalidatesTags: (_result, _error, { id }) => [
        { type: "WorkPlan", id },
        { type: "WorkPlan", id: "LIST" },
        "WorkPlannerStats",
      ],
    }),
    deletePlan: builder.mutation<WorkPlanRecord, string>({
      query: (id) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${id}`,
        method: "DELETE",
      }),
      transformResponse: (res: any) => res.data || res,
      invalidatesTags: [{ type: "WorkPlan", id: "LIST" }, "WorkPlannerStats"],
    }),
    submitPlan: builder.mutation<WorkPlanRecord, { id: string; body?: any } | string>({
      query: (arg) => {
        const id = typeof arg === "string" ? arg : arg.id;
        const body = typeof arg === "string" ? undefined : arg.body;
        return {
          url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${id}/submit`,
          method: "POST",
          body,
        };
      },
      transformResponse: (res: any) => res.data || res,
      invalidatesTags: (_result, _error, arg) => {
        const id = typeof arg === "string" ? arg : arg.id;
        return [{ type: "WorkPlan", id }, { type: "WorkPlan", id: "LIST" }, "WorkPlannerStats"];
      },
    }),
    approvePlan: builder.mutation<WorkPlanRecord, string>({
      query: (id) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${id}/approve`,
        method: "POST",
      }),
      transformResponse: (res: any) => res.data || res,
      invalidatesTags: (_result, _error, id) => [{ type: "WorkPlan", id }, { type: "WorkPlan", id: "LIST" }, "WorkPlannerStats"],
    }),
    rejectPlan: builder.mutation<WorkPlanRecord, { id: string; rejection_reason: string }>({
      query: ({ id, rejection_reason }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${id}/reject`,
        method: "POST",
        body: { rejection_reason },
      }),
      transformResponse: (res: any) => res.data || res,
      invalidatesTags: (_result, _error, { id }) => [{ type: "WorkPlan", id }, { type: "WorkPlan", id: "LIST" }, "WorkPlannerStats"],
    }),
    completePlan: builder.mutation<
      WorkPlanRecord,
      string | { id: string; body?: DayEndPayload }
    >({
      query: (arg) => {
        const id = typeof arg === "string" ? arg : arg.id;
        const body = typeof arg === "string" ? undefined : arg.body;
        return {
          url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${id}/complete`,
          method: "POST",
          body,
        };
      },
      transformResponse: (res: any) => res.data || res,
      invalidatesTags: (_result, _error, arg) => {
        const id = typeof arg === "string" ? arg : arg.id;
        return [{ type: "WorkPlan", id }, { type: "WorkPlan", id: "LIST" }, "WorkPlannerStats"];
      },
    }),
    addWorkPlanAuthorityRemark: builder.mutation<WorkPlanRecord, { planId: string; remark: string }>({
      query: ({ planId, remark }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/authority-remarks`,
        method: "POST",
        body: { remark },
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "WorkPlannerStats"],
    }),
    getDayEndDraft: builder.query<DayEndDraftResponse, string>({
      query: (id) => `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${id}/day-end-draft`,
      transformResponse: (res: any) => res.data || res,
      providesTags: (_result, _error, id) => [{ type: "WorkPlan", id }],
    }),
    uploadWorkPlanAttachment: builder.mutation<WorkPlanDayEndAttachment, FormData>({
      query: (body) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/attachments/upload`,
        method: "POST",
        body,
      }),
      transformResponse: (res: any) => res.data || res,
    }),
    // Visits
    addVisit: builder.mutation<WorkPlanRecord, { planId: string; body: unknown }>({
      query: ({ planId, body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/visits`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "WorkPlannerStats"],
    }),
    updateVisit: builder.mutation<WorkPlanRecord, { planId: string; visitId: string; body: unknown }>({
      query: ({ planId, visitId, body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/visits/${visitId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "WorkPlannerStats"],
    }),
    removeVisit: builder.mutation<WorkPlanRecord, { planId: string; visitId: string }>({
      query: ({ planId, visitId }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/visits/${visitId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "WorkPlannerStats"],
    }),
    checkInVisit: builder.mutation<WorkPlanRecord, { planId: string; visitId: string; body?: unknown }>({
      query: ({ planId, visitId, body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/visits/${visitId}/check-in`,
        method: "POST",
        body: body || {},
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "WorkPlannerStats"],
    }),
    checkOutVisit: builder.mutation<WorkPlanRecord, { planId: string; visitId: string; body?: unknown }>({
      query: ({ planId, visitId, body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/visits/${visitId}/check-out`,
        method: "POST",
        body: body || {},
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "WorkPlannerStats"],
    }),
    completeVisit: builder.mutation<WorkPlanRecord, { planId: string; visitId: string; body: unknown }>({
      query: ({ planId, visitId, body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/visits/${visitId}/complete`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "WorkPlannerStats"],
    }),
    addVisitAuthorityRemark: builder.mutation<WorkPlanRecord, { planId: string; visitId: string; remark: string }>({
      query: ({ planId, visitId, remark }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/visits/${visitId}/authority-remarks`,
        method: "POST",
        body: { remark },
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "WorkPlannerStats"],
    }),
    // Standalone Visits
    addStandaloneVisit: builder.mutation<any, { body: unknown }>({
      query: ({ body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/standalone-visits`,
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "WorkPlan", id: "LIST" }, "WorkPlannerStats"],
    }),
    updateStandaloneVisit: builder.mutation<any, { visitId: string; body: unknown }>({
      query: ({ visitId, body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/standalone-visits/${visitId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: [{ type: "WorkPlan", id: "LIST" }, "WorkPlannerStats"],
    }),
    removeStandaloneVisit: builder.mutation<any, { visitId: string }>({
      query: ({ visitId }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/standalone-visits/${visitId}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "WorkPlan", id: "LIST" }, "WorkPlannerStats"],
    }),
    // Standalone Works
    addStandaloneWork: builder.mutation<any, { body: unknown }>({
      query: ({ body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/standalone-works`,
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "WorkPlan", id: "LIST" }, "WorkPlannerStats"],
    }),
    updateStandaloneWork: builder.mutation<any, { workId: string; body: unknown }>({
      query: ({ workId, body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/standalone-works/${workId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: [{ type: "WorkPlan", id: "LIST" }, "WorkPlannerStats"],
    }),
    removeStandaloneWork: builder.mutation<any, { workId: string }>({
      query: ({ workId }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/standalone-works/${workId}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "WorkPlan", id: "LIST" }, "WorkPlannerStats"],
    }),
    // Works
    addWork: builder.mutation<WorkPlanRecord, { planId: string; body: unknown }>({
      query: ({ planId, body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/works`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "WorkPlannerStats"],
    }),
    updateWork: builder.mutation<WorkPlanRecord, { planId: string; workId: string; body: unknown }>({
      query: ({ planId, workId, body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/works/${workId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "WorkPlannerStats"],
    }),
    removeWork: builder.mutation<WorkPlanRecord, { planId: string; workId: string }>({
      query: ({ planId, workId }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/works/${workId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "WorkPlannerStats"],
    }),
    addWorkAuthorityRemark: builder.mutation<WorkPlanRecord, { planId: string; workId: string; remark: string }>({
      query: ({ planId, workId, remark }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/works/${workId}/authority-remarks`,
        method: "POST",
        body: { remark },
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "WorkPlannerStats"],
    }),
    // Expenses
    getExpenses: builder.query<
      { data: WorkPlanExpenseRecord[]; total: number; page: number; limit: number; pages: number },
      Record<string, string | number | undefined> | void
    >({
      query: (params) => {
        const query = new URLSearchParams();
        if (params) {
          Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== "") query.append(k, String(v));
          });
        }
        return `${WORK_PLANNER_SERVICE_URL}/api/work-planner/expenses?${query.toString()}`;
      },
      transformResponse: (res: any) => normalizePaginatedResponse<WorkPlanExpenseRecord>(res),
      providesTags: (result) => {
        const list = Array.isArray(result?.data) ? result.data : [];
        return [
          ...list.map(({ _id, id }) => ({ type: "Expense" as const, id: _id || id })),
          "Expense",
        ];
      },
    }),
    addExpense: builder.mutation<WorkPlanRecord, { planId: string; body: unknown }>({
      query: ({ planId, body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/expenses`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "Expense", "WorkPlannerStats"],
    }),
    updateExpense: builder.mutation<WorkPlanRecord, { planId: string; expenseId: string; body: unknown }>({
      query: ({ planId, expenseId, body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/expenses/${expenseId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "Expense", "WorkPlannerStats"],
    }),
    removeExpense: builder.mutation<WorkPlanRecord, { planId: string; expenseId: string }>({
      query: ({ planId, expenseId }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/expenses/${expenseId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "Expense", "WorkPlannerStats"],
    }),
    submitExpense: builder.mutation<WorkPlanRecord, { planId: string; expenseId: string }>({
      query: ({ planId, expenseId }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/expenses/${expenseId}/submit`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "Expense", "WorkPlannerStats"],
    }),
    approveExpense: builder.mutation<WorkPlanRecord, { planId: string; expenseId: string }>({
      query: ({ planId, expenseId }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/expenses/${expenseId}/approve`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "Expense", "WorkPlannerStats"],
    }),
    rejectExpense: builder.mutation<WorkPlanRecord, { planId: string; expenseId: string; rejection_reason: string }>({
      query: ({ planId, expenseId, rejection_reason }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/expenses/${expenseId}/reject`,
        method: "POST",
        body: { rejection_reason },
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "Expense", "WorkPlannerStats"],
    }),
    submitAllExpenses: builder.mutation<WorkPlanRecord, { planId: string }>({
      query: ({ planId }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/expenses/submit-all`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "Expense", "WorkPlannerStats"],
    }),
    approveAllExpenses: builder.mutation<WorkPlanRecord, { planId: string }>({
      query: ({ planId }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/expenses/approve-all`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "Expense", "WorkPlannerStats"],
    }),
    rejectAllExpenses: builder.mutation<WorkPlanRecord, { planId: string; rejection_reason: string }>({
      query: ({ planId, rejection_reason }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${planId}/expenses/reject-all`,
        method: "POST",
        body: { rejection_reason },
      }),
      invalidatesTags: (_result, _error, { planId }) => [{ type: "WorkPlan", id: planId }, "Expense", "WorkPlannerStats"],
    }),
    uploadExpenseReceipt: builder.mutation<any, FormData>({
      query: (body) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/expenses/upload`,
        method: "POST",
        body,
      }),
      transformResponse: (res: any) => res.data || res,
    }),
    getUserSettings: builder.query<any, string>({
      query: (userId) => `${WORK_PLANNER_SERVICE_URL}/api/work-planner/user-settings/${userId}`,
      transformResponse: (res: any) => res.data || res,
      providesTags: (_result, _error, userId) => [{ type: "WorkPlan" as const, id: `USER_SETTINGS_${userId}` }],
    }),
    updateUserSettings: builder.mutation<any, { userId: string; body: any }>({
      query: ({ userId, body }) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/user-settings/${userId}`,
        method: "PUT",
        body,
      }),
      transformResponse: (res: any) => res.data || res,
      invalidatesTags: (_result, _error, { userId }) => [{ type: "WorkPlan" as const, id: `USER_SETTINGS_${userId}` }],
    }),
    getTeamTree: builder.query<any, void>({
      query: () => `${WORK_PLANNER_SERVICE_URL}/api/work-planner/team/tree`,
      transformResponse: (res: any) => res.data || res,
      providesTags: ["WorkPlannerTeam"],
    }),
    getMyTeam: builder.query<any, void>({
      query: () => `${WORK_PLANNER_SERVICE_URL}/api/work-planner/team/my-team`,
      transformResponse: (res: any) => res.data || res,
      providesTags: ["WorkPlannerTeam"],
    }),
    getTeamMembers: builder.query<any, void>({
      query: () => `${WORK_PLANNER_SERVICE_URL}/api/work-planner/team/members`,
      transformResponse: (res: any) => res.data || res,
      providesTags: ["WorkPlannerTeam"],
    }),
    getEligibleManagers: builder.query<any[], void>({
      query: () => `${WORK_PLANNER_SERVICE_URL}/api/work-planner/eligible-managers`,
      transformResponse: (res: any) => res.data || [],
      providesTags: ["WorkPlannerTeam"],
    }),
    upsertTeamEdge: builder.mutation<any, { subordinate: string; manager: string }>({
      query: (body) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/team/edges`,
        method: "PUT",
        body,
      }),
      transformResponse: (res: any) => res.data || res,
      invalidatesTags: (_result, _error, arg) => [
        "WorkPlannerTeam",
        { type: "WorkPlan" as const, id: `USER_SETTINGS_${arg.subordinate}` },
      ],
    }),
    removeTeamEdge: builder.mutation<any, string>({
      query: (subordinateId) => ({
        url: `${WORK_PLANNER_SERVICE_URL}/api/work-planner/team/edges/${subordinateId}`,
        method: "DELETE",
      }),
      transformResponse: (res: any) => res.data || res,
      invalidatesTags: (_result, _error, subordinateId) => [
        "WorkPlannerTeam",
        { type: "WorkPlan" as const, id: `USER_SETTINGS_${subordinateId}` },
      ],
    }),
  }),
});

export const {
  useGetPlansQuery,
  useLazyGetPlansQuery,
  useGetStatsQuery,
  useGetPlanQuery,
  useLazyGetPlanQuery,
  useCreatePlanMutation,
  useUpdatePlanMutation,
  useDeletePlanMutation,
  useSubmitPlanMutation,
  useApprovePlanMutation,
  useRejectPlanMutation,
  useCompletePlanMutation,
  useAddWorkPlanAuthorityRemarkMutation,
  useAddVisitMutation,
  useUpdateVisitMutation,
  useRemoveVisitMutation,
  useCheckInVisitMutation,
  useCheckOutVisitMutation,
  useAddStandaloneVisitMutation,
  useUpdateStandaloneVisitMutation,
  useRemoveStandaloneVisitMutation,
  useCompleteVisitMutation,
  useAddVisitAuthorityRemarkMutation,
  useAddWorkMutation,
  useUpdateWorkMutation,
  useRemoveWorkMutation,
  useAddWorkAuthorityRemarkMutation,
  useAddStandaloneWorkMutation,
  useUpdateStandaloneWorkMutation,
  useRemoveStandaloneWorkMutation,
  useGetExpensesQuery,
  useLazyGetExpensesQuery,
  useAddExpenseMutation,
  useUpdateExpenseMutation,
  useRemoveExpenseMutation,
  useSubmitExpenseMutation,
  useApproveExpenseMutation,
  useRejectExpenseMutation,
  useSubmitAllExpensesMutation,
  useApproveAllExpensesMutation,
  useRejectAllExpensesMutation,
  useUploadExpenseReceiptMutation,
  useGetDayEndDraftQuery,
  useLazyGetDayEndDraftQuery,
  useUploadWorkPlanAttachmentMutation,
  useGetUserSettingsQuery,
  useUpdateUserSettingsMutation,
  useGetTeamTreeQuery,
  useGetMyTeamQuery,
  useGetTeamMembersQuery,
  useGetEligibleManagersQuery,
  useUpsertTeamEdgeMutation,
  useRemoveTeamEdgeMutation,
} = workPlannerApiSlice;
