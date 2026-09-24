export type LeadStatus =
  | "new"
  | "assigned"
  | "follow_up"
  | "quotation"
  | "won"
  | "lost"
  | "converted";

export type LeadContactItem = {
  _id?: string;
  id?: string;
  name?: string;
  department?: string;
  designation?: string;
  phone?: string;
  email?: string;
  alternate_phone?: string;
  is_primary?: boolean;
};

export type LeadAddress = {
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
};

export type LeadRecord = {
  _id: string;
  id?: string;
  lead_no?: string;
  name?: string;
  company_name?: string;
  email?: string;
  phone?: string;
  alternate_phone?: string;
  contacts?: LeadContactItem[];
  designation?: string;
  billing_address?: LeadAddress;
  status?: LeadStatus | string;
  priority?: string;
  assigned_to?: { _id: string; name?: string; email?: string } | string;
};

export type LeadListParams = {
  search?: string;
  assigned_to?: string;
  status?: string;
  page?: number | string;
  limit?: number | string;
  paginate?: string;
  [key: string]: string | number | boolean | undefined;
};
