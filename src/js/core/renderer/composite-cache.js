/*
 * CPU-side cache for the Canvas 2D compositor.
 *
 * These canvases always live in document coordinates. Keeping zoom/pan out
 * of this cache means viewport-only changes repaint a bitmap instead of
 * replaying the document layer stack.
 */
class Composite_cache_class {
	constructor() {
		this.documentCanvas = null;
		this.prefixCanvas = null;
		this.width = 0;
		this.height = 0;
		this.documentDirty = true;
		this.previewDirty = true;
		this.detailsDirty = true;
		this.rulerDirty = true;
		this.explicitRequest = false;
		this.activeLayerId = null;
		this.pendingInteractiveLayerId = null;
	}

	ensure_size(width, height) {
		if (this.width === width && this.height === height && this.documentCanvas)
			return;

		this.width = width;
		this.height = height;
		this.documentCanvas = document.createElement('canvas');
		this.prefixCanvas = document.createElement('canvas');
		this.documentCanvas.width = width;
		this.documentCanvas.height = height;
		this.prefixCanvas.width = width;
		this.prefixCanvas.height = height;
		this.invalidate_document();
	}

	invalidate_document() {
		this.documentDirty = true;
		this.previewDirty = true;
		this.activeLayerId = null;
	}

	mark_interactive(layerId) {
		this.activeLayerId = layerId;
		this.documentDirty = false;
		this.previewDirty = true;
	}
}

export default Composite_cache_class;
