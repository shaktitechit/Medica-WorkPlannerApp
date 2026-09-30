import { baseApi } from "./baseApi";
import type {
  PowerFacility,
  PowerEnquiry,
  PowerAppListParams,
} from "@/types/powerApp";

export const powerAppApiSlice = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getPowerFacilities: builder.query<PowerFacility[], PowerAppListParams | void>({
      query: (params) => {
        const query = new URLSearchParams();
        if (params) {
          Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== "") query.append(k, String(v));
          });
        }
        const qStr = query.toString();
        return qStr ? `power-app/facilities?${qStr}` : "power-app/facilities";
      },
      transformResponse: (res: any) => {
        const rawData = res?.data ?? res;
        if (Array.isArray(rawData)) return rawData;
        if (rawData?.items && Array.isArray(rawData.items)) return rawData.items;
        return [];
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ _id, id }) => ({
                type: "PowerFacility" as const,
                id: _id || id,
              })),
              { type: "PowerFacility", id: "LIST" },
            ]
          : [{ type: "PowerFacility", id: "LIST" }],
    }),
    getPowerFacilityById: builder.query<PowerFacility, string>({
      query: (id) => `power-app/facilities/${encodeURIComponent(id)}`,
      transformResponse: (res: any) => res?.data ?? res,
      providesTags: (_result, _error, id) => [{ type: "PowerFacility", id }],
    }),
    getPowerEnquiries: builder.query<PowerEnquiry[], PowerAppListParams | void>({
      query: (params) => {
        const query = new URLSearchParams();
        if (params) {
          Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== "") query.append(k, String(v));
          });
        }
        const qStr = query.toString();
        return qStr ? `power-app/enquiries?${qStr}` : "power-app/enquiries";
      },
      transformResponse: (res: any) => {
        const rawData = res?.data ?? res;
        if (Array.isArray(rawData)) return rawData;
        if (rawData?.items && Array.isArray(rawData.items)) return rawData.items;
        return [];
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ _id, id }) => ({
                type: "PowerEnquiry" as const,
                id: _id || id,
              })),
              { type: "PowerEnquiry", id: "LIST" },
            ]
          : [{ type: "PowerEnquiry", id: "LIST" }],
    }),
    getPowerEnquiryById: builder.query<PowerEnquiry, string>({
      query: (id) => `power-app/enquiries/${encodeURIComponent(id)}`,
      transformResponse: (res: any) => res?.data ?? res,
      providesTags: (_result, _error, id) => [{ type: "PowerEnquiry", id }],
    }),
  }),
});

export const {
  useGetPowerFacilitiesQuery,
  useLazyGetPowerFacilitiesQuery,
  useGetPowerFacilityByIdQuery,
  useGetPowerEnquiriesQuery,
  useLazyGetPowerEnquiriesQuery,
  useGetPowerEnquiryByIdQuery,
} = powerAppApiSlice;
