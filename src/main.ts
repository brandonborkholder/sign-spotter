import "./styles.css";
import { authenticatePublicStuff, AuthenticationError } from "./auth";
import {
  type CameraSession,
  CameraError,
  captureVideoFrame,
  resizePhotoFile,
  startCamera,
} from "./camera";
import { formatCoordinates, getCurrentLocation, locationQuality } from "./location";
import { completeMockReport, MockValidationError } from "./mock-gateway";
import { AppRepository } from "./storage";
import type { CapturedLocation, MockReceipt, PendingDraft, Profile } from "./types";

type Screen = "onboarding" | "capture" | "review" | "settings" | "success";

const BUILD = "m1-capture-1";
const OFFICIAL_FORM =
  "https://iframe.publicstuff.com/#/?client_id=1295&request_type_id=1011942";
const repository = new AppRepository();
const root = requireElement<HTMLElement>("app");
const announcer = requireElement<HTMLElement>("announcer");

let screen: Screen = "onboarding";
let previousScreen: "capture" | "review" = "capture";
let profile: Profile | null = null;
let draft: PendingDraft | null = null;
let receipt: MockReceipt | null = null;
let cameraSession: CameraSession | null = null;
let captureAttempt = 0;
let currentLocation: CapturedLocation | null = null;
let reviewPhotoUrl: string | null = null;
let draftSaveTimer: number | null = null;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
}

function announce(message: string): void {
  announcer.textContent = "";
  window.setTimeout(() => {
    announcer.textContent = message;
  }, 20);
}

function setFeedback(id: string, message: string, kind: "error" | "success" = "error"): void {
  const element = requireElement<HTMLElement>(id);
  element.textContent = message;
  element.className = `feedback feedback-${kind}`;
  if (message) announce(message);
}

function setBusy(button: HTMLButtonElement, busy: boolean, label: string): void {
  button.disabled = busy;
  button.dataset.originalLabel ??= button.textContent ?? "";
  button.textContent = busy ? label : button.dataset.originalLabel;
}

function appHeader(title: string, showSettings = false): string {
  return `
    <header class="app-header">
      <div class="brand-lockup">
        <span class="mini-mark" aria-hidden="true">SV</span>
        <div><p class="eyebrow">Sign Vigilante</p><h1>${title}</h1></div>
      </div>
      ${showSettings ? '<button id="open-settings" class="icon-button" type="button" aria-label="Settings">⚙</button>' : ""}
    </header>
    <div class="test-ribbon"><strong>M1 test mode</strong><span>No complaint will be sent</span></div>
  `;
}

function stopCamera(): void {
  captureAttempt += 1;
  cameraSession?.stop();
  cameraSession = null;
}

function clearReviewPhoto(): void {
  if (reviewPhotoUrl) URL.revokeObjectURL(reviewPhotoUrl);
  reviewPhotoUrl = null;
}

function navigate(next: Screen): void {
  if (screen === "capture" && next !== "capture") stopCamera();
  if (screen === "review" && next !== "review") clearReviewPhoto();
  screen = next;
  render();
}

function bindSettingsButton(from: "capture" | "review"): void {
  requireElement<HTMLButtonElement>("open-settings").addEventListener("click", async () => {
    if (from === "review") await saveReviewFields();
    previousScreen = from;
    navigate("settings");
  });
}

function renderOnboarding(): void {
  root.innerHTML = `
    <main class="page onboarding-page">
      ${appHeader("First-time setup")}
      <section class="intro-panel">
        <p class="kicker">Set up once. Capture quickly later.</p>
        <p>Your contact details and PublicStuff session stay in this browser on this phone. Your password is sent directly to PublicStuff and is never stored.</p>
      </section>
      <form id="setup-form" class="form-card">
        <fieldset>
          <legend>Complaint contact information</legend>
          <label>First and last name<input id="display-name" name="displayName" autocomplete="name" required /></label>
          <label>Complainant address<textarea id="contact-address" name="contactAddress" autocomplete="street-address" rows="2" required></textarea></label>
          <label>Email<input id="contact-email" name="email" type="email" autocomplete="email" required /></label>
          <label>Phone<input id="phone" name="phone" type="tel" autocomplete="tel" required /></label>
          <label>Keep contact information private?
            <select id="contact-disclosure" name="contactDisclosure" required>
              <option value="Yes">Yes — withhold it from records requests</option>
              <option value="No">No — it may be disclosed</option>
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>PublicStuff account</legend>
          <p class="field-help">Loudoun requires an account before this complaint can be submitted.</p>
          <label>Account email<input id="account-email" name="accountEmail" type="email" autocomplete="username" required /></label>
          <label class="inline-check"><input id="same-email" type="checkbox" checked /> Same as contact email</label>
          <label>Password<input id="account-password" name="password" type="password" autocomplete="current-password" required /></label>
          <p class="field-help">The password is discarded immediately after login. Only the returned session key is stored.</p>
        </fieldset>
        <p id="setup-feedback" class="feedback" role="alert"></p>
        <button id="save-setup" class="primary-button" type="submit">Sign in and save setup</button>
        ${import.meta.env.DEV ? '<button id="mock-setup" class="text-button" type="button">Use mock setup locally</button>' : ""}
      </form>
      <a class="official-link" href="${OFFICIAL_FORM}" target="_blank" rel="noreferrer">Open official form to create an account</a>
    </main>
  `;

  const contactEmail = requireElement<HTMLInputElement>("contact-email");
  const accountEmail = requireElement<HTMLInputElement>("account-email");
  const sameEmail = requireElement<HTMLInputElement>("same-email");
  const syncEmail = () => {
    if (sameEmail.checked) accountEmail.value = contactEmail.value;
    accountEmail.readOnly = sameEmail.checked;
  };
  contactEmail.addEventListener("input", syncEmail);
  sameEmail.addEventListener("change", syncEmail);
  syncEmail();

  requireElement<HTMLFormElement>("setup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    if (!form.reportValidity()) return;
    const submit = requireElement<HTMLButtonElement>("save-setup");
    setBusy(submit, true, "Signing in…");
    setFeedback("setup-feedback", "");
    const password = requireElement<HTMLInputElement>("account-password");
    try {
      const session = await authenticatePublicStuff(accountEmail.value.trim(), password.value);
      profile = profileFromSetup(session.apiKey);
      password.value = "";
      await repository.saveProfile(profile);
      announce("Setup saved. Starting camera.");
      navigate("capture");
    } catch (error) {
      password.value = "";
      setFeedback(
        "setup-feedback",
        error instanceof AuthenticationError ? error.message : "Could not save setup.",
      );
    } finally {
      setBusy(submit, false, "");
    }
  });

  const mockButton = document.getElementById("mock-setup");
  mockButton?.addEventListener("click", async () => {
    if (!requireElement<HTMLFormElement>("setup-form").reportValidity()) return;
    profile = profileFromSetup("m1-local-mock-session");
    await repository.saveProfile(profile);
    navigate("capture");
  });
}

function profileFromSetup(apiKey: string): Profile {
  return {
    displayName: requireElement<HTMLInputElement>("display-name").value.trim(),
    contactAddress: requireElement<HTMLTextAreaElement>("contact-address").value.trim(),
    email: requireElement<HTMLInputElement>("contact-email").value.trim(),
    phone: requireElement<HTMLInputElement>("phone").value.trim(),
    contactDisclosure: requireElement<HTMLSelectElement>("contact-disclosure").value as
      | "Yes"
      | "No",
    publicStuffEmail: requireElement<HTMLInputElement>("account-email").value.trim(),
    publicStuffApiKey: apiKey,
    updatedAt: new Date().toISOString(),
  };
}

function renderCapture(): void {
  currentLocation = null;
  root.innerHTML = `
    <main class="capture-page">
      ${appHeader("Capture sign", true)}
      <section class="camera-stage" aria-label="Camera">
        <video id="camera-preview" playsinline muted></video>
        <div class="viewfinder" aria-hidden="true"><span></span></div>
        <div class="camera-message" id="camera-message">Starting rear camera…</div>
        <div class="capture-hud">
          <div id="location-chip" class="hud-chip"><span class="pulse-dot"></span> Finding GPS…</div>
        </div>
        <div class="camera-actions">
          <label class="photo-fallback" for="photo-file">Choose photo</label>
          <input id="photo-file" class="sr-only" type="file" accept="image/*" capture="environment" />
          <button id="shutter" class="shutter" type="button" aria-label="Take photo" disabled><span></span></button>
          <span class="action-spacer" aria-hidden="true"></span>
        </div>
      </section>
    </main>
  `;
  bindSettingsButton("capture");
  void activateCapture();
}

async function activateCapture(): Promise<void> {
  const attempt = ++captureAttempt;
  const video = requireElement<HTMLVideoElement>("camera-preview");
  const shutter = requireElement<HTMLButtonElement>("shutter");
  const cameraMessage = requireElement<HTMLElement>("camera-message");
  const locationChip = requireElement<HTMLElement>("location-chip");

  void getCurrentLocation()
    .then((location) => {
      if (attempt !== captureAttempt) return;
      currentLocation = location;
      locationChip.className = `hud-chip location-${locationQuality(location.accuracyMeters)}`;
      locationChip.textContent = `GPS ±${location.accuracyMeters} m`;
    })
    .catch((error) => {
      if (attempt !== captureAttempt) return;
      locationChip.className = "hud-chip location-error";
      locationChip.textContent = error instanceof Error ? error.message : "GPS unavailable";
    });

  try {
    cameraSession = await startCamera(video);
    if (attempt !== captureAttempt) {
      cameraSession.stop();
      cameraSession = null;
      return;
    }
    cameraMessage.hidden = true;
    shutter.disabled = false;
  } catch (error) {
    cameraMessage.textContent =
      error instanceof CameraError ? error.message : "Camera preview unavailable.";
    cameraMessage.classList.add("camera-error");
  }

  shutter.addEventListener("click", async () => {
    shutter.disabled = true;
    try {
      await storeCapturedPhoto(await captureVideoFrame(video));
    } catch (error) {
      cameraMessage.hidden = false;
      cameraMessage.textContent = error instanceof Error ? error.message : "Photo failed.";
      shutter.disabled = false;
    }
  });

  requireElement<HTMLInputElement>("photo-file").addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    cameraMessage.hidden = false;
    cameraMessage.textContent = "Preparing photograph…";
    try {
      await storeCapturedPhoto(await resizePhotoFile(file));
    } catch (error) {
      cameraMessage.textContent = error instanceof Error ? error.message : "Photo failed.";
    }
  });
}

async function storeCapturedPhoto(photo: Blob): Promise<void> {
  draft = {
    id: crypto.randomUUID(),
    requestTypeId: 1011942,
    photo,
    location: currentLocation,
    violationAddress: "",
    description: "",
    capturedAt: new Date().toISOString(),
    status: "reviewing",
  };
  await repository.saveDraft(draft);
  navigate("review");
}

function renderReview(): void {
  if (!draft || !profile) {
    navigate(profile ? "capture" : "onboarding");
    return;
  }
  reviewPhotoUrl = URL.createObjectURL(draft.photo);
  root.innerHTML = `
    <main class="page review-page">
      ${appHeader("Review report", true)}
      <section class="review-grid">
        <div class="photo-card">
          <img id="photo-preview" alt="Captured sign violation" />
          <button id="retake" class="photo-action" type="button">Retake</button>
        </div>
        <form id="review-form" class="form-card review-form">
          <div id="gps-panel" class="gps-panel"></div>
          <button id="refresh-location" class="secondary-button" type="button">Use current location again</button>
          <label>Address or location of sign<input id="violation-address" autocomplete="street-address" required /></label>
          <label>Optional description<textarea id="description" rows="3" placeholder="Anything else staff should know?"></textarea></label>
          <div class="privacy-note"><strong>Submitted privately</strong><span>Loudoun forces this complaint type to private.</span></div>
          <div class="contact-summary"><strong>Contact</strong><span id="contact-summary"></span></div>
          <p id="review-feedback" class="feedback" role="alert"></p>
          <button id="complete-mock" class="primary-button" type="submit">Finish capture test</button>
          <p class="test-explainer">This M1 button validates and clears the local draft. It does not contact the complaint endpoint.</p>
        </form>
      </section>
    </main>
  `;
  requireElement<HTMLImageElement>("photo-preview").src = reviewPhotoUrl;
  requireElement<HTMLInputElement>("violation-address").value = draft.violationAddress;
  requireElement<HTMLTextAreaElement>("description").value = draft.description;
  requireElement<HTMLElement>("contact-summary").textContent =
    `${profile.displayName} · ${profile.email} · ${profile.contactDisclosure === "Yes" ? "withhold contact info" : "disclosure allowed"}`;
  renderGpsPanel();
  bindSettingsButton("review");

  requireElement<HTMLButtonElement>("retake").addEventListener("click", async () => {
    await repository.deleteDraft();
    draft = null;
    navigate("capture");
  });
  requireElement<HTMLButtonElement>("refresh-location").addEventListener("click", async (event) => {
    await saveReviewFields();
    const button = event.currentTarget as HTMLButtonElement;
    setBusy(button, true, "Finding GPS…");
    setFeedback("review-feedback", "");
    try {
      draft!.location = await getCurrentLocation();
      await repository.saveDraft(draft!);
      renderGpsPanel();
      announce("Location updated.");
    } catch (error) {
      setFeedback(
        "review-feedback",
        error instanceof Error ? error.message : "Could not update location.",
      );
    } finally {
      setBusy(button, false, "");
    }
  });

  for (const id of ["violation-address", "description"]) {
    requireElement<HTMLInputElement | HTMLTextAreaElement>(id).addEventListener("input", () => {
      if (draftSaveTimer !== null) window.clearTimeout(draftSaveTimer);
      draftSaveTimer = window.setTimeout(() => void saveReviewFields(), 250);
    });
  }

  requireElement<HTMLFormElement>("review-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    if (!form.reportValidity()) return;
    await saveReviewFields();
    const button = requireElement<HTMLButtonElement>("complete-mock");
    setBusy(button, true, "Validating locally…");
    setFeedback("review-feedback", "");
    try {
      receipt = await completeMockReport(profile!, draft!);
      await repository.deleteDraft();
      draft = null;
      navigate("success");
    } catch (error) {
      setFeedback(
        "review-feedback",
        error instanceof MockValidationError ? error.message : "Local test failed.",
      );
    } finally {
      setBusy(button, false, "");
    }
  });
}

function renderGpsPanel(): void {
  const panel = requireElement<HTMLElement>("gps-panel");
  if (!draft?.location) {
    panel.className = "gps-panel gps-missing";
    panel.innerHTML = "<strong>GPS missing</strong><span>Retry location before finishing the test.</span>";
    return;
  }
  const quality = locationQuality(draft.location.accuracyMeters);
  panel.className = `gps-panel gps-${quality}`;
  panel.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = formatCoordinates(draft.location);
  const detail = document.createElement("span");
  detail.textContent = `Accuracy ±${draft.location.accuracyMeters} m${quality === "warning" ? " · verify carefully" : ""}`;
  panel.append(strong, detail);
}

async function saveReviewFields(): Promise<void> {
  if (!draft || screen !== "review") return;
  draft.violationAddress = requireElement<HTMLInputElement>("violation-address").value.trim();
  draft.description = requireElement<HTMLTextAreaElement>("description").value.trim();
  await repository.saveDraft(draft);
}

function renderSettings(): void {
  if (!profile) {
    navigate("onboarding");
    return;
  }
  root.innerHTML = `
    <main class="page settings-page">
      ${appHeader("Settings")}
      <form id="profile-form" class="form-card">
        <fieldset>
          <legend>Complaint contact information</legend>
          <label>First and last name<input id="settings-name" autocomplete="name" required /></label>
          <label>Complainant address<textarea id="settings-address" autocomplete="street-address" rows="2" required></textarea></label>
          <label>Email<input id="settings-email" type="email" autocomplete="email" required /></label>
          <label>Phone<input id="settings-phone" type="tel" autocomplete="tel" required /></label>
          <label>Keep contact information private?
            <select id="settings-disclosure"><option value="Yes">Yes</option><option value="No">No</option></select>
          </label>
        </fieldset>
        <button class="primary-button" type="submit">Save contact information</button>
      </form>
      <form id="reconnect-form" class="form-card">
        <fieldset>
          <legend>Reconnect PublicStuff</legend>
          <label>Account email<input id="settings-account-email" type="email" autocomplete="username" required /></label>
          <label>Password<input id="settings-password" type="password" autocomplete="current-password" required /></label>
          <p class="field-help">The password is never stored.</p>
        </fieldset>
        <p id="settings-feedback" class="feedback" role="alert"></p>
        <button id="reconnect" class="secondary-button" type="submit">Sign in again</button>
      </form>
      <section class="settings-actions">
        <a href="${OFFICIAL_FORM}" target="_blank" rel="noreferrer">Open official Loudoun form</a>
        <button id="reset-app" class="danger-button" type="button">Reset all app data</button>
      </section>
      <button id="settings-back" class="text-button" type="button">Back</button>
      <footer class="build-footer">Build ${BUILD}</footer>
    </main>
  `;
  requireElement<HTMLInputElement>("settings-name").value = profile.displayName;
  requireElement<HTMLTextAreaElement>("settings-address").value = profile.contactAddress;
  requireElement<HTMLInputElement>("settings-email").value = profile.email;
  requireElement<HTMLInputElement>("settings-phone").value = profile.phone;
  requireElement<HTMLSelectElement>("settings-disclosure").value = profile.contactDisclosure;
  requireElement<HTMLInputElement>("settings-account-email").value = profile.publicStuffEmail;

  requireElement<HTMLFormElement>("profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(event.currentTarget as HTMLFormElement).reportValidity()) return;
    profile = {
      ...profile!,
      displayName: requireElement<HTMLInputElement>("settings-name").value.trim(),
      contactAddress: requireElement<HTMLTextAreaElement>("settings-address").value.trim(),
      email: requireElement<HTMLInputElement>("settings-email").value.trim(),
      phone: requireElement<HTMLInputElement>("settings-phone").value.trim(),
      contactDisclosure: requireElement<HTMLSelectElement>("settings-disclosure").value as
        | "Yes"
        | "No",
      updatedAt: new Date().toISOString(),
    };
    await repository.saveProfile(profile);
    announce("Contact information saved.");
  });

  requireElement<HTMLFormElement>("reconnect-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(event.currentTarget as HTMLFormElement).reportValidity()) return;
    const button = requireElement<HTMLButtonElement>("reconnect");
    const email = requireElement<HTMLInputElement>("settings-account-email");
    const password = requireElement<HTMLInputElement>("settings-password");
    setBusy(button, true, "Signing in…");
    setFeedback("settings-feedback", "");
    try {
      const session = await authenticatePublicStuff(email.value.trim(), password.value);
      profile = {
        ...profile!,
        publicStuffEmail: email.value.trim(),
        publicStuffApiKey: session.apiKey,
        updatedAt: new Date().toISOString(),
      };
      password.value = "";
      await repository.saveProfile(profile);
      setFeedback("settings-feedback", "PublicStuff reconnected.", "success");
    } catch (error) {
      password.value = "";
      setFeedback(
        "settings-feedback",
        error instanceof AuthenticationError ? error.message : "Could not reconnect.",
      );
    } finally {
      setBusy(button, false, "");
    }
  });

  requireElement<HTMLButtonElement>("settings-back").addEventListener("click", () =>
    navigate(previousScreen),
  );
  requireElement<HTMLButtonElement>("reset-app").addEventListener("click", async () => {
    if (!window.confirm("Delete contact details, session, and pending photograph from this phone?")) {
      return;
    }
    await repository.clearAll();
    if ("caches" in window) {
      await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    }
    profile = null;
    draft = null;
    receipt = null;
    navigate("onboarding");
  });
}

function renderSuccess(): void {
  root.innerHTML = `
    <main class="page success-page">
      ${appHeader("Capture test complete")}
      <section class="success-card">
        <div class="success-icon" aria-hidden="true">✓</div>
        <p class="kicker">Nothing was sent</p>
        <h2>Your capture flow worked.</h2>
        <p>The photograph and pending draft were removed from local storage after mock validation.</p>
        <dl><div><dt>Local test receipt</dt><dd id="receipt-id"></dd></div></dl>
        <button id="capture-another" class="primary-button" type="button">Capture another test</button>
      </section>
    </main>
  `;
  requireElement<HTMLElement>("receipt-id").textContent = receipt?.id ?? "M1-COMPLETE";
  requireElement<HTMLButtonElement>("capture-another").addEventListener("click", () =>
    navigate("capture"),
  );
}

function render(): void {
  switch (screen) {
    case "onboarding":
      renderOnboarding();
      break;
    case "capture":
      renderCapture();
      break;
    case "review":
      renderReview();
      break;
    case "settings":
      renderSettings();
      break;
    case "success":
      renderSuccess();
      break;
  }
}

async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });
  } catch {
    // The app remains usable online if service worker registration fails.
  }
}

async function boot(): Promise<void> {
  try {
    [profile, draft] = await Promise.all([repository.getProfile(), repository.getDraft()]);
    screen = draft ? "review" : profile ? "capture" : "onboarding";
    render();
    void registerServiceWorker();
  } catch (error) {
    root.innerHTML = `
      <main class="fatal-screen"><h1>Local storage unavailable</h1><p id="fatal-message"></p><button onclick="location.reload()">Retry</button></main>
    `;
    requireElement<HTMLElement>("fatal-message").textContent =
      error instanceof Error ? error.message : "Sign Vigilante could not start.";
  }
}

void boot();
