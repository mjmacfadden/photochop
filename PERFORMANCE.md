# Performance Worklog

## Completed

- Demand-driven rendering: the canvas now renders only after invalidation. Marching ants explicitly schedule their next viewport frame.
  - Browser check: zero render calls during 150 ms idle; one render after a legacy `need_render` invalidation.
- Canvas 2D composite cache: committed layer mutations explicitly invalidate the document cache; eligible live transforms reuse the cached layer prefix.
  - Browser check: an eligible interactive layer uses the prefix cache; a committed Canvas 2D update rebuilds the document and preview caches.
- Deferred export encoders: GIF and TIFF encoders load only after their export type is selected.
  - Production build: initial bundle changed from 1,360,127 to 1,350,493 bytes, with 10,541-byte GIF and 2,068-byte TIFF async chunks.
- Histogram analysis: pixel binning now runs in a dedicated worker, preserving main-thread responsiveness on large images.
- Installability and repeat-load behavior: added the PhotoChop manifest and a versioned app-shell service worker. It precaches only the editor shell and first-party static assets, updates them in the background, and excludes user files and external resources.
- Startup delivery: defer editor boot until HTML parsing finishes and omit production source maps from published artifacts.
- Stylesheet delivery: extract CSS from the JavaScript entrypoint into `dist/styles.css`, allowing browser CSS loading and JavaScript parsing to proceed independently.
- Recovery: completed actions queue a debounced, idle-time IndexedDB project snapshot instead of relying only on the 5 MB `localStorage` quick-save limit.

## Next

- Move CPU-heavy pixel analysis and encoding work off the UI thread.
- Defer additional optional feature code after replacing the eager dynamic module registry.
- Consolidate pointer-event routing after behavior work is stable; every tool currently registers and self-gates document-level mouse/touch listeners.
- Review the 16 dependency advisories reported by `npm install` before any version upgrades; they are not changed automatically by this work.