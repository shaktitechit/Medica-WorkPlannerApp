import { baseApi } from "./baseApi";
import { AUTH_SERVICE_URL } from "@/lib/env";

export type CompanyInfoRecord = {
  _id?: string;
  legal_name?: string;
  trade_name?: string;
  gstin?: string;
  email?: string;
  phone?: string;
  website?: string;
  logo_url?: string;
  favicon_url?: string;
  primary_color?: string;
  secondary_color?: string;
  theme_palette?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  invoice_footer_note?: string;
};

export const companyApiSlice = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getCompanyInfo: builder.query<CompanyInfoRecord, void>({
      query: () => `${AUTH_SERVICE_URL}/api/company-info`,
      transformResponse: (res: any) => res?.data || res,
      providesTags: ["CompanyInfo"],
    }),
  }),
});

export const { useGetCompanyInfoQuery } = companyApiSlice;
