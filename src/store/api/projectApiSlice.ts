/**
 * @fileoverview RTK Query API Slice for Project Management in MedicaWorkPlanner App.
 * @module store/api/projectApiSlice
 */
import { baseApi } from './baseApi';
import type {
  Project,
  ProjectActionStep,
  ProjectMessage,
  ProjectFileItem,
  ActionStepStatus,
} from '@/types/project';

interface ProjectsResponse {
  items: Project[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export const projectApiSlice = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getProjects: build.query<ProjectsResponse, { status?: string; search?: string } | void>({
      query: (params) => ({
        url: 'projects',
        params: params || {},
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ _id }) => ({ type: 'Project' as const, id: _id })),
              { type: 'Project', id: 'LIST' },
            ]
          : [{ type: 'Project', id: 'LIST' }],
    }),

    getProjectById: build.query<Project, string>({
      query: (id) => `projects/${id}`,
      transformResponse: (res: { success: boolean; data: Project }) => res.data,
      providesTags: (_result, _err, id) => [{ type: 'Project', id }],
    }),

    createProject: build.mutation<Project, Omit<Partial<Project>, 'steps'> & { steps?: any[] }>({
      query: (body) => ({
        url: 'projects',
        method: 'POST',
        body,
      }),
      transformResponse: (res: { success: boolean; data: Project }) => res.data,
      invalidatesTags: [{ type: 'Project', id: 'LIST' }],
    }),

    updateProject: build.mutation<Project, { id: string } & Partial<Project>>({
      query: ({ id, ...body }) => ({
        url: `projects/${id}`,
        method: 'PATCH',
        body,
      }),
      transformResponse: (res: { success: boolean; data: Project }) => res.data,
      invalidatesTags: (_res, _err, { id }) => [{ type: 'Project', id }, { type: 'Project', id: 'LIST' }],
    }),

    closeProject: build.mutation<Project, { id: string; remarks?: string }>({
      query: ({ id, remarks }) => ({
        url: `projects/${id}/close`,
        method: 'POST',
        body: { remarks },
      }),
      transformResponse: (res: { success: boolean; data: Project }) => res.data,
      invalidatesTags: (_res, _err, { id }) => [{ type: 'Project', id }, { type: 'Project', id: 'LIST' }],
    }),

    reopenProject: build.mutation<Project, string>({
      query: (id) => ({
        url: `projects/${id}/reopen`,
        method: 'POST',
      }),
      transformResponse: (res: { success: boolean; data: Project }) => res.data,
      invalidatesTags: (_res, _err, id) => [{ type: 'Project', id }, { type: 'Project', id: 'LIST' }],
    }),

    deleteProject: build.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({
        url: `projects/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Project', id: 'LIST' }],
    }),

    // Steps
    getProjectSteps: build.query<ProjectActionStep[], string>({
      query: (projectId) => `projects/${projectId}/steps`,
      transformResponse: (res: { success: boolean; data: ProjectActionStep[] }) => res.data,
      providesTags: (_res, _err, projectId) => [{ type: 'Project', id: `STEPS_${projectId}` }],
    }),

    createProjectStep: build.mutation<ProjectActionStep, { projectId: string } & Partial<ProjectActionStep>>({
      query: ({ projectId, ...body }) => ({
        url: `projects/${projectId}/steps`,
        method: 'POST',
        body,
      }),
      transformResponse: (res: { success: boolean; data: ProjectActionStep }) => res.data,
      invalidatesTags: (_res, _err, { projectId }) => [
        { type: 'Project', id: projectId },
        { type: 'Project', id: `STEPS_${projectId}` },
      ],
    }),

    updateStepStatus: build.mutation<
      ProjectActionStep,
      { projectId: string; stepId: string; status: ActionStepStatus; remark?: string }
    >({
      query: ({ projectId, stepId, status, remark }) => ({
        url: `projects/${projectId}/steps/${stepId}/status`,
        method: 'PATCH',
        body: { status, remark },
      }),
      transformResponse: (res: { success: boolean; data: ProjectActionStep }) => res.data,
      invalidatesTags: (_res, _err, { projectId }) => [
        { type: 'Project', id: projectId },
        { type: 'Project', id: `STEPS_${projectId}` },
      ],
    }),

    toggleChecklistItem: build.mutation<
      ProjectActionStep,
      { projectId: string; stepId: string; checklistItemId: string; is_completed: boolean }
    >({
      query: ({ projectId, stepId, checklistItemId, is_completed }) => ({
        url: `projects/${projectId}/steps/${stepId}/checklist/${checklistItemId}`,
        method: 'PATCH',
        body: { is_completed },
      }),
      transformResponse: (res: { success: boolean; data: ProjectActionStep }) => res.data,
      invalidatesTags: (_res, _err, { projectId }) => [{ type: 'Project', id: `STEPS_${projectId}` }],
    }),

    // Chat Messages
    getProjectMessages: build.query<
      { items: ProjectMessage[]; pagination: any },
      { projectId: string; action_step_id?: string }
    >({
      query: ({ projectId, action_step_id }) => ({
        url: `projects/${projectId}/messages`,
        params: action_step_id ? { action_step_id } : {},
      }),
      providesTags: (_res, _err, { projectId }) => [{ type: 'ProjectMessage', id: projectId }],
    }),

    postProjectMessage: build.mutation<
      ProjectMessage,
      { projectId: string; content: string; attachments?: any[]; mentions?: string[]; action_step_id?: string }
    >({
      query: ({ projectId, ...body }) => ({
        url: `projects/${projectId}/messages`,
        method: 'POST',
        body,
      }),
      transformResponse: (res: { success: boolean; data: ProjectMessage }) => res.data,
      invalidatesTags: (_res, _err, { projectId }) => [{ type: 'ProjectMessage', id: projectId }],
    }),

    // Files
    getProjectFiles: build.query<ProjectFileItem[], string>({
      query: (projectId) => `projects/${projectId}/files`,
      transformResponse: (res: { success: boolean; data: ProjectFileItem[] }) => res.data,
      providesTags: (_res, _err, projectId) => [{ type: 'Project', id: `FILES_${projectId}` }],
    }),

    uploadProjectFile: build.mutation<
      { success: boolean; data: ProjectFileItem; attachment: any },
      { projectId: string; formData: FormData }
    >({
      query: ({ projectId, formData }) => ({
        url: `projects/${projectId}/files/upload`,
        method: 'POST',
        body: formData,
      }),
      invalidatesTags: (_res, _err, { projectId }) => [
        { type: 'Project', id: `FILES_${projectId}` },
        { type: 'ProjectMessage', id: projectId },
      ],
    }),

    deleteProjectFile: build.mutation<
      { success: boolean; message: string },
      { projectId: string; fileId: string }
    >({
      query: ({ projectId, fileId }) => ({
        url: `projects/${projectId}/files/${fileId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_res, _err, { projectId }) => [
        { type: 'Project', id: `FILES_${projectId}` },
      ],
    }),

    // Teams & Members
    getEligibleMembers: build.query<
      { users: Array<{ _id: string; name: string; email: string; department?: string }>; teams: string[] },
      void
    >({
      query: () => 'projects/eligible-members',
      transformResponse: (res: { success: boolean; data: any }) => res.data || { users: [], teams: [] },
    }),

    addProjectMember: build.mutation<
      Project,
      { projectId: string; user_id?: string; user_ids?: string[]; role?: string }
    >({
      query: ({ projectId, ...body }) => ({
        url: `projects/${projectId}/members`,
        method: 'POST',
        body,
      }),
      transformResponse: (res: { success: boolean; data: Project }) => res.data,
      invalidatesTags: (_res, _err, { projectId }) => [
        { type: 'Project', id: projectId },
        { type: 'Project', id: 'LIST' },
      ],
    }),

    updateProjectMemberRole: build.mutation<
      Project,
      { projectId: string; userId: string; role: string }
    >({
      query: ({ projectId, userId, role }) => ({
        url: `projects/${projectId}/members/${userId}`,
        method: 'PATCH',
        body: { role },
      }),
      transformResponse: (res: { success: boolean; data: Project }) => res.data,
      invalidatesTags: (_res, _err, { projectId }) => [{ type: 'Project', id: projectId }],
    }),

    removeProjectMember: build.mutation<
      Project,
      { projectId: string; userId: string }
    >({
      query: ({ projectId, userId }) => ({
        url: `projects/${projectId}/members/${userId}`,
        method: 'DELETE',
      }),
      transformResponse: (res: { success: boolean; data: Project }) => res.data,
      invalidatesTags: (_res, _err, { projectId }) => [
        { type: 'Project', id: projectId },
        { type: 'Project', id: 'LIST' },
      ],
    }),

    assignProjectTeams: build.mutation<
      Project,
      { projectId: string; team_names: string[]; auto_enroll?: boolean }
    >({
      query: ({ projectId, ...body }) => ({
        url: `projects/${projectId}/teams`,
        method: 'POST',
        body,
      }),
      transformResponse: (res: { success: boolean; data: Project }) => res.data,
      invalidatesTags: (_res, _err, { projectId }) => [
        { type: 'Project', id: projectId },
        { type: 'Project', id: 'LIST' },
      ],
    }),

    removeProjectTeam: build.mutation<
      Project,
      { projectId: string; teamName: string }
    >({
      query: ({ projectId, teamName }) => ({
        url: `projects/${projectId}/teams/${encodeURIComponent(teamName)}`,
        method: 'DELETE',
      }),
      transformResponse: (res: { success: boolean; data: Project }) => res.data,
      invalidatesTags: (_res, _err, { projectId }) => [{ type: 'Project', id: projectId }],
    }),

    addWorkflowAction: build.mutation<
      ProjectActionStep,
      { projectId: string; stepId: string; title: string; description?: string; status?: string; remarks?: string }
    >({
      query: ({ projectId, stepId, ...body }) => ({
        url: `projects/${projectId}/steps/${stepId}/actions`,
        method: 'POST',
        body,
      }),
      transformResponse: (res: { success: boolean; data: ProjectActionStep }) => res.data,
      invalidatesTags: (_res, _err, { projectId }) => [
        { type: 'Project', id: projectId },
        { type: 'Project', id: `STEPS_${projectId}` },
      ],
    }),

    updateWorkflowAction: build.mutation<
      ProjectActionStep,
      { projectId: string; stepId: string; actionId: string; status?: string; remarks?: string; title?: string }
    >({
      query: ({ projectId, stepId, actionId, ...body }) => ({
        url: `projects/${projectId}/steps/${stepId}/actions/${actionId}`,
        method: 'PATCH',
        body,
      }),
      transformResponse: (res: { success: boolean; data: ProjectActionStep }) => res.data,
      invalidatesTags: (_res, _err, { projectId }) => [
        { type: 'Project', id: projectId },
        { type: 'Project', id: `STEPS_${projectId}` },
      ],
    }),

    deleteWorkflowAction: build.mutation<
      ProjectActionStep,
      { projectId: string; stepId: string; actionId: string }
    >({
      query: ({ projectId, stepId, actionId }) => ({
        url: `projects/${projectId}/steps/${stepId}/actions/${actionId}`,
        method: 'DELETE',
      }),
      transformResponse: (res: { success: boolean; data: ProjectActionStep }) => res.data,
      invalidatesTags: (_res, _err, { projectId }) => [
        { type: 'Project', id: projectId },
        { type: 'Project', id: `STEPS_${projectId}` },
      ],
    }),
  }),
});

export const {
  useGetProjectsQuery,
  useGetProjectByIdQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useCloseProjectMutation,
  useReopenProjectMutation,
  useDeleteProjectMutation,
  useGetProjectStepsQuery,
  useCreateProjectStepMutation,
  useUpdateStepStatusMutation,
  useToggleChecklistItemMutation,
  useAddWorkflowActionMutation,
  useUpdateWorkflowActionMutation,
  useDeleteWorkflowActionMutation,
  useGetProjectMessagesQuery,
  usePostProjectMessageMutation,
  useGetProjectFilesQuery,
  useUploadProjectFileMutation,
  useDeleteProjectFileMutation,
  useGetEligibleMembersQuery,
  useAddProjectMemberMutation,
  useUpdateProjectMemberRoleMutation,
  useRemoveProjectMemberMutation,
  useAssignProjectTeamsMutation,
  useRemoveProjectTeamMutation,
} = projectApiSlice;

