import { describe, expect, it } from "vitest";
import { formatCoordinates, locationQuality } from "../src/location";

describe("location helpers", () => {
  it("formats coordinates without excessive precision", () => {
    expect(
      formatCoordinates({
        latitude: 39.0415860503,
        longitude: -77.5203749074,
        accuracyMeters: 12,
        capturedAt: "2026-08-31T00:00:00.000Z",
      }),
    ).toBe("39.041586, -77.520375");
  });

  it("warns when accuracy is worse than 100 meters", () => {
    expect(locationQuality(100)).toBe("good");
    expect(locationQuality(101)).toBe("warning");
  });
});
