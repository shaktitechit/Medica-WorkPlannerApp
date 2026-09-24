export interface PartyContact {
  name?: string;
  phone?: string;
  email?: string;
  alternate_phone?: string;
  department?: string;
  contact_person?: string;
  contact_number?: string;
  contact_email?: string;
  designation?: string;
}

export interface PartyRecord {
  _id: string;
  id?: string;
  party_name: string;
  party_type?: string;
  contact_person?: string;
  mobile?: string;
  email?: string;
  gst_no?: string;
  drug_license_no?: string;
  billing_address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    [key: string]: unknown;
  };
  shipping_address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    [key: string]: unknown;
  };
  district?: string;
  state?: string;
  contacts?: PartyContact[];
  payment_terms?: string;
  is_active?: boolean;
  is_featured?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PartyListParams {
  search?: string;
  type?: string;
  status?: string;
  is_featured?: string;
  page?: number | string;
  limit?: number | string;
  [key: string]: string | number | boolean | undefined;
}

export interface PartyListResponse {
  success?: boolean;
  data: PartyRecord[] | { items: PartyRecord[]; total: number; page: number; limit: number };
  total?: number;
  page?: number;
  limit?: number;
}
