import { uploadAsync, FileSystemUploadType } from "expo-file-system/legacy";
import { WORK_PLANNER_SERVICE_URL } from "./env";
import { getSession } from "./session";

export async function uploadMobileFile(
  fileInput: string | { uri: string; name?: string; type?: string },
  endpoint: "attachments/upload" | "expenses/upload" = "attachments/upload",
  additionalFields?: Record<string, string>
): Promise<any> {
  const session = getSession();

  let uri = "";
  if (typeof fileInput === "string") {
    uri = fileInput;
  } else if (fileInput && typeof fileInput === "object" && typeof fileInput.uri === "string") {
    uri = fileInput.uri;
  }

  if (!uri) {
    throw new Error("Invalid file URI provided for upload");
  }

  const targetUrl = `${WORK_PLANNER_SERVICE_URL}/api/work-planner/${endpoint}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (session?.token) {
    headers["Authorization"] = `Bearer ${session.token}`;
  }

  const response = await uploadAsync(targetUrl, uri, {
    httpMethod: "POST",
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: "file",
    headers,
    parameters: additionalFields,
  });

  const responseText = response.body;
  let json: any;
  try {
    json = JSON.parse(responseText);
  } catch (_e) {
    throw new Error(`Server returned non-JSON response (${response.status}): ${responseText}`);
  }

  if (response.status < 200 || response.status >= 300 || json.success === false) {
    throw new Error(json.message || json.error || `Upload failed with status ${response.status}`);
  }

  return json.data || json;
}
