import { describe, expect, it, vi } from "vitest";
import { completeMockReport, MockValidationError, validateMockReport } from "../src/mock-gateway";
import type { PendingDraft, Profile } from "../src/types";

const profile: Profile = {
  displayName: "Test Person",
  contactAddress: "Test contact address",
  email: "person@example.test",
  phone: "555-0100",
  contactDisclosure: "Yes",
  publicStuffEmail: "account@example.test",
  publicStuffApiKey: "mock-session-key",
  updatedAt: "2026-08-31T00:00:00.000Z",
};

const draft: PendingDraft = {
  id: "12345678-abcd-4000-8000-123456789abc",
  requestTypeId: 1011942,
  photo: new Blob(["jpeg"], { type: "image/jpeg" }),
  location: {
    latitude: 39,
    longitude: -77,
    accuracyMeters: 10,
    capturedAt: "2026-08-31T00:00:00.000Z",
  },
  violationAddress: "Public violation location",
  description: "",
  capturedAt: "2026-08-31T00:00:00.000Z",
  status: "reviewing",
};

describe("mock report gateway", () => {
  it("requires a photograph, GPS, address, contact profile, and session", () => {
    expect(() => validateMockReport(profile, { ...draft, location: null })).toThrowError(
      new MockValidationError("Capture the sign's GPS location."),
    );
    expect(() => validateMockReport(profile, { ...draft, violationAddress: "" })).toThrowError(
      new MockValidationError("Enter the address or location description of the sign."),
    );
    expect(() =>
      validateMockReport({ ...profile, publicStuffApiKey: "" }, draft),
    ).toThrowError(new MockValidationError("Reconnect PublicStuff."));
  });

  it("returns only a local M1 receipt", async () => {
    vi.useFakeTimers();
    const result = completeMockReport(profile, draft);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ id: "M1-12345678" });
    vi.useRealTimers();
  });
});
