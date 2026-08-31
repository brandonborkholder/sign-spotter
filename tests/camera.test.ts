import { describe, expect, it, vi } from "vitest";
import { applyPreferredZoom, CameraError, calculateContainSize, calculateZoomCrop } from "../src/camera";

describe("calculateContainSize", () => {
  it("keeps a smaller image at its original dimensions", () => {
    expect(calculateContainSize(1200, 900)).toEqual({ width: 1200, height: 900 });
  });

  it("reduces landscape and portrait photos to a 1600px long edge", () => {
    expect(calculateContainSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(calculateContainSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it("rejects invalid camera dimensions", () => {
    expect(() => calculateContainSize(0, 100)).toThrowError(CameraError);
  });
});

describe("calculateZoomCrop", () => {
  it("centers a two-times crop", () => {
    expect(calculateZoomCrop(4000, 3000, 2)).toEqual({
      x: 1000,
      y: 750,
      width: 2000,
      height: 1500,
    });
  });
});

describe("applyPreferredZoom", () => {
  it("requests exact two-times hardware zoom when supported", async () => {
    const applyConstraints = vi.fn(async () => undefined);
    const track = {
      getCapabilities: () => ({ zoom: { min: 1, max: 8, step: 0.1 } }),
      applyConstraints,
    } as unknown as MediaStreamTrack;
    await expect(applyPreferredZoom(track)).resolves.toBe(true);
    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }] });
  });

  it("uses the digital fallback when hardware cannot reach two-times zoom", async () => {
    const track = {
      getCapabilities: () => ({ zoom: { min: 1, max: 1.5, step: 0.1 } }),
      applyConstraints: vi.fn(),
    } as unknown as MediaStreamTrack;
    await expect(applyPreferredZoom(track)).resolves.toBe(false);
  });
});
