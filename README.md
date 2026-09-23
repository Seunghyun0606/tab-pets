# Tab Pets

Tab Pets is a Chrome Manifest V3 extension prototype. The current runtime foundation provides a Service Worker, Content Script, and Side Panel entry point without implementing product behavior yet.

## Requirements

- Node.js 22.12 or newer
- npm 11 or newer
- Chrome 114 or newer

## Setup and verification

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm test
```

The production extension is written to `dist/`.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this repository's `dist/` directory.
4. Open an HTTP or HTTPS page and confirm that the extension has no runtime errors.
5. Select the Tab Pets toolbar action and confirm that the Side Panel shows the runtime placeholder.

The Content Script intentionally does not add visible page UI in TASK-001. Pet rendering starts in TASK-004.
