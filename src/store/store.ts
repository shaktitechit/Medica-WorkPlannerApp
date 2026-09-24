import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { baseApi } from "./api/baseApi";
import "./api/authApiSlice";
import "./api/companyApiSlice";
import "./api/workPlannerApiSlice";
import "./api/partyApiSlice";
import "./api/leadsApiSlice";
import "./api/notificationsApiSlice";

const rootReducer = combineReducers({
  [baseApi.reducerPath]: baseApi.reducer,
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
