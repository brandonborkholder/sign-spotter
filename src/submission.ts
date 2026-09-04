import { PUBLICSTUFF } from "./config";
import type { PendingDraft, Profile, SubmissionReceipt } from "./types";

const SPACE_ID = "40448";
const REQUEST_TITLE = " Neighborhood and property zoning complaints";

export type SubmissionErrorKind = "validation" | "authentication" | "server" | "uncertain";

export class SubmissionError extends Error {
  constructor(
    message: string,
    readonly kind: SubmissionErrorKind,
  ) {
    super(message);
    this.name = "SubmissionError";
  }
}

function requireReport(profile: Profile, draft: PendingDraft): asserts draft is PendingDraft & {
  location: NonNullable<PendingDraft["location"]>;
} {
  if (!profile.publicStuffApiKey) {
    throw new SubmissionError("Reconnect PublicStuff in Settings before submitting.", "authentication");
  }
  if (!profile.displayName || !profile.contactAddress || !profile.email || !profile.phone) {
    throw new SubmissionError("Complete all contact information in Settings.", "validation");
  }
  if (!draft.photo.size) throw new SubmissionError("Take a photograph first.", "validation");
  if (!draft.location) throw new SubmissionError("Capture the sign's location first.", "validation");
  if (!draft.violationAddress.trim()) {
    throw new SubmissionError("Confirm the sign's address before submitting.", "validation");
  }
}

export function extractZipcode(address: string): string {
  const matches = [...address.matchAll(/\b\d{5}(?:-\d{4})?\b/g)];
  return matches.at(-1)?.[0] ?? "";
}

export function buildSubmissionForm(profile: Profile, draft: PendingDraft): FormData {
  requireReport(profile, draft);
  const form = new FormData();
  const append = (name: string, value: string | number) => form.append(name, String(value));

  append("title", REQUEST_TITLE);
  append("description", draft.description.trim() || "undefined");
  append("request_type_id", PUBLICSTUFF.requestTypeId);
  append("is_private", "1");
  append("latitude", draft.location.latitude);
  append("longitude", draft.location.longitude);
  append("address", draft.violationAddress);
  append("user_address", "undefined");
  append("long_address", draft.violationAddress);
  append("zipcode", extractZipcode(draft.violationAddress));
  append("space_id", SPACE_ID);
  append("client_id", PUBLICSTUFF.clientId);
  append("custom_field_6185", JSON.stringify(profile.displayName));
  append("custom_field_6186", JSON.stringify(profile.contactAddress));
  append("custom_field_6187", JSON.stringify(profile.email));
  append("custom_field_6225", JSON.stringify(profile.phone));
  append("custom_field_25876", JSON.stringify("Illegal signs"));
  append("custom_field_42345", JSON.stringify(profile.contactDisclosure));
  append("has_image", "1");
  append("client_id", PUBLICSTUFF.clientId);
  append("device", PUBLICSTUFF.device);
  append("api_key", profile.publicStuffApiKey);
  form.append("uploadedfile", draft.photo, `sign-spotter-${draft.id}.jpg`);
  return form;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSubmissionResponse(payload: unknown): SubmissionReceipt {
  if (!isObject(payload) || !isObject(payload.response)) {
    throw new SubmissionError(
      "PublicStuff may have received the report, but returned an unreadable response. Check your account before retrying.",
      "uncertain",
    );
  }
  const response = payload.response;
  const status = isObject(response.status) ? response.status : null;
  const success = status?.type === "success" && Number(status.code) === 200;
  const requestId = response.request_id;
  if (!success || (typeof requestId !== "number" && typeof requestId !== "string")) {
    const message = typeof status?.message === "string" ? status.message : "PublicStuff rejected the report.";
    throw new SubmissionError(message, "validation");
  }
  return { requestId: String(requestId), submittedAt: new Date().toISOString(), live: true };
}

export async function submitReport(
  profile: Profile,
  draft: PendingDraft,
  fetcher: typeof fetch = fetch,
): Promise<SubmissionReceipt> {
  const body = buildSubmissionForm(profile, draft);
  let response: Response;
  try {
    response = await fetcher(new URL("/api/2.0/request_submit", PUBLICSTUFF.apiOrigin), {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "PublicStuff-Client": String(PUBLICSTUFF.clientId),
      },
      body,
    });
  } catch {
    throw new SubmissionError(
      "The connection ended without a confirmation. Check your PublicStuff account before retrying to avoid a duplicate.",
      "uncertain",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new SubmissionError("Your PublicStuff session expired. Reconnect in Settings.", "authentication");
  }
  if (!response.ok) {
    throw new SubmissionError(
      response.status >= 500
        ? `PublicStuff is unavailable (HTTP ${response.status}). Try again later.`
        : `PublicStuff rejected the report (HTTP ${response.status}).`,
      response.status >= 500 ? "server" : "validation",
    );
  }
  try {
    return parseSubmissionResponse(await response.json());
  } catch (error) {
    if (error instanceof SubmissionError) throw error;
    throw new SubmissionError(
      "PublicStuff may have received the report, but returned invalid data. Check your account before retrying.",
      "uncertain",
    );
  }
}
