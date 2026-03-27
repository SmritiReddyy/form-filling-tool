const BASE = "http://localhost:8000";

export interface Field {
  name: string;
  label: string;
  type: string;
  required: boolean;
  rect: [number, number, number, number] | null;
}

export interface FormInfo {
  form_id: string;
  name: string;
}

export interface SessionResponse {
  session_id: string;
  form_name: string;
  fields: Field[];
}

export interface MessageResponse {
  reply: string;
  field_updates: Record<string, string> | null;
  next_field: string | null;
  progress: {
    filled: number;
    total: number;
    required_filled: number;
    required_total: number;
  };
}

export async function listForms(): Promise<FormInfo[]> {
  const res = await fetch(`${BASE}/api/forms`);
  return res.json();
}

export async function createSession(formId: string): Promise<SessionResponse> {
  const res = await fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ form_id: formId }),
  });
  return res.json();
}

export async function sendMessage(payload: {
  session_id: string;
  current_field: string;
  message: string;
  language: string;
  history: { role: string; content: string }[];
}): Promise<MessageResponse> {
  const res = await fetch(`${BASE}/api/assistant/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function exportForm(
  sessionId: string,
  answers: Record<string, string>
): Promise<Blob> {
  const res = await fetch(`${BASE}/api/assistant/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, answers }),
  });
  return res.blob();
}

export function getPdfUrl(formId: string): string {
  return `${BASE}/api/forms/${formId}/pdf`;
}