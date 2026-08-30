export const PUBLICSTUFF = {
  apiOrigin: "https://vc0.publicstuff.com",
  clientId: 1295,
  requestTypeId: 1011942,
  device: "iframe",
} as const;

export function metadataUrls(): { city: URL; requestTypes: URL } {
  const common = new URLSearchParams({
    client_id: String(PUBLICSTUFF.clientId),
    device: PUBLICSTUFF.device,
  });

  return {
    city: new URL(
      `/api/2.0/city_view?${common.toString()}`,
      PUBLICSTUFF.apiOrigin,
    ),
    requestTypes: new URL(
      `/api/2.0/requesttypes_list?${common.toString()}`,
      PUBLICSTUFF.apiOrigin,
    ),
  };
}
