# Sign Vigilante

Android-first PWA for quickly capturing Loudoun County sign violations.

Current milestone: **M1 capture PWA**. It supports first-use contact setup,
PublicStuff login, rear-camera capture, GPS, local draft recovery, and a review
flow. The M1 build deliberately cannot submit a complaint.

- [MVP design](DESIGN.md)
- [M0 integration evidence](docs/M0.md)
- [M1 Android acceptance test](docs/M1.md)

## Development

```sh
npm install
npm run dev
npm test
npm run build
```

The production build runs a safety assertion that fails if the PublicStuff
complaint submission endpoint appears in `dist`.
