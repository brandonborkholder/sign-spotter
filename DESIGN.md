# Sign Spotter: MVP design

Status: proposed

Date: 2026-08-30

Target: installed PWA on one Android phone, hosted by GitHub Pages

## 1. Goal

Make reporting a Loudoun County sign violation as close as practical to this flow:

1. Launch Sign Spotter from the Android home screen.
2. See the rear camera immediately (after one-time permission/setup).
3. Take one photo; the app immediately obtains the current location.
4. Review the photo, resolved address, and a short optional note.
5. Tap **Submit report** once.
6. See a county request ID or a clear, recoverable failure.

This is a personal, single-user app. Fast iteration and a short path to a working report are more important than general-purpose configuration, multi-user security, or broad browser support.

## 2. Non-goals for the MVP

- A Play Store app, native Android widget, or background Android service.
- iOS or desktop optimization.
- Multiple photos, video, offline submission, background sync, or report history synchronization.
- A general Loudoun County issue reporter or multiple request types.
- Scraping or visually automating the county form.
- Perfect reliability across every PublicStuff change.

The PWA will install as a home-screen app icon. A manifest shortcut named **Report sign** can also be exposed on Android when the icon is long-pressed. A true Android home-screen widget is outside normal PWA capabilities and is unnecessary for the MVP.

## 3. Fixed external identifiers

| Item | Value |
| --- | --- |
| Official form | `https://iframe.publicstuff.com/#/?client_id=1295&request_type_id=1011942` |
| PublicStuff client ID | `1295` |
| Request type ID | `1011942` |
| Observed API host | `https://vc0.publicstuff.com` |
| Observed submit endpoint | `/api/2.0/request_submit` |
| Observed request header | `PublicStuff-Client: 1295` |

These values should live together in one adapter configuration module, not be scattered through UI code.

## 4. What was verified and what remains unknown

### Verified from the currently deployed PublicStuff client

- The official URL is a client-side Angular application.
- Its submission client sends `multipart/form-data` when a photo is present.
- The file field is named `uploadedfile`.
- The submission fields include `title`, `description`, `request_type_id`, location/address values, `space_id`, `client_id`, and request-type-specific `custom_field_<id>` values.
- A successful response is expected to contain `response.status.code === 200` and `response.request_id`.
- PublicStuff identity is handled by registration/login endpoints and an `api_key`; it is not simply a name/email/phone block in the generic request payload.
- Request type `1011942` requires a PublicStuff account. A legitimate submission
  was completed only after account creation and login, and its multipart body
  included the authenticated session's `api_key`.
- PublicStuff's own client accepts JPEG, PNG, GIF, TIFF, BMP, and WebP, but the PWA should produce JPEG only for simplicity.

### Remaining unknowns after M0

- The lifetime and renewal behavior of an authenticated PublicStuff `api_key`.
- Whether the API performs additional anti-abuse checks that are not visible in the JavaScript bundle.

No code should guess custom-field IDs or values. The adapter should load request-type metadata at runtime when possible and fail visibly if the schema no longer matches what was tested.

## 5. Principal browser constraints

### Camera

Camera access requires HTTPS and explicit user permission. GitHub Pages supplies HTTPS. After onboarding and permission are complete, the installed app can call `getUserMedia()` at startup and display a full-screen rear-camera preview. The shutter remains a deliberate user tap.

Fallback: if `getUserMedia()` fails, show a large native file input using `accept="image/*" capture="environment"`. Browsers generally require a user action before opening this picker, so the app cannot guarantee launching the separate Android camera app merely from a home-screen launch.

### Location

Geolocation also requires HTTPS and explicit permission. Start a high-accuracy
location request immediately after the shutter so it does not delay the camera.
The user must see and be able to correct the selected address/location before
submission.

### The county form cannot be auto-filled in an iframe

The PWA's GitHub Pages origin cannot read or manipulate the DOM of `iframe.publicstuff.com` because of the browser same-origin policy. Embedding the official page is useful only as a manual fallback, not as an automation strategy.

### Direct API submission may be blocked by CORS

The observed API uses a custom `PublicStuff-Client` request header, which causes a browser CORS preflight. Direct submission works only if PublicStuff authorizes the GitHub Pages origin and header. This must be tested from the deployed origin, not assumed from `curl` or localhost behavior.

Relevant platform references:

- [Camera access and secure-context requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Still-photo capture with `getUserMedia()`](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Taking_still_photos)
- [Geolocation permissions and HTTPS](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [Cross-origin iframe restrictions](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)
- [CORS and preflight requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- [PWA manifest shortcuts](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Expose_common_actions_as_shortcuts)

## 6. Proposed architecture

```text
Android home-screen icon
          |
          v
GitHub Pages PWA
  camera -> JPEG
  GPS -> coordinates -> address review
  local profile/settings
          |
          v
PublicStuff adapter
          |
          +-- preferred: browser -> PublicStuff API
          |
          +-- fallback: browser -> tiny proxy -> PublicStuff API
          |
          +-- emergency: open official form for manual completion
```

### Front end

Use a small Vite + TypeScript application with no UI framework. A few modules and plain CSS are faster to understand and change than a component framework for this single screen.

Suggested source layout:

```text
src/
  main.ts                 app state and screen transitions
  camera.ts               stream startup, shutter, JPEG resize
  location.ts             geolocation and address model
  profile.ts              local contact/settings storage
  publicstuff.ts           all API and payload knowledge
  submission-queue.ts      retains one unsent draft across reloads
  styles.css
public/
  manifest.webmanifest
  icons/
  offline.html
service-worker.ts
index.html
```

A hand-written service worker is sufficient: cache the app shell on install, use cache-first for versioned static assets, and network-first for navigation. Do not cache API responses, profile data, photographs, or submission responses.

### Submission integration: progressive decision

1. **Use direct browser submission.** M0 verified the metadata requests and the
   upload preflight. This is the smallest system and keeps all personal data
   between the phone and PublicStuff.
2. **If PublicStuff later blocks the Pages origin, add a minimal proxy.** A Cloudflare Worker is a good fit because it can forward a bounded request without operating a server. The GitHub Pages site remains the PWA host. The worker is a second deployable and must accept only the expected request type, content type, size, and fields.
3. **Always keep a manual fallback.** Preserve the photo and details, then open the official form URL. Because the PWA cannot inject values into that page, show copy buttons for the address and description and explain that the photo must be selected again.

Do not put a PublicStuff account password, GitHub token, or reusable secret in frontend code. Obtain and locally retain the PublicStuff API session token after the required one-time login. If a proxy becomes necessary, it should forward that token per request rather than owning the user's password.

## 7. User experience

### First launch: onboarding

The first launch is setup, not camera-first:

1. Explain that the app will store contact details only on this phone and will request camera/location access.
2. Ask for the verified required contact details: first and last name,
   complainant address, email, phone, and contact-disclosure choice.
3. Require a one-time login to the user's existing PublicStuff account. Store
   the returned `api_key` locally, but do not retain the password after login.
4. Save profile/settings locally.
5. Request camera and location permissions in context.
6. Continue directly to capture.

Settings must provide **Edit contact info**, **Reconnect PublicStuff**, **Reset app data**, and a link to the official form.

### Normal launch: capture

1. Render the shell immediately with “Starting camera…”.
2. Start the rear camera with `facingMode: { ideal: "environment" }`.
3. Show the full-screen camera and one large shutter button.
4. On shutter, freeze the image, stop the stream, and start
   `getCurrentPosition()` with high accuracy and a reasonable timeout.

The app should not submit directly from the shutter. A review screen prevents accidental government reports and lets the user catch a bad location.

### Review and submit

Show:

- Photo preview with **Retake**.
- Resolved street address and a small accuracy indicator.
- **Retry location** and an editable address.
- Optional short description, with any verified required custom fields.
- A notice that this request type is forced private by Loudoun County.
- One prominent **Submit report** button.

On submit, disable the button and display progress. Success must show the county request ID and a **Report another** action. Failure must retain the full draft and offer **Retry** plus **Use official form**.

## 8. State model

Use an explicit small state machine to avoid permission and double-submission bugs:

```text
onboarding -> permissions -> capturing -> reviewing -> submitting -> success
                                ^              |
                                |              v
                                +----------- failure
```

Guard rules:

- Only `reviewing` can transition to `submitting`.
- Assign a local draft UUID before submission.
- Ignore repeated submit taps while a request is in flight.
- Never automatically retry a POST after an ambiguous network timeout; ask the user, because the first POST may have succeeded.
- Clear the draft only after a success response containing a request ID.

## 9. Local data

Use IndexedDB for the profile, settings, PublicStuff authentication token, and at most one pending draft. IndexedDB handles image blobs more reliably than `localStorage`. A tiny repository wrapper is enough; no database library is required.

Proposed records:

```ts
type Profile = {
  displayName: string;
  contactAddress: string;
  email: string;
  phone: string;
  publicStuffApiKey: string;
  updatedAt: string;
};

type PendingDraft = {
  id: string;
  requestTypeId: 1011942;
  photo: Blob;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
  address?: string;
  description?: string;
  customFields: Record<string, unknown>;
  status: "reviewing" | "uncertain" | "failed";
};
```

The profile and photo remain readable to anyone who can unlock the phone and use the installed app. That is acceptable for this personal MVP, but the UI should say so. **Reset app data** deletes the IndexedDB database, cached shell, and authentication token.

Do not store contact information or credentials in the Git repository, manifest, build-time variables, analytics, logs, or error-reporting services. Do not add analytics for the MVP.

## 10. Photo and location handling

- Capture from the rear camera into a canvas.
- Correct orientation by using the rendered video frame rather than uploading the camera's original file bytes.
- Resize to a maximum long edge of approximately 1600 px and encode JPEG around 0.82 quality. This should be legible for signs while keeping cellular uploads modest.
- Reject an empty or implausibly tiny image before review.
- Preserve the original coordinates and accuracy even if reverse geocoding fails.
- Prefer PublicStuff's configured geocoder/address validation when available. A separate third-party geocoder should not be introduced until necessary.
- Warn rather than silently submit if location accuracy is worse than the chosen MVP threshold (start with 100 m and tune from field use).

## 11. PublicStuff adapter contract

All undocumented behavior belongs behind one interface:

```ts
interface ReportGateway {
  loadSchema(): Promise<ReportSchema>;
  authenticate?(email: string, password: string): Promise<AuthSession>;
  submit(input: ReportInput): Promise<{ requestId: string }>;
}
```

The adapter is responsible for:

- Supplying client ID `1295`, request type `1011942`, device identifier, and `space_id`.
- Converting coordinates/address into the exact observed field names.
- Encoding every `custom_field_<id>` value in PublicStuff's expected JSON representation.
- Attaching `uploadedfile` and the `has_image` flag.
- Classifying validation, authentication, duplicate/uncertain, CORS/network, and server errors.
- Validating the response shape before declaring success.

Keep a fixture containing a redacted request-type metadata response and a redacted success response. Never commit a real HAR file because it may contain contact information, a session token, precise location, and photo metadata.

## 12. Integration spike before full UI work

This is the first implementation milestone and should take precedence over styling.

1. On the Android phone, open the official form and inspect its network traffic using Chrome remote debugging.
2. Record the metadata for request type `1011942`: schema, custom-field IDs/options, `space_id`, anonymous policy, address requirement, privacy flags, and confirmation text.
3. Observe the submission payload during one legitimate report. Do not create a fake violation merely for testing.
4. Redact sensitive fields and turn the request/response shapes into local test fixtures.
5. From a temporary page deployed at the final GitHub Pages origin, test the metadata GET and a non-mutating CORS/preflight probe.
6. Decide direct API versus proxy and record the result in this document as a short architecture decision.
7. Exercise the actual POST only with a legitimate report and explicit confirmation on the review screen.

The MVP is blocked on the schema and transport decision, not on camera or PWA work. If API submission is prohibited or technically guarded against third-party clients, stop at a capture-and-handoff PWA rather than trying to bypass controls.

## 13. Development and Android test loop

### Local desktop loop

- `npm run dev` for UI and state changes.
- Use browser device emulation plus a fake camera image and fixed coordinates.
- Unit-test payload creation, image sizing, schema parsing, storage, and state transitions.
- Use a mock gateway by default; development must never send a government report accidentally.

### Phone loop before deployment

Camera and geolocation work on a secure origin. Options:

1. Preferred for quick field testing: run the dev server on the workstation, expose it through an HTTPS development tunnel, and open that URL on Android.
2. Lowest setup: push a short-lived branch and deploy a preview/test build. GitHub Pages itself has one production site per repository, so a clearly marked `?mode=test` mock gateway is safer than pointing previews at the live API.

Never allow test mode to submit. Put a persistent **TEST MODE — no reports are sent** banner on it.

### Production deployment

- Build on pushes to the deployment branch with GitHub Actions.
- Upload the static build as a GitHub Pages artifact.
- Configure Vite's base path for `/sign-spotter/` unless a custom domain is added.
- Enforce HTTPS.
- Use hashed assets and a visible build/version string in Settings.
- Install from Android Chrome using **Add to Home screen / Install app**.

GitHub documents the current Pages Actions flow in [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## 14. Testing strategy

### Automated

- Schema parsing detects missing or changed required fields.
- Payload fixture matches the verified PublicStuff encoding.
- Location rejection/warning thresholds behave correctly.
- Image output is JPEG, under the configured dimensions, and nonempty.
- Refresh restores a pending draft.
- Double taps issue one adapter call.
- A timeout becomes `uncertain`, not an automatic retry.
- The service worker serves the app shell offline but never caches API traffic.

### Manual Android acceptance test

- First launch collects and restores contact settings.
- Camera and location permission denial both have recovery instructions.
- Later launches reach a usable camera with minimal delay.
- Rear camera is selected.
- Rotation and returning from the background do not lose the draft.
- Address/location can be corrected.
- Retake replaces the saved blob.
- Airplane mode retains the report and offers retry after reconnecting.
- One legitimate end-to-end submission returns a request ID that can be opened in PublicStuff.
- Updating to the next deployed version does not erase the profile or pending draft.

## 15. Milestones

### M0 — integration proof

- Capture and redact schema/network fixtures.
- Prove direct API CORS or choose the proxy.
- Prove authentication/anonymous behavior.
- Build a script-level payload test without sending a fake report.

Exit: exact payload and transport are known.

### M1 — capture PWA

- Vite/TypeScript shell, manifest, icons, service worker, GitHub Pages workflow.
- Onboarding/profile storage and required one-time PublicStuff login.
- Camera, photo resize, GPS, and review screen.
- Mock gateway and pending-draft recovery.

Implementation status: built in `m1-capture-2`, including editable reverse
geocoding through OpenStreetMap Nominatim; awaiting Android acceptance.

Exit: installable on the phone and usable end to end without transmitting.

### M2 — real submission MVP

- PublicStuff adapter and optional minimal proxy.
- Required custom fields and address validation.
- Explicit submission, progress, error recovery, and request ID success screen.
- One legitimate field report.

Exit: a normal launch-to-confirmed-report flow works on the target phone.

### M3 — iterate from real use

Potential improvements only after the MVP is used:

- Faster startup and cached last-known location.
- Tap-to-focus/zoom controls if the device browser exposes them.
- Address map adjustment.
- Local recent-report list.
- Better uncertain-submission reconciliation.
- A packaged Android app only if PWA launch/camera behavior is materially inadequate.

## 16. MVP acceptance criteria

The MVP is done when all of the following are true on the target Android phone:

- It installs from the published GitHub Pages site and launches standalone from the home screen.
- First-use setup stores the verified required contact/authentication information locally.
- Subsequent launches start a rear-camera preview automatically once permission has already been granted, or present a single obvious tap if Android requires it.
- It captures and resizes one readable photo.
- It obtains a location, shows the address/accuracy, and permits correction.
- It survives a reload without losing the pending report.
- It never submits before the explicit review-screen confirmation.
- It sends the exact verified request type and custom fields.
- Success shows a real PublicStuff request ID.
- Failures preserve the draft and provide retry and official-form fallback actions.

## 17. Architecture decision

```text
Decision date: 2026-08-31
Pages origin tested: https://brandonborkholder.github.io
PublicStuff metadata CORS result: pass (both GETs returned HTTP 200)
PublicStuff upload preflight result: pass (HTTP 200, ACAO *, POST and PublicStuff-Client allowed)
Request type anonymous flag: false
Authentication mechanism: required PublicStuff account login; returned api_key is sent in multipart
Chosen path: direct browser-to-PublicStuff API, with official form fallback
Evidence:
  - docs/publicstuff-request-submit-redacted.txt
  - docs/publicstuff-request-submit-response.json
Notes: M1 must implement one-time login, retain the returned api_key locally, and never store the password.
```
