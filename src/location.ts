import type { CapturedLocation } from "./types";

export class LocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationError";
  }
}

export function getCurrentLocation(): Promise<CapturedLocation> {
  if (!("geolocation" in navigator)) {
    return Promise.reject(new LocationError("This browser does not provide location access."));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => {
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: Math.round(coords.accuracy),
          capturedAt: new Date(timestamp).toISOString(),
        });
      },
      (error) => {
        const messages: Record<number, string> = {
          1: "Location permission was denied. Allow it in Chrome site settings and retry.",
          2: "Your location is currently unavailable. Move outdoors or retry.",
          3: "Location took too long. Retry when the phone has a clearer GPS signal.",
        };
        reject(new LocationError(messages[error.code] ?? "Could not determine location."));
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 30_000,
      },
    );
  });
}

export function formatCoordinates(location: CapturedLocation): string {
  return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}

export function locationQuality(accuracyMeters: number): "good" | "warning" {
  return accuracyMeters <= 100 ? "good" : "warning";
}
