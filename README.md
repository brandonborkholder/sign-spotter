# Sign Spotter

Android-first PWA for quickly capturing Loudoun County sign violations.

Current milestone: **M2 real submission MVP**. It supports first-use contact
setup, PublicStuff login, rear-camera capture, GPS, local draft recovery, and an
explicit authenticated submission to Loudoun County through PublicStuff.

- [MVP design](DESIGN.md)
- [M0 integration evidence](docs/M0.md)
- [M1 Android acceptance test](docs/M1.md)
- [M2 live-submission acceptance test](docs/M2.md)

## Development

```sh
npm install
npm run dev
npm test
npm run build
```

Local development never sends complaints. The production build verifies that
the real PublicStuff submission adapter is present in the deployed artifact.
