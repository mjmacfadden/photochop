/**
 * PhotoChop / Vantage Point — performance baseline harness (foundation)
 *
 * Run:
 *   node scripts/perf-baseline.mjs
 *   node scripts/perf-baseline.mjs path/to/fixture.psd
 *
 * Limits (important):
 * - Node cannot composite the editor (no DOM, no webpack app graph, no WebGL).
 * - Optional PSD path: times ag-psd readPsd with useCanvas:false (structure parse only).
 * - Full open / Layers.render / brush timings must be taken in Chrome (see below).
 *
 * See docs/perf-spike.md for plan order and scenario IDs.
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const fixture = process.argv[2] ? path.resolve(process.argv[2]) : null;

function hr() {
	console.log('-'.repeat(64));
}

function printChecklist() {
	hr();
	console.log('PhotoChop perf baseline — checklist');
	hr();
	console.log(`Repo root: ${root}`);
	console.log('Plan order: (1) measure 2K/4K (2) PSD memory + lazy ag-psd');
	console.log('            (3) WebGL mask/blend slice (4) interactive quality tier');
	console.log('');
	console.log('Chrome scenarios (Performance + Memory panels):');
	console.log('  S1_boot            cold shell load; confirm psd/ag-psd chunks absent');
	console.log('  S2_open_2k         open ~2K PSD; note [PSD][perf] + heap');
	console.log('  S3_open_4k         open ~4K PSD');
	console.log('  S4_composite_idle  pan/zoom; demand-driven idle');
	console.log('  S5_composite_force __pcPerf.timeRender() x5');
	console.log('  S6_brush           brush stroke latency');
	console.log('  S7_mask_blend      mask / non-normal blend cost');
	console.log('');
	console.log('In-app logs: [PSD][perf] { agPsdLoadMs, parseMs, writeMs, bytes }');
	console.log('SW: bump service-worker.js CACHE_NAME only when APP_SHELL bytes change.');
	console.log('    Docs: docs/perf-spike.md');
}


const BROWSER_HELPER_B64 = 'd2luZG93Ll9fcGNQZXJmID0gd2luZG93Ll9fcGNQZXJmIHx8IHsKICBtYXJrczogW10sCiAgbWFyayhuYW1lKSB7CiAgICBjb25zdCB0ID0gcGVyZm9ybWFuY2Uubm93KCk7CiAgICB0aGlzLm1hcmtzLnB1c2goeyBuYW1lLCB0IH0pOwogICAgY29uc29sZS5sb2coJ1twY1BlcmZdJywgbmFtZSwgTWF0aC5yb3VuZCh0KSArICdtcycpOwogICAgcmV0dXJuIHQ7CiAgfSwKICBzaW5jZShuYW1lLCBzdGFydCkgewogICAgY29uc3QgZHQgPSBwZXJmb3JtYW5jZS5ub3coKSAtIHN0YXJ0OwogICAgY29uc29sZS5sb2coJ1twY1BlcmZdJywgbmFtZSwgTWF0aC5yb3VuZChkdCkgKyAnbXMnKTsKICAgIHJldHVybiBkdDsKICB9LAogIHRpbWVSZW5kZXIoKSB7CiAgICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpOwogICAgaWYgKHdpbmRvdy5MYXllcnMpIHdpbmRvdy5MYXllcnMucmVuZGVyKHRydWUpOwogICAgcmV0dXJuIHRoaXMuc2luY2UoJ0xheWVycy5yZW5kZXIodHJ1ZSknLCB0MCk7CiAgfSwKICBtZW0oKSB7CiAgICBjb25zdCBtID0gcGVyZm9ybWFuY2UubWVtb3J5OwogICAgaWYgKCFtKSB7IGNvbnNvbGUubG9nKCdbcGNQZXJmXSBwZXJmb3JtYW5jZS5tZW1vcnkgdW5hdmFpbGFibGUnKTsgcmV0dXJuIG51bGw7IH0KICAgIGNvbnN0IG1iID0gKG4pID0+IE1hdGgucm91bmQobiAvIDEwNDg1NzYpOwogICAgY29uc3Qgb3V0ID0geyB1c2VkTUI6IG1iKG0udXNlZEpTSGVhcFNpemUpLCB0b3RhbE1COiBtYihtLnRvdGFsSlNIZWFwU2l6ZSksIGxpbWl0TUI6IG1iKG0uanNIZWFwU2l6ZUxpbWl0KSB9OwogICAgY29uc29sZS5sb2coJ1twY1BlcmZdIG1lbW9yeScsIG91dCk7CiAgICByZXR1cm4gb3V0OwogIH0sCn07CmNvbnNvbGUubG9nKCdbcGNQZXJmXSByZWFkeSDigJQgdHJ5IF9fcGNQZXJmLnRpbWVSZW5kZXIoKSBhbmQgX19wY1BlcmYubWVtKCknKTsK';

function printBrowserHelpers() {
	hr();
	console.log('Browser console helpers — paste into DevTools after editor load:');
	hr();
	const helper = Buffer.from(BROWSER_HELPER_B64, 'base64').toString('utf8');
	console.log(helper);
}

async function tryNodePsdParse(filePath) {
	hr();
	console.log('Node ag-psd parse-only:', filePath);
	hr();
	if (!fs.existsSync(filePath)) {
		console.error('File not found:', filePath);
		process.exitCode = 1;
		return;
	}
	const buf = fs.readFileSync(filePath);
	console.log('bytes:', buf.byteLength);
	let agPsd;
	try {
		agPsd = require(path.join(root, 'node_modules', 'ag-psd'));
	} catch (e) {
		console.error("Cannot load ag-psd:", e.message);
		console.error("Install dependencies first.");
		process.exitCode = 1;
		return;
	}

	const t0 = performance.now();
	let psd;
	try {
		psd = agPsd.readPsd(buf, { useCanvas: false, useImageData: false, skipThumbnail: true, skipLayerImageData: true, skipCompositeImageData: true });
	} catch (e) {
		console.error("parse failed:", e.message || e);
		process.exitCode = 1;
		return;
	}
	const t1 = performance.now();
	const children = Array.isArray(psd.children) ? psd.children.length : 0;
	console.log("[PSD][perf][node]", {
		parseMs: Math.round(t1 - t0),
		width: psd.width,
		height: psd.height,
		topLevelChildren: children,
		note: "parse-only; browser open cost is higher",
	});
}

function notePackage() {
	try {
		const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
		console.log("package: " + pkg.name + "@" + pkg.version + "; ag-psd dep: " + ((pkg.dependencies || {})["ag-psd"] || "n/a"));
	} catch (_) {}
}

printChecklist();
notePackage();
printBrowserHelpers();

if (fixture) {
	await tryNodePsdParse(fixture);
} else {
	hr();
	console.log("No fixture path passed — skipped Node PSD parse.");
	console.log("Tip: node scripts/perf-baseline.mjs ./fixtures/perf-2k-layers.psd");
	hr();
}
