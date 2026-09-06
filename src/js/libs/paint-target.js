import app from './../app.js';
import config from './../config.js';
import Layer_raster_class from './../modules/layer/raster.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

const Layer_raster = new Layer_raster_class();

/**
 * Create a blank full-document image layer above the current selection.
 * Insert_layer_action places it above the active layer by default.
 */
function insert_blank_image_layer() {
	const new_layer = {
		name: 'Layer ' + (app.Layers ? app.Layers.auto_increment : 1),
		type: 'image',
		link: document.createElement('canvas'),
		data: null,
		width: config.WIDTH,
		height: config.HEIGHT,
		width_original: config.WIDTH,
		height_original: config.HEIGHT,
		x: 0,
		y: 0,
	};
	new_layer.link.width = config.WIDTH;
	new_layer.link.height = config.HEIGHT;
	app.State.do_action(new app.Actions.Insert_layer_action(new_layer, false));
	return config.layer;
}

/**
 * Ensure the active layer can accept pixel painting (brush, pencil, eraser, clone, heal).
 *
 * Text layers:
 * - onText 'new-layer' (brush/pencil): do NOT rasterize — insert a blank image
 *   layer above and paint there instead.
 * - onText 'block' (eraser/clone/spot heal): do NOT create a layer and do NOT
 *   rasterize — show a toast and return null so the stroke is blocked.
 * Other non-image types still rasterize.
 *
 * @param {object} [options]
 * @param {string} [options.verb='paint'] - verb used in adjustment-layer error copy
 * @param {'new-layer'|'block'} [options.onText='new-layer'] - text-layer policy
 * @param {string} [options.toolName] - display name for block toast
 * @returns {object|null} image layer to paint on, or null if painting is blocked
 */
export function ensure_paint_layer(options = {}) {
	const verb = options.verb || 'paint';
	const onText = options.onText || 'new-layer';
	const toolName = options.toolName || 'this tool';

	if (config.layer == null || !config.layers || config.layers.length === 0) {
		return insert_blank_image_layer();
	}

	if (config.layer.type === 'adjustment') {
		alertify.error(
			'Cannot ' + verb + ' directly on an adjustment layer. Create a new layer or edit the layer mask.'
		);
		return null;
	}

	if (config.layer.type === 'text') {
		if (onText === 'block') {
			alertify.error('Rasterize layer to use ' + toolName);
			return null;
		}
		// Keep editable text intact; paint on a new blank layer above (full document size).
		return insert_blank_image_layer();
	}

	if (config.layer.type !== 'image') {
		Layer_raster.raster();
	}

	return config.layer;
}

export default {
	ensure_paint_layer,
};
