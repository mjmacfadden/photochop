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
 * Photoshop-like: if the active layer is text, do NOT rasterize it — insert a blank
 * image layer above and paint there instead. Other non-image types still rasterize.
 *
 * @param {object} [options]
 * @param {string} [options.verb='paint'] - verb used in adjustment-layer error copy
 * @returns {object|null} image layer to paint on, or null if painting is blocked
 */
export function ensure_paint_layer(options = {}) {
	const verb = options.verb || 'paint';

	if (config.layer == null || !config.layers || config.layers.length === 0) {
		return insert_blank_image_layer();
	}

	if (config.layer.type === 'adjustment') {
		alertify.error(
			'Cannot ' + verb + ' directly on an adjustment layer. Create a new layer or edit the layer mask.'
		);
		return null;
	}

	// Keep editable text intact; paint on a new blank layer above (full document size).
	if (config.layer.type === 'text') {
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
