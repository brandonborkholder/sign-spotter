import { PUBLICSTUFF, metadataUrls } from "./config";

type JsonObject = Record<string, unknown>;

export type CustomFieldSchema = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  required: boolean;
  options: Array<{ name: string; description: string | null }>;
};

export type ReportSchema = {
  id: number;
  name: string;
  description: string | null;
  confirmation: string | null;
  addressRequirement: string | null;
  descriptionRequirement: string | null;
  allowAnonymous: boolean | null;
  forcePrivate: boolean | null;
  allowResidentsToMarkPrivate: boolean | null;
  geoFenceId: string | number | null;
  geocoder: unknown;
  customFields: CustomFieldSchema[];
};

export type ClientMetadata = {
  id: string | number | null;
  clientId: string | number | null;
  spaceId: string | number | null;
  name: string | null;
  appName: string | null;
  allowAnonymous: boolean | null;
};

export type RequestDiagnostic = {
  name: "city" | "requestTypes";
  method: "GET";
  endpoint: string;
  outcome: "success" | "http-error" | "network-or-cors-error" | "invalid-json";
  status: number | null;
  contentType: string | null;
  durationMs: number;
  message: string;
};

export type ProbeReport = {
  formatVersion: 1;
  probeVersion: "m0-probe-1";
  startedAt: string;
  completedAt: string;
  pageOrigin: string;
  secureContext: boolean;
  target: {
    clientId: number;
    requestTypeId: number;
    apiOrigin: string;
  };
  requests: RequestDiagnostic[];
  client: ClientMetadata | null;
  schema: ReportSchema | null;
  conclusion: {
    metadataCors: "pass" | "fail" | "incomplete";
    schemaFound: boolean;
    uploadCors: "not-tested";
    submissionAuth: "unknown" | "anonymous-advertised" | "account-required-advertised";
    nextAction: string;
  };
};

type FetchResult = {
  diagnostic: RequestDiagnostic;
  payload: unknown | null;
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

function scalar(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function unwrapNamed(value: unknown, key: string): JsonObject | null {
  if (!isObject(value)) return null;
  const nested = value[key];
  return isObject(nested) ? nested : value;
}

function responseBody(payload: unknown): JsonObject | null {
  if (!isObject(payload)) return null;
  return isObject(payload.response) ? payload.response : payload;
}

function findObject(
  value: unknown,
  predicate: (candidate: JsonObject) => boolean,
  seen = new Set<object>(),
): JsonObject | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findObject(item, predicate, seen);
      if (match) return match;
    }
    return null;
  }

  if (!isObject(value) || seen.has(value)) return null;
  seen.add(value);
  if (predicate(value)) return value;

  for (const child of Object.values(value)) {
    const match = findObject(child, predicate, seen);
    if (match) return match;
  }
  return null;
}

export function parseRequestTypeSchema(
  payload: unknown,
  requestTypeId: number = PUBLICSTUFF.requestTypeId,
): ReportSchema | null {
  const wrapped = findObject(payload, (candidate) => {
    const unwrapped = unwrapNamed(candidate, "request_type");
    if (!unwrapped || String(unwrapped.id) !== String(requestTypeId)) return false;
    return (
      "custom_fields" in unwrapped ||
      "address_requirement" in unwrapped ||
      "description_requirement" in unwrapped
    );
  });
  const source = wrapped ? unwrapNamed(wrapped, "request_type") : null;
  if (!source) return null;

  const rawFields = Array.isArray(source.custom_fields) ? source.custom_fields : [];
  const customFields = rawFields.flatMap((item): CustomFieldSchema[] => {
    const field = unwrapNamed(item, "custom_field");
    if (!field) return [];
    const rawOptions = Array.isArray(field.options) ? field.options : [];
    return [
      {
        id: String(field.id ?? field.custom_field_id ?? ""),
        name: nullableString(field.name) ?? "Unnamed field",
        description: nullableString(field.description),
        type: nullableString(field.type) ?? "unknown",
        required: nullableBoolean(field.required) === true,
        options: rawOptions.flatMap((rawOption) => {
          const option = unwrapNamed(rawOption, "option");
          if (!option) return [];
          const name = nullableString(option.name);
          return name
            ? [{ name, description: nullableString(option.description) }]
            : [];
        }),
      },
    ];
  });

  return {
    id: requestTypeId,
    name: nullableString(source.name) ?? `Request type ${requestTypeId}`,
    description: nullableString(source.description),
    confirmation: nullableString(source.confirmation),
    addressRequirement: nullableString(source.address_requirement),
    descriptionRequirement: nullableString(source.description_requirement),
    allowAnonymous: nullableBoolean(source.allow_anonymous),
    forcePrivate: nullableBoolean(source.force_private),
    allowResidentsToMarkPrivate: nullableBoolean(
      source.allow_residents_to_mark_private,
    ),
    geoFenceId: scalar(source.geo_fence_id),
    geocoder: source.geocoder ?? null,
    customFields,
  };
}

export function parseClientMetadata(payload: unknown): ClientMetadata | null {
  const body = responseBody(payload);
  if (!body) return null;
  const source = unwrapNamed(body, "client") ?? body;
  if (!("space_id" in source) && !("client_id" in source) && !("app_name" in source)) {
    return null;
  }
  return {
    id: scalar(source.id),
    clientId: scalar(source.client_id),
    spaceId: scalar(source.space_id),
    name: nullableString(source.name),
    appName: nullableString(source.app_name),
    allowAnonymous: nullableBoolean(source.allow_anonymous),
  };
}

async function fetchMetadata(
  name: RequestDiagnostic["name"],
  url: URL,
  fetcher: typeof fetch,
): Promise<FetchResult> {
  const started = performance.now();
  const endpoint = url.pathname;
  try {
    const response = await fetcher(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "PublicStuff-Client": String(PUBLICSTUFF.clientId),
      },
    });
    const durationMs = Math.round(performance.now() - started);
    const base = {
      name,
      method: "GET" as const,
      endpoint,
      status: response.status,
      contentType: response.headers.get("content-type"),
      durationMs,
    };
    if (!response.ok) {
      return {
        diagnostic: {
          ...base,
          outcome: "http-error",
          message: `PublicStuff returned HTTP ${response.status}.`,
        },
        payload: null,
      };
    }

    try {
      return {
        diagnostic: {
          ...base,
          outcome: "success",
          message: "Browser received a readable JSON response.",
        },
        payload: await response.json(),
      };
    } catch {
      return {
        diagnostic: {
          ...base,
          outcome: "invalid-json",
          message: "The response was successful but was not valid JSON.",
        },
        payload: null,
      };
    }
  } catch (error) {
    return {
      diagnostic: {
        name,
        method: "GET",
        endpoint,
        outcome: "network-or-cors-error",
        status: null,
        contentType: null,
        durationMs: Math.round(performance.now() - started),
        message:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : "The browser blocked or could not reach the request.",
      },
      payload: null,
    };
  }
}

export async function runProbe(fetcher: typeof fetch = fetch): Promise<ProbeReport> {
  const startedAt = new Date().toISOString();
  const urls = metadataUrls();
  const [cityResult, typesResult] = await Promise.all([
    fetchMetadata("city", urls.city, fetcher),
    fetchMetadata("requestTypes", urls.requestTypes, fetcher),
  ]);
  const client = parseClientMetadata(cityResult.payload);
  const schema = parseRequestTypeSchema(typesResult.payload);
  const successfulRequests = [cityResult, typesResult].filter(
    ({ diagnostic }) => diagnostic.outcome === "success",
  ).length;
  const metadataCors =
    successfulRequests === 2 ? "pass" : successfulRequests === 0 ? "fail" : "incomplete";

  let submissionAuth: ProbeReport["conclusion"]["submissionAuth"] = "unknown";
  if (schema?.allowAnonymous === true) submissionAuth = "anonymous-advertised";
  if (schema?.allowAnonymous === false) submissionAuth = "account-required-advertised";

  let nextAction = "Inspect the browser Network panel and save the redacted diagnostics.";
  if (metadataCors === "pass" && schema) {
    nextAction =
      "Metadata is readable. Review the schema, then observe one legitimate submission before enabling POST code.";
  } else if (metadataCors === "fail") {
    nextAction =
      "Confirm the failures in Android Chrome DevTools; if CORS is the cause, use the bounded proxy path.";
  } else if (!schema) {
    nextAction =
      "Metadata was only partly readable or the response shape changed. Inspect a redacted request-types response.";
  }

  return {
    formatVersion: 1,
    probeVersion: "m0-probe-1",
    startedAt,
    completedAt: new Date().toISOString(),
    pageOrigin: window.location.origin,
    secureContext: window.isSecureContext,
    target: {
      clientId: PUBLICSTUFF.clientId,
      requestTypeId: PUBLICSTUFF.requestTypeId,
      apiOrigin: PUBLICSTUFF.apiOrigin,
    },
    requests: [cityResult.diagnostic, typesResult.diagnostic],
    client,
    schema,
    conclusion: {
      metadataCors,
      schemaFound: schema !== null,
      uploadCors: "not-tested",
      submissionAuth,
      nextAction,
    },
  };
}

const SENSITIVE_KEY = /^(?:api_?key|authorization|password|session_?token|token|email|phone|username|first_?name|last_?name|display_?name|address|user_?address|long_?address|latitude|longitude|lat|lon|photo|image|file|uploadedfile)$/i;

export function redactForExport(report: ProbeReport): ProbeReport {
  const clone = structuredClone(report) as unknown as JsonObject;

  function redact(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(redact);
      return;
    }
    if (!isObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        value[key] = "[redacted]";
      } else {
        redact(child);
      }
    }
  }

  redact(clone);
  return clone as unknown as ProbeReport;
}
