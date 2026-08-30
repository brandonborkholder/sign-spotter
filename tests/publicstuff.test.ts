import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type ProbeReport,
  parseClientMetadata,
  parseRequestTypeSchema,
  redactForExport,
} from "../src/publicstuff";

const fixturePath = fileURLToPath(
  new URL("./fixtures/publicstuff-metadata.synthetic.json", import.meta.url),
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;

describe("parseRequestTypeSchema", () => {
  it("extracts request type 1011942 and its custom fields", () => {
    const schema = parseRequestTypeSchema(fixture);

    expect(schema).toMatchObject({
      id: 1011942,
      name: "Synthetic sign report",
      addressRequirement: "REQUIRED",
      descriptionRequirement: "OPTIONAL",
      allowAnonymous: true,
      forcePrivate: false,
      geoFenceId: 42,
    });
    expect(schema?.customFields).toEqual([
      {
        id: "7001",
        name: "Sign type",
        description: "Choose one",
        type: "singleselect",
        required: true,
        options: [
          { name: "Temporary", description: "Synthetic option" },
          { name: "Permanent", description: null },
        ],
      },
      {
        id: "7002",
        name: "Notes",
        description: null,
        type: "text",
        required: false,
        options: [],
      },
    ]);
  });

  it("returns null when the configured request type is absent", () => {
    expect(parseRequestTypeSchema(fixture, 999)).toBeNull();
  });
});

describe("parseClientMetadata", () => {
  it("normalizes the legacy city response", () => {
    expect(
      parseClientMetadata({
        response: {
          id: 1295,
          client_id: "loudoun",
          space_id: 88,
          name: "Synthetic county",
          app_name: "Synthetic app",
          allow_anonymous: "1",
        },
      }),
    ).toEqual({
      id: 1295,
      clientId: "loudoun",
      spaceId: 88,
      name: "Synthetic county",
      appName: "Synthetic app",
      allowAnonymous: true,
    });
  });
});

describe("redactForExport", () => {
  it("removes sensitive values without erasing schema requirements", () => {
    const report = {
      formatVersion: 1,
      probeVersion: "m0-probe-1",
      startedAt: "2026-08-30T00:00:00.000Z",
      completedAt: "2026-08-30T00:00:01.000Z",
      pageOrigin: "https://example.github.io",
      secureContext: true,
      target: {
        clientId: 1295,
        requestTypeId: 1011942,
        apiOrigin: "https://vc0.publicstuff.com",
      },
      requests: [],
      client: null,
      schema: parseRequestTypeSchema(fixture),
      conclusion: {
        metadataCors: "pass",
        schemaFound: true,
        uploadCors: "not-tested",
        submissionAuth: "anonymous-advertised",
        nextAction: "Continue",
      },
      token: "secret",
      address: "123 Example Street",
    } as ProbeReport & { token: string; address: string };

    const redacted = redactForExport(report) as ProbeReport & {
      token: string;
      address: string;
    };

    expect(redacted.token).toBe("[redacted]");
    expect(redacted.address).toBe("[redacted]");
    expect(redacted.schema?.addressRequirement).toBe("REQUIRED");
  });
});
