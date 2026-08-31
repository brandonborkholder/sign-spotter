export type ContactDisclosure = "Yes" | "No";

export type Profile = {
  displayName: string;
  contactAddress: string;
  email: string;
  phone: string;
  contactDisclosure: ContactDisclosure;
  publicStuffEmail: string;
  publicStuffApiKey: string;
  updatedAt: string;
};

export type CapturedLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
};

export type PendingDraft = {
  id: string;
  requestTypeId: 1011942;
  photo: Blob;
  location: CapturedLocation | null;
  violationAddress: string;
  description: string;
  capturedAt: string;
  status: "reviewing" | "failed";
};

export type MockReceipt = {
  id: string;
  completedAt: string;
};
