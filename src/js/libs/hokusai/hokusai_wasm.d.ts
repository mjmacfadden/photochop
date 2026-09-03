/* tslint:disable */
/* eslint-disable */

export class HokusaiBrush {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Parse a `.myb` JSON document.
     */
    constructor(myb_json: string);
    /**
     * Read the brush's designed radius (its `radius_logarithmic` base
     * value). Useful for UIs that want to offset from the natural size
     * rather than override it outright.
     */
    radiusLog(): number;
    /**
     * Override the HSV base colour (each channel in [0, 1]).
     */
    setColorHsv(h: number, s: number, v: number): void;
    /**
     * Override the base radius (libmypaint's `radius_logarithmic`, log2 px).
     */
    setRadiusLog(log2_radius: number): void;
}

/**
 * A drawable canvas. Holds the tiled surface, an active [`BrushState`],
 * and the RGBA8 output buffer reused across `pixels()` calls.
 */
export class HokusaiCanvas {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Drop all painted tiles and reset stroke state. Cheaper and safer than
     * reconstructing the canvas object on the JS side.
     */
    clear(): void;
    /**
     * Flush `slow_tracking` lag so the stroke's trailing pixels are painted.
     * Call on pointer-up *before* resetting.
     */
    finishStroke(brush: HokusaiBrush): void;
    /**
     * Pointer + length accessors for callers that want to skip the
     * `pixels()` copy entirely: JS can construct
     * `new Uint8Array(memory.buffer, canvas.pixels_ptr(),
     * canvas.pixels_len())` and `ImageData.data.set` directly from
     * wasm memory. Call `flush_pixels()` first to refresh the buffer.
     */
    flush_pixels(): void;
    constructor(width: number, height: number);
    /**
     * Return the canvas as RGBA8 in sRGB, composited over white.
     * JS copies via `ImageData.data.set(canvas.pixels())`. wasm-bindgen
     * can't return a borrowed slice across the JS boundary, so the
     * `Vec<u8>` materialisation is forced; the underlying `flatten` writes
     * in-place into the canvas's own buffer first, so the per-frame cost
     * is one memcpy into the JS Uint8Array.
     */
    pixels(): Uint8Array;
    pixelsLen(): number;
    pixelsPtr(): number;
    /**
     * End the current stroke so the next `strokeTo` starts fresh.
     */
    resetStroke(): void;
    /**
     * Feed one pointer event. `dtime` is seconds since the previous call.
     *
     * `xtilt` / `ytilt` are pen tilt in [-1, 1], matching libmypaint's
     * convention. Pass 0 for devices that don't report tilt.
     */
    strokeTo(brush: HokusaiBrush, x: number, y: number, pressure: number, xtilt: number, ytilt: number, dtime: number): void;
    readonly height: number;
    readonly width: number;
}

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_hokusaibrush_free: (a: number, b: number) => void;
    readonly __wbg_hokusaicanvas_free: (a: number, b: number) => void;
    readonly hokusaibrush_new: (a: number, b: number) => [number, number, number];
    readonly hokusaibrush_radiusLog: (a: number) => number;
    readonly hokusaibrush_setColorHsv: (a: number, b: number, c: number, d: number) => void;
    readonly hokusaibrush_setRadiusLog: (a: number, b: number) => void;
    readonly hokusaicanvas_clear: (a: number) => void;
    readonly hokusaicanvas_finishStroke: (a: number, b: number) => void;
    readonly hokusaicanvas_flush_pixels: (a: number) => void;
    readonly hokusaicanvas_height: (a: number) => number;
    readonly hokusaicanvas_new: (a: number, b: number) => number;
    readonly hokusaicanvas_pixels: (a: number) => [number, number];
    readonly hokusaicanvas_pixelsLen: (a: number) => number;
    readonly hokusaicanvas_pixelsPtr: (a: number) => number;
    readonly hokusaicanvas_resetStroke: (a: number) => void;
    readonly hokusaicanvas_strokeTo: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly hokusaicanvas_width: (a: number) => number;
    readonly start: () => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
