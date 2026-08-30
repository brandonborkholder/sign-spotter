import "./styles.css";
import { PUBLICSTUFF } from "./config";
import {
  type ProbeReport,
  type ReportSchema,
  redactForExport,
  runProbe,
} from "./publicstuff";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
}

const origin = requireElement<HTMLElement>("page-origin");
const runButton = requireElement<HTMLButtonElement>("run-probe");
const overallStatus = requireElement<HTMLElement>("overall-status");
const requestResults = requireElement<HTMLElement>("request-results");
const schemaSection = requireElement<HTMLElement>("schema-section");
const schemaStatus = requireElement<HTMLElement>("schema-status");
const schemaSummary = requireElement<HTMLElement>("schema-summary");
const exportSection = requireElement<HTMLElement>("export-section");
const downloadButton = requireElement<HTMLButtonElement>("download-result");
const copyButton = requireElement<HTMLButtonElement>("copy-result");
const exportFeedback = requireElement<HTMLElement>("export-feedback");

origin.textContent = window.location.origin;
let lastReport: ProbeReport | null = null;

function setStatus(
  element: HTMLElement,
  text: string,
  kind: "idle" | "running" | "pass" | "warn" | "fail",
): void {
  element.textContent = text;
  element.className = `status status-${kind}`;
}

function textElement(tag: string, text: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function renderRequests(report: ProbeReport): void {
  requestResults.replaceChildren();
  for (const result of report.requests) {
    const row = document.createElement("article");
    row.className = `request-result request-${result.outcome}`;
    const heading = document.createElement("div");
    heading.className = "request-heading";
    heading.append(
      textElement("strong", result.name === "city" ? "Client metadata" : "Request types"),
      textElement(
        "span",
        result.outcome === "success" ? "Readable" : "Blocked",
        "result-label",
      ),
    );
    row.append(
      heading,
      textElement("code", `GET ${result.endpoint}`),
      textElement("p", `${result.message} (${result.durationMs} ms)`),
    );
    requestResults.append(row);
  }
}

function valueRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement("div");
  row.append(textElement("dt", label), textElement("dd", value));
  return row;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function renderSchema(schema: ReportSchema | null): void {
  schemaSection.hidden = false;
  schemaSummary.replaceChildren();
  if (!schema) {
    setStatus(schemaStatus, "Not found", "fail");
    schemaSummary.append(
      textElement(
        "p",
        `The response did not contain request type ${PUBLICSTUFF.requestTypeId} in the expected shape.`,
      ),
    );
    return;
  }

  setStatus(schemaStatus, "Found", "pass");
  const facts = document.createElement("dl");
  facts.className = "facts schema-facts";
  facts.append(
    valueRow("Name", schema.name),
    valueRow("Address", displayValue(schema.addressRequirement)),
    valueRow("Description", displayValue(schema.descriptionRequirement)),
    valueRow("Anonymous", displayValue(schema.allowAnonymous)),
    valueRow("Force private", displayValue(schema.forcePrivate)),
    valueRow("Geofence", displayValue(schema.geoFenceId)),
  );
  schemaSummary.append(facts);

  const heading = textElement("h3", `Custom fields (${schema.customFields.length})`);
  schemaSummary.append(heading);
  if (schema.customFields.length === 0) {
    schemaSummary.append(textElement("p", "No custom fields were advertised."));
    return;
  }

  const list = document.createElement("ul");
  list.className = "field-list";
  for (const field of schema.customFields) {
    const optionText = field.options.length
      ? ` Options: ${field.options.map(({ name }) => name).join(", ")}.`
      : "";
    const item = document.createElement("li");
    item.append(
      textElement("strong", field.name),
      textElement(
        "span",
        ` — ${field.type}; ${field.required ? "required" : "optional"}; ID ${field.id}.${optionText}`,
      ),
    );
    list.append(item);
  }
  schemaSummary.append(list);
}

function exportJson(): string {
  if (!lastReport) throw new Error("Run the probe before exporting.");
  return `${JSON.stringify(redactForExport(lastReport), null, 2)}\n`;
}

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  exportSection.hidden = true;
  schemaSection.hidden = true;
  requestResults.replaceChildren(textElement("p", "Contacting PublicStuff metadata endpoints…"));
  setStatus(overallStatus, "Running", "running");
  try {
    lastReport = await runProbe();
    renderRequests(lastReport);
    renderSchema(lastReport.schema);
    exportSection.hidden = false;
    const kind =
      lastReport.conclusion.metadataCors === "pass"
        ? lastReport.schema
          ? "pass"
          : "warn"
        : lastReport.conclusion.metadataCors === "incomplete"
          ? "warn"
          : "fail";
    setStatus(
      overallStatus,
      lastReport.conclusion.metadataCors === "pass"
        ? "Metadata readable"
        : lastReport.conclusion.metadataCors === "incomplete"
          ? "Partly readable"
          : "Blocked",
      kind,
    );
  } catch (error) {
    setStatus(overallStatus, "Probe error", "fail");
    requestResults.replaceChildren(
      textElement("p", error instanceof Error ? error.message : "Unexpected probe error."),
    );
  } finally {
    runButton.disabled = false;
  }
});

downloadButton.addEventListener("click", () => {
  const blob = new Blob([exportJson()], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `publicstuff-m0-${PUBLICSTUFF.requestTypeId}-redacted.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  exportFeedback.textContent = "Downloaded redacted probe result.";
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(exportJson());
    exportFeedback.textContent = "Copied redacted probe result.";
  } catch {
    exportFeedback.textContent = "Clipboard access failed; use Download JSON instead.";
  }
});
