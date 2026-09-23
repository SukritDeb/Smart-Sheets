import type { CleanResponse, UploadResponse } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function readError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload === "object" && payload !== null && "detail" in payload) {
      const detail = payload.detail;
      return typeof detail === "string" ? detail : JSON.stringify(detail);
    }
  } catch {
    // The API may return an empty or non-JSON response for network failures.
  }
  return `Request failed with status ${response.status}`;
}

export async function uploadCsv(file: File): Promise<UploadResponse> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${API_URL}/api/upload`, { method: "POST", body });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as UploadResponse;
}

export async function cleanDataset(taskId: string, userPrompt: string): Promise<CleanResponse> {
  const response = await fetch(`${API_URL}/api/clean`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: taskId, user_prompt: userPrompt })
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as CleanResponse;
}

export function downloadUrl(taskId: string): string {
  return `${API_URL}/api/download/${encodeURIComponent(taskId)}`;
}
