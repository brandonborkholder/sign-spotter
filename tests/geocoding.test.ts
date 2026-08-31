import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildReverseGeocodingUrl,
  parseReverseGeocodingResponse,
  reverseGeocode,
  ReverseGeocodingError,
} from "../src/geocoding";

const location = {
  latitude: 39.041586,
  longitude: -77.520375,
  accuracyMeters: 12,
  capturedAt: "2026-08-31T00:00:00.000Z",
};

beforeEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language: "en-US" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setTimeout, clearTimeout },
  });
});

describe("reverse geocoding", () => {
  it("builds an address-only Nominatim request", () => {
    const url = buildReverseGeocodingUrl(location);
    expect(url.origin).toBe("https://nominatim.openstreetmap.org");
    expect(url.pathname).toBe("/reverse");
    expect(url.searchParams.get("lat")).toBe("39.041586");
    expect(url.searchParams.get("lon")).toBe("-77.520375");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("layer")).toBe("address");
  });

  it("returns a trimmed display address", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ display_name: "  21040 Sycolin Rd, Ashburn, VA 20147  " })),
    );
    await expect(reverseGeocode(location, fetcher as typeof fetch)).resolves.toBe(
      "21040 Sycolin Rd, Ashburn, VA 20147",
    );
  });

  it("rejects responses without an address", () => {
    expect(() => parseReverseGeocodingResponse({ error: "Unable to geocode" })).toThrowError(
      new ReverseGeocodingError("Unable to geocode"),
    );
  });
});
