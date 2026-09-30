export interface PowerClientRepresentative {
  name?: string;
  contact_number?: string;
  email?: string;
  designation?: string;
}

export interface PowerFacility {
  id?: string;
  _id?: string;
  audit_number?: string;
  enquiry_number?: string;
  name: string;
  city?: string;
  address?: string;
  client_representative?: string;
  client_contact_number?: string;
  client_email?: string;
  client_representatives?: PowerClientRepresentative[];
  facility_type?: string;
  audit_type?: string;
  status?: string;
  start_date?: string;
  closure_date?: string;
  expected_value?: number;
}

export interface PowerEnquiry {
  id?: string;
  _id?: string;
  enquiry_number?: string;
  name: string;
  city?: string;
  address?: string;
  client_representative?: string;
  client_contact_number?: string;
  client_email?: string;
  client_representatives?: PowerClientRepresentative[];
  enquiry_status?: string;
  source?: string;
  expected_value?: number;
  requested_audit_types?: string[];
  notes?: string;
  is_converted_to_facility?: boolean;
}

export interface PowerAppListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  city?: string;
  audit_type?: string;
  facility_type?: string;
  is_converted?: boolean;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}
