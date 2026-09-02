# Vantage Point

Vantage Point is a client-side browser image editor with strong PSD support via ag-psd.
The GitHub repo and codename is PhotoChop; the public product name is Vantage Point.

Your files stay on your device. Editing runs in the browser.

## Based on miniPaint

This project is a heavily forked descendant of miniPaint by Vilius L. (MIT License).
Upstream: https://github.com/viliusle/miniPaint
Upstream copyright and permission notices for retained miniPaint code must be preserved.

## Features (highlights)

- Multi-layer editing, masks, adjustment layers, and layer groups
- Bidirectional PSD import/export (src/js/libs/psd.js + ag-psd)
- Multi-document tabs, Canvas2D / WebGL rendering paths
- Type tool (point + paragraph text), swatches, common raster export formats

## Privacy

- Pixel data for local files stays in the browser (IndexedDB recovery / localStorage quicksave are device-local).
- Optional third-party APIs (stock search, web fonts) only run if you supply keys locally - see src/js/config.js.
- Do not commit third-party service keys.

## Run locally

Use the package manager to install deps, then build and serve.
- npm run build (production -> dist/bundle.js)
- npm run server
- npm run dev

Open via the dev server, or serve the repo root statically (e.g. Live Server) after a build. The dist/ folder is intentionally committed for now so static hosting works without CI artifacts.

## Docs

- Product / engineering roadmap: docs/VANTAGE_POINT_ROADMAP.md
- Security reporting: SECURITY.md

## Repository

https://github.com/mjmacfadden/photochop

## License

MIT (upstream miniPaint heritage). New product licensing posture may evolve; see the roadmap IP section and consult counsel before changing distribution terms.
