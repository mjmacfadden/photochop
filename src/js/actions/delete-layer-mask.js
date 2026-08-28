import app from './../app.js';
import config from './../config.js';
import { Base_action } from './base.js';

export class Delete_layer_mask_action extends Base_action {
	/**
	 * removes a layer mask
	 *
	 * @param {int} layer_id (optional)
	 */
	constructor(layer_id) {
		super('delete_layer_mask', 'Delete Layer Mask');
		this.layer_id = layer_id;
		this.reference_layer = null;
		this.old_mask = null;
		this.old_mask_active = null;
	}

	async do() {
		super.do();
		this.reference_layer = app.Layers.get_layer(this.layer_id);
		if (!this.reference_layer) {
			throw new Error('Aborted - layer with specified id doesn\'t exist');
		}
		if (!this.reference_layer.mask) {
			throw new Error('Aborted - layer has no mask');
		}

		this.old_mask_active = config.mask_active;
		this.old_mask = this.reference_layer.mask;
		this.reference_layer.mask = null;

		if (config.layer && config.layer.id == this.reference_layer.id) {
			config.mask_active = false;
		}

		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
	}

	async undo() {
		super.undo();
		if (this.reference_layer) {
			this.reference_layer.mask = this.old_mask;
			if (this.old_mask_active != null) {
				config.mask_active = this.old_mask_active;
			}
			this.old_mask = null;
			this.old_mask_active = null;
		}
		this.reference_layer = null;
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
	}

	free() {
		this.old_mask = null;
		this.reference_layer = null;
	}
}