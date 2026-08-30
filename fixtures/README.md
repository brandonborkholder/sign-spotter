# Captured PublicStuff fixtures

This directory is reserved for normalized, redacted evidence exported by the
M0 browser probe.

Expected first file:

```text
publicstuff-m0-1011942-redacted.json
```

Before committing a fixture:

1. Generate it with the probe's **Download JSON** action.
2. Inspect it manually.
3. Confirm it contains no name, username, email, phone number, street address,
   coordinates, photo/file data, authorization value, API key, or session token.
4. Never commit a raw Chrome HAR export. A HAR can contain credentials, precise
   location, contact details, and uploaded image data.

The fixture under `tests/fixtures/` is deliberately synthetic and must not be
treated as Loudoun County's real request schema.
