export type WorkPlanStatus =
  | "draft"
  | "planned"
  | "submitted"
  | "approved"
  | "rejected"
  | "completed";

export type WorkPlanVisitStatus =
  | "created"
  | "pending"
  | "in_progress"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "skipped"
  | "rescheduled";

export type WorkPlanVisitPartyType =
  | "existing"
  | "existing_lead"
  | "new_party"
  | "new_lead";

export type WorkPlanExpenseStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected";

export type WorkPlanExpenseCategory =
  | "Travel"
  | "Accommodation"
  | "Food"
  | "Communication"
  | "Client Entertainment"
  | "Marketing"
  | "Office"
  | "Miscellaneous";

export type WorkPlanExpenseTravelSubCategory =
  | "Cab"
  | "Auto"
  | "Bus"
  | "Bike Ride"
  | "Private Bike"
  | "Train"
  | "Parking";

export type WorkPlanExpensePaymentMode =
  | "Cash"
  | "UPI"
  | "Card"
  | "Bank Transfer"
  | "Company Card";

export const WORK_PLAN_EXPENSE_CATEGORIES: WorkPlanExpenseCategory[] = [
  "Travel",
  "Accommodation",
  "Food",
  "Communication",
  "Client Entertainment",
  "Marketing",
  "Office",
  "Miscellaneous",
];

export const WORK_PLAN_TRAVEL_SUB_CATEGORIES: WorkPlanExpenseTravelSubCategory[] = [
  "Cab",
  "Auto",
  "Bus",
  "Bike Ride",
  "Private Bike",
  "Train",
  "Parking",
];

export const WORK_PLAN_EXPENSE_PAYMENT_MODES: WorkPlanExpensePaymentMode[] = [
  "Cash",
  "UPI",
  "Card",
  "Bank Transfer",
  "Company Card",
];

export type WorkPlanExpenseAttachment = {
  _id: string;
  original_name?: string;
  file_name?: string;
  mime_type?: string;
  url?: string;
  key?: string;
};

export type WorkPlanExpenseRecord = {
  _id?: string;
  id?: string;
  work_plan?:
    | string
    | {
        _id?: string;
        id?: string;
        plan_date?: string;
        location?: string;
        status?: WorkPlanStatus;
        sales_user?:
          | string
          | {
              _id?: string;
              name?: string;
              email?: string;
              department?: string;
            };
      };
  work_plan_visit?:
    | string
    | {
        _id?: string;
        id?: string;
        sequence?: number;
        party_type?: string;
        party_name?: string;
        contact_person?: string;
        party?: { _id?: string; party_name?: string };
      };
  work_plan_id?: string;
  sales_user?: string | { _id?: string; name?: string; email?: string };
  expense_date: string;

  category: WorkPlanExpenseCategory;
  sub_category?: string;
  amount: number;
  payment_mode: WorkPlanExpensePaymentMode;
  vendor_name?: string;
  bill_number?: string;
  bill_date?: string;
  description?: string;
  receipt_attachment?: WorkPlanExpenseAttachment | string | null;
  start_reading?: number;
  closing_reading?: number;
  start_reading_image?: WorkPlanExpenseAttachment | string | null;
  end_reading_image?: WorkPlanExpenseAttachment | string | null;
  status: WorkPlanExpenseStatus;
  approved_by?: { _id?: string; name?: string; email?: string } | string;
  approved_at?: string;
  rejection_reason?: string;
  created_by?: { _id?: string; name?: string; email?: string } | string;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkPlanVisitRecord = {
  _id?: string;
  id?: string;
  work_plan?: string;
  sales_user?:
    | string
    | {
        _id?: string;
        id?: string;
        name?: string;
        email?: string;
        department?: string;
      };
  plan_date?: string;
  sequence: number;
  party_type?: WorkPlanVisitPartyType;
  party?:
    | string
    | {
        _id?: string;
        party_name?: string;
        mobile?: string;
        email?: string;
        contact_person?: string;
        contacts?: Array<{
          contact_person?: string;
          contact_number?: string;
          contact_email?: string;
        }>;
        billing_address?: unknown;
        shipping_address?: unknown;
      };
  party_name?: string;
  contact_person?: string;
  contact_number?: string;
  phone?: string;
  contact_email?: string;

  contacts?: Array<{
    contact_person?: string;
    contact_number?: string;
    contact_email?: string;
  }>;
  address?: string;
  planned_start_time?: string;
  planned_end_time?: string;
  purpose?: string;
  notes?: string;
  status: WorkPlanVisitStatus;
  actual_check_in?: string;
  actual_check_out?: string;
  check_in_time?: string;
  check_out_time?: string;
  outcome?: string;
  pending_remarks?: string;
  in_progress_remarks?: string;
  meeting_with_doctor?: boolean;
  meeting_with_purchase?: boolean;
  meeting_with_finance?: boolean;
  meeting_with_engineer?: boolean;
  new_product_introduced?: boolean;
  order_received?: boolean;
  next_followup_date?: string;
  created_by?: string | { _id?: string; name?: string; email?: string; role?: string };
  created_by_role?: string;
  updated_by?: string | { _id?: string; name?: string; email?: string; role?: string };
  updated_by_role?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkPlanWorkRecord = {
  _id?: string;
  id?: string;
  work_plan?: string;
  sales_user?:
    | string
    | {
        _id?: string;
        id?: string;
        name?: string;
        email?: string;
        department?: string;
      };
  plan_date?: string;
  sequence: number;
  title: string;
  description?: string;
  planned_start_time?: string;
  planned_end_time?: string;
  status: "created" | "pending" | "in_progress" | "completed" | "cancelled";
  completion_remarks?: string;
  pending_remarks?: string;
  in_progress_remarks?: string;
  outcome?: string;
  work_type?: "default" | "optional" | string;
  is_default_task?: boolean;
  is_template_task?: boolean;
  created_by?: string | { _id?: string; name?: string; email?: string; role?: string };
  created_by_role?: string;
  updated_by?: string | { _id?: string; name?: string; email?: string; role?: string };
  updated_by_role?: string;
  createdAt?: string;
  updatedAt?: string;
};


export type WorkPlanRecord = {
  _id?: string;
  id?: string;
  is_standalone?: boolean;
  company_id?: string;
  plan_date: string;
  sales_user?:
    | string
    | {
        _id?: string;
        id?: string;
        name?: string;
        email?: string;
        department?: string;
      };
  status: WorkPlanStatus;
  plan_type?: "Visits" | "Tasks & Visits" | "Leave" | "Work From Home" | "Work From Office";
  remarks?: string;
  location?: string;
  is_discussed_with_manager?: boolean;
  discussed_manager_id?: string | { _id?: string; name?: string; email?: string };
  discussed_manager_name?: string;
  discussion_method?: "on_call" | "on_direct_meeting" | "on_email" | "other";
  submitted_at?: string;
  approved_by?: string | { _id?: string; name?: string; email?: string };
  approved_at?: string;
  rejection_reason?: string;
  visit_count?: number;
  work_count?: number;
  visits?: WorkPlanVisitRecord[];
  works?: WorkPlanWorkRecord[];
  expenses?: WorkPlanExpenseRecord[];
  expense_total?: number;
  expense_approved_total?: number;
  visit_expense_totals?: Record<string, number>;
  day_end?: WorkPlanDayEnd;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkPlanDayEndAttachment = {
  _id: string;
  original_name?: string;
  file_name?: string;
  mime_type?: string;
  size?: number;
  url?: string;
};

export type WorkPlanDayEnd = {
  completed_at?: string;
  from_email?: string;
  to_email?: string;
  cc_emails?: string[];
  subject?: string;
  body_html?: string;
  attachments?: WorkPlanDayEndAttachment[];
};

export type DayEndDraftResponse = {
  plan_id: string;
  plan_date: string;
  from: string;
  from_email: string;
  to: string;
  cc: string[];
  subject: string;
  body_html: string;
  managers: Array<{
    _id: string;
    name: string;
    email: string;
    department?: string;
  }>;
};

export type DayEndPayload = {
  from_email?: string;
  to_email: string;
  cc_emails?: string[];
  subject: string;
  body_html: string;
  attachment_ids?: string[];
};

export type WorkPlannerStats = {
  total_plans: number;
  today_plans: number;
  pending_approval: number;
  approved: number;
  completed: number;
  rejected: number;
  average_visits: number;
  average_works: number;
  total_visits: number;
  total_works: number;
  by_status: Record<string, number>;
  by_plan_type: Record<string, number>;
  monthly_trend: Array<{ year: number; month: number; count: number }>;
  expense_total: number;
  expense_pending_approval: number;
  expense_approved_count: number;
  expense_monthly_trend: Array<{ year: number; month: number; amount: number; count: number }>;
};

export const THEME_COLORS = [
  { name: "violet", label: "Violet", bg: "bg-purple-600", border: "border-purple-500", text: "text-purple-400" },
  { name: "indigo", label: "Indigo", bg: "bg-indigo-600", border: "border-indigo-500", text: "text-indigo-400" },
  { name: "blue", label: "Blue", bg: "bg-blue-600", border: "border-blue-500", text: "text-blue-400" },
  { name: "emerald", label: "Emerald", bg: "bg-emerald-600", border: "border-emerald-500", text: "text-emerald-400" },
  { name: "rose", label: "Rose", bg: "bg-rose-600", border: "border-rose-500", text: "text-rose-400" },
  { name: "amber", label: "Amber", bg: "bg-amber-600", border: "border-amber-500", text: "text-amber-400" },
] as const;

export type ThemeColor = (typeof THEME_COLORS)[number]["name"];

export type UserPortalAccess = {
  portal_code: string;
  access_roles: string[];
};

export type AuthUser = {
  _id: string;
  name: string;
  email: string;
  department: string;
  roles?: string[];
  role_codes?: string[];
  role_names?: string[];
  portals?: UserPortalAccess[];
};

export type UserSession = {
  token: string;
  user: AuthUser;
};

