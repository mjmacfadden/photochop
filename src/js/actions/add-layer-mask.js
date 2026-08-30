import app from './../app.js';
import config from './../config.js';
import Mask_class from './../modules/mask/mask.js';
import { Base_action } from './base.js';

export class Add_layer_mask_action extends Base_action {
	/**
	 * adds a new layer mask, initialized to white (reveal all) or black (hide all)
	 *
	 * @param {int} layer_id (optional)
	 * @param {Boolean} reveal true = reveal all, false = hide all
	 * @param {Boolean} use_selection restrict the mask by the current selection
	 */
	constructor(layer_id, reveal, use_selection) {
		super('add_layer_mask', 'Add Layer Mask');
		this.layer_id = layer_id;
		this.reveal = reveal !== false;
		this.use_selection = use_selection === true;
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
		this.old_mask = this.reference_layer.mask;
		this.old_mask_active = config.mask_active;
		if (this.reference_layer.mask) {
			throw new Error('Aborted - layer already has a mask');
		}

		var Mask = new Mask_class();
		if (this.use_selection) {
			this.reference_layer.mask = Mask.create_mask_from_selection(this.reference_layer, this.reveal);
		}
		else {
			this.reference_layer.mask = Mask.create_mask(this.reference_layer, this.reveal);
		}
		config.mask_active = true;
		Mask.default_mask_colors();

		app.GUI.GUI_layers.render_layers();
		app.Layers.notify_mask_changed(this.layer_id);
	}

	async undo() {
		super.undo();
		if (this.reference_layer) {
			this.reference_layer.mask = this.old_mask;
			config.mask_active = this.old_mask_active;
			this.old_mask = null;
		}
		this.reference_layer = null;
		if (config.layer && config.layer.mask == null) {
			config.mask_active = false;
		}
		app.GUI.GUI_layers.render_layers();
		app.Layers.notify_mask_changed(this.layer_id);
	}

	free() {
		this.old_mask = null;
		this.reference_layer = null;
	}
}