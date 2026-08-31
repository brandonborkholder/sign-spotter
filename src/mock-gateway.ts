import type { MockReceipt, PendingDraft, Profile } from "./types";

export class MockValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockValidationError";
  }
}

export function validateMockReport(profile: Profile, draft: PendingDraft): void {
  if (!profile.publicStuffApiKey) throw new MockValidationError("Reconnect PublicStuff.");
  if (!profile.displayName || !profile.contactAddress || !profile.email || !profile.phone) {
    throw new MockValidationError("Complete all contact information in Settings.");
  }
  if (!draft.photo || draft.photo.size === 0) {
    throw new MockValidationError("Take a photograph first.");
  }
  if (!draft.location) throw new MockValidationError("Capture the sign's GPS location.");
  if (!draft.violationAddress.trim()) {
    throw new MockValidationError("Enter the address or location description of the sign.");
  }
}

export async function completeMockReport(
  profile: Profile,
  draft: PendingDraft,
): Promise<MockReceipt> {
  validateMockReport(profile, draft);
  await new Promise((resolve) => setTimeout(resolve, 450));
  return {
    id: `M1-${draft.id.slice(0, 8).toUpperCase()}`,
    completedAt: new Date().toISOString(),
  };
}
