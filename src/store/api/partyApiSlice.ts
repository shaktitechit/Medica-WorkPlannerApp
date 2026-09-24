import { baseApi } from "./baseApi";
import { PARTY_SERVICE_URL } from "@/lib/env";
import type { PartyListParams, PartyListResponse, PartyRecord } from "@/types/party";

export const partyApiSlice = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getParties: builder.query<PartyRecord[], PartyListParams | void>({
      query: (params) => {
        const query = new URLSearchParams();
        if (params) {
          Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== "") query.append(k, String(v));
          });
        }
        const qStr = query.toString();
        const path = qStr ? `parties?${qStr}` : "parties";
        if (PARTY_SERVICE_URL && /^https?:\/\//i.test(PARTY_SERVICE_URL)) {
          return `${PARTY_SERVICE_URL.replace(/\/$/, "")}/api/${path}`;
        }
        return path;
      },
      transformResponse: (res: any) => {
        const rawData = res?.data ?? res;
        if (Array.isArray(rawData)) return rawData;
        if (rawData?.items && Array.isArray(rawData.items)) return rawData.items;
        if (rawData?.data && Array.isArray(rawData.data)) return rawData.data;
        return [];
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ _id, id }) => ({ type: "Party" as const, id: _id || id })),
              { type: "Party", id: "LIST" },
            ]
          : [{ type: "Party", id: "LIST" }],
    }),
    getPartyById: builder.query<PartyRecord, string>({
      query: (id) => {
        if (PARTY_SERVICE_URL && /^https?:\/\//i.test(PARTY_SERVICE_URL)) {
          return `${PARTY_SERVICE_URL.replace(/\/$/, "")}/api/parties/${id}`;
        }
        return `parties/${id}`;
      },
      transformResponse: (res: any) => res?.data ?? res,
      providesTags: (_result, _error, id) => [{ type: "Party", id }],
    }),
  }),
});

export const { useGetPartiesQuery, useGetPartyByIdQuery, useLazyGetPartyByIdQuery } = partyApiSlice;
