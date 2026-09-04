import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildSubmissionForm,
  extractZipcode,
  parseSubmissionResponse,
  SubmissionError,
  submitReport,
} from "../src/submission";
import type { PendingDraft, Profile } from "../src/types";

const profile: Profile = {
  displayName: "Test Person",
  contactAddress: "123 Contact Ave, Sterling, VA 20165",
  email: "person@example.test",
  phone: "5550100",
  contactDisclosure: "Yes",
  publicStuffEmail: "account@example.test",
  publicStuffApiKey: "test-session-key",
  updatedAt: "2026-09-04T00:00:00.000Z",
};

const draft: PendingDraft = {
  id: "12345678-abcd-4000-8000-123456789abc",
  requestTypeId: 1011942,
  photo: new Blob(["jpeg"], { type: "image/jpeg" }),
  location: {
    latitude: 39.041586050323474,
    longitude: -77.52037490740969,
    accuracyMeters: 12,
    capturedAt: "2026-09-04T00:00:00.000Z",
  },
  violationAddress: "21040 Sycolin Rd, Ashburn, VA 20147, USA",
  description: "",
  capturedAt: "2026-09-04T00:00:00.000Z",
  status: "reviewing",
};

describe("PublicStuff submission payload", () => {
  it("matches the observed multipart field contract", () => {
    const form = buildSubmissionForm(profile, draft);
    expect([...form.keys()]).toEqual([
      "title",
      "description",
      "request_type_id",
      "is_private",
      "latitude",
      "longitude",
      "address",
      "user_address",
      "long_address",
      "zipcode",
      "space_id",
      "client_id",
      "custom_field_6185",
      "custom_field_6186",
      "custom_field_6187",
      "custom_field_6225",
      "custom_field_25876",
      "custom_field_42345",
      "has_image",
      "client_id",
      "device",
      "api_key",
      "uploadedfile",
    ]);
    expect(form.get("title")).toBe(" Neighborhood and property zoning complaints");
    expect(form.get("description")).toBe("undefined");
    expect(form.get("request_type_id")).toBe("1011942");
    expect(form.get("is_private")).toBe("1");
    expect(form.get("latitude")).toBe("39.041586050323474");
    expect(form.get("longitude")).toBe("-77.52037490740969");
    expect(form.get("address")).toBe(draft.violationAddress);
    expect(form.get("user_address")).toBe("undefined");
    expect(form.get("long_address")).toBe(draft.violationAddress);
    expect(form.get("zipcode")).toBe("20147");
    expect(form.get("space_id")).toBe("40448");
    expect(form.getAll("client_id")).toEqual(["1295", "1295"]);
    expect(form.get("custom_field_6185")).toBe(JSON.stringify(profile.displayName));
    expect(form.get("custom_field_6186")).toBe(JSON.stringify(profile.contactAddress));
    expect(form.get("custom_field_6187")).toBe(JSON.stringify(profile.email));
    expect(form.get("custom_field_6225")).toBe(JSON.stringify(profile.phone));
    expect(form.get("custom_field_25876")).toBe('"Illegal signs"');
    expect(form.get("custom_field_42345")).toBe('"Yes"');
    expect(form.get("api_key")).toBe(profile.publicStuffApiKey);
    expect(form.get("uploadedfile")).toBeInstanceOf(File);
  });

  it("extracts US ZIP and ZIP+4 values", () => {
    expect(extractZipcode("Ashburn VA 20147, USA")).toBe("20147");
    expect(extractZipcode("Sterling VA 20165-1234")).toBe("20165-1234");
    expect(extractZipcode("21040 Sycolin Rd, Ashburn, VA 20147, USA")).toBe("20147");
  });
});

describe("PublicStuff submission response", () => {
  const success = JSON.parse(
    readFileSync(new URL("../docs/publicstuff-request-submit-response.json", import.meta.url), "utf8"),
  );

  it("parses the captured success fixture", () => {
    expect(parseSubmissionResponse(success)).toMatchObject({ requestId: "18625627" });
  });

  it("posts FormData without manually setting its content type", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(success), { status: 200 }),
    );
    await expect(submitReport(profile, draft, fetcher)).resolves.toMatchObject({
      requestId: "18625627",
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://vc0.publicstuff.com/api/2.0/request_submit");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it("classifies a lost response as uncertain", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network lost"));
    await expect(submitReport(profile, draft, fetcher)).rejects.toMatchObject({
      kind: "uncertain",
    } satisfies Partial<SubmissionError>);
  });
});
