/**
 * @fileoverview TypeScript Type Definitions for Project Management in MedicaWorkPlanner App.
 * @module types/project
 */

export type ProjectStatus =
  | 'draft'
  | 'planning'
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'closed'
  | 'cancelled';

export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical';

export type ActionStepStatus =
  | 'pending'
  | 'in_progress'
  | 'under_review'
  | 'completed'
  | 'blocked'
  | 'skipped';

export type ProjectMemberRole = 'admin' | 'lead' | 'coordinator' | 'contributor' | 'viewer';

export interface ProjectMember {
  user_id: string | { _id: string; name: string; email: string };
  user_name?: string;
  user_email?: string;
  role: ProjectMemberRole;
  assigned_at?: string;
  assigned_by?: string;
}

export interface ChecklistItem {
  _id?: string;
  title: string;
  is_completed: boolean;
  completed_at?: string | null;
  completed_by?: string | null;
}

export interface StepAttachment {
  _id?: string;
  attachment_id: string | { _id: string; filename: string; url?: string };
  name: string;
  url?: string;
  file_type?: string;
  size?: number;
  uploaded_by?: string;
  uploaded_at?: string;
}

export type WorkflowActionStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped';

export interface WorkflowAction {
  _id?: string;
  action_order: number;
  title: string;
  description?: string;
  status: WorkflowActionStatus;
  assigned_to_user_id?: string | { _id: string; name: string; email: string } | null;
  assigned_to_user_name?: string;
  started_at?: string | null;
  completed_at?: string | null;
  performed_by?: string | { _id: string; name: string; email: string } | null;
  performed_by_name?: string;
  remarks?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StepRemark {
  _id?: string;
  user_id?: string;
  user_name?: string;
  comment: string;
  created_at: string;
}

export interface ProjectActionStep {
  _id: string;
  project_id: string;
  phase_name: string;
  step_number: number;
  title: string;
  description?: string;
  status: ActionStepStatus;
  priority: ProjectPriority;
  assigned_to_user_id?: string | { _id: string; name: string; email: string } | null;
  assigned_to_user_name?: string;
  due_date?: string | null;
  start_date?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  dependencies?: string[];
  checklist: ChecklistItem[];
  workflow_actions?: WorkflowAction[];
  attachments: StepAttachment[];
  remarks: StepRemark[];
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  _id: string;
  company_id?: string;
  title: string;
  project_code: string;
  description?: string;
  category: string;
  priority: ProjectPriority;
  status: ProjectStatus;
  start_date?: string | null;
  target_end_date?: string | null;
  actual_closed_date?: string | null;
  closed_by?: string | { _id: string; name: string; email: string } | null;
  closure_remarks?: string;
  created_by: string | { _id: string; name: string; email: string };
  project_manager_id?: string | { _id: string; name: string; email: string };
  assigned_team_ids?: string[];
  members: ProjectMember[];
  total_steps: number;
  completed_steps: number;
  progress_percentage: number;
  tags?: string[];
  is_archived?: boolean;
  steps?: ProjectActionStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatAttachment {
  _id?: string;
  attachment_id: string;
  original_name: string;
  mime_type?: string;
  size_bytes?: number;
  file_url?: string;
}

export interface ProjectMessage {
  _id: string;
  project_id: string;
  action_step_id?: string | null;
  sender_id: string | { _id: string; name: string; email: string };
  sender_name: string;
  sender_role?: string;
  message_type: 'text' | 'file' | 'image' | 'system_event';
  content: string;
  attachments?: ChatAttachment[];
  mentions?: Array<string | { _id: string; name: string; email: string }>;
  is_pinned?: boolean;
  pinned_by?: string | { _id: string; name: string };
  pinned_at?: string;
  read_by?: Array<{ user_id: string; read_at: string }>;
  createdAt: string;
}

export interface ProjectFileItem {
  _id: string;
  project_id: string;
  action_step_id?: string | null;
  attachment_id: string | { _id: string; filename: string; url?: string; size?: number };
  file_name: string;
  folder: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_by: string | { _id: string; name: string; email: string };
  uploader_name?: string;
  version: number;
  is_archived?: boolean;
  createdAt: string;
}
