import app from './../app.js';
import config from './../config.js';
import { Base_action } from './base.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { resolve_insert_parent_id, resolve_insert_order } from './../libs/layer-tree.js';

export class Insert_layer_action extends Base_action {
	/**
	 * Creates new layer
	 *
	 * @param {object} settings
	 * @param {boolean} can_automate
	 */
	constructor(settings, can_automate = true) {
		super('insert_layer', 'Insert Layer');
		this.settings = settings;
		this.can_automate = can_automate;
		this.previous_auto_increment = null;
		this.previous_selected_layer = null;
		this.inserted_layer_id = null;
		this.update_layer_action = null;
		this.delete_layer_action = null;
		this.autoresize_canvas_action = null;
		this.order_shifts = null;
	}

	async do() {
		super.do();

		this.previous_auto_increment = app.Layers.auto_increment;
		this.previous_selected_layer = config.layer;
		let autoresize_as = null;

		// Default parent (group-aware)
		const default_parent = (this.settings && this.settings.parent_id != null)
			? this.settings.parent_id
			: resolve_insert_parent_id(config.layer);

		// Default order: directly above selected layer (PS paste / New Layer)
		this.order_shifts = null;
		let target_order;
		if (this.settings && this.settings.order != null) {
			target_order = this.settings.order;
		} else {
			target_order = resolve_insert_order(config.layer, default_parent, config.layers);
		}

		const layer = {
			id: app.Layers.auto_increment,
			parent_id: default_parent,
			name: 'Layer ' + app.Layers.auto_increment,
			type: null,
			link: null,
			x: 0,
			y: 0,
			width: null,
			width_original: null,
			height: null,
			height_original: null,
			visible: true,
			locked: false,
			is_vector: false,
			hide_selection_if_active: false,
			opacity: 100,
			order: target_order,
			composition: 'source-over',
			rotate: 0,
			data: null,
			params: {},
			status: null,
			color: config.COLOR,
			filters: [],
			render_function: null,
			mask: null,
			adjustment_type: null,
			opened: true,
		};

		// Build data
		for (let i in this.settings) {
			if (typeof layer[i] == "undefined" && !i.startsWith('_')) {
				alertify.error('Error: wrong key: ' + i);
				continue;
			}
			layer[i] = this.settings[i];
		}

		// Prepare image
		let image_load_promise;
		if (layer.type == 'image') {
			
			if(layer.name.toLowerCase().indexOf('.svg') == layer.name.length - 4){
				// We have svg
				layer.is_vector = true;
			}

			if (config.layers.length == 1 && (config.layer.width == 0 || config.layer.width === null)
					&& (config.layer.height == 0 || config.layer.height === null) && config.layer.data == null) {
				// Remove first empty layer

				this.delete_layer_action = new app.Actions.Delete_layer_action(config.layer.id, true);
				await this.delete_layer_action.do();
			}

			if (layer.link == null) {
				if (typeof layer.data == 'object') {
					// Load actual image
					if (layer.width == 0 || layer.width === null)
						layer.width = layer.data.width;
					if (layer.height == 0 || layer.height === null)
						layer.height = layer.data.height;
					layer.link = layer.data.cloneNode(true);
					layer.link.onload = function () {
						config.need_render = true;
					};
					layer.data = null;
					autoresize_as = [layer.width, layer.height, null, this.can_automate, true];
					//need_autoresize = true;
				}
				else if (typeof layer.data == 'string') {
					image_load_promise = new Promise((resolve, reject) => {
						// Try loading as imageData
						layer.link = new Image();
						layer.link.onload = () => {
							// Update dimensions
							if (layer.width == 0 || layer.width === null)
								layer.width = layer.link.width;
							if (layer.height == 0 || layer.height === null)
								layer.height = layer.link.height;
							if (layer.width_original == null)
								layer.width_original = layer.width;
							if (layer.height_original == null)
								layer.height_original = layer.height;
							// Free data
							layer.data = null;
							autoresize_as = [layer.width, layer.height, layer.id, this.can_automate, true];
							config.need_render = true;
							resolve();
						};
						layer.link.onerror = (error) => {
							resolve(error);
							alertify.error('Sorry, image could not be loaded.');
						};
						layer.link.src = layer.data;
						layer.link.crossOrigin = "Anonymous";
					});
				}
				else {
					alertify.error('Error: can not load image.');
				}
			}
		}

		if (this.settings != undefined && config.layers.length > 0
			&& (config.layer.width == 0 || config.layer.width === null) && (config.layer.height == 0 || config.layer.height === null)
			&& config.layer.data == null && layer.type != 'image' && this.can_automate !== false) {
			// Update existing layer, because it's empty
			this.update_layer_action = new app.Actions.Update_layer_action(config.layer.id, layer);
			await this.update_layer_action.do();
		}
		else {
			// Create new layer — make room above the selection first
			const insert_order = (layer.order != null) ? layer.order : target_order;
			layer.order = insert_order;
			if (config.layers && Array.isArray(config.layers)) {
				const shifts = [];
				for (let i = 0; i < config.layers.length; i++) {
					const l = config.layers[i];
					if (l.order != null && l.order >= insert_order) {
						shifts.push({ id: l.id, old_order: l.order });
						l.order = l.order + 1;
					}
				}
				if (shifts.length) {
					this.order_shifts = shifts;
				}
			}
			config.layers.push(layer);
			config.layer = app.Layers.get_layer(layer.id);
			app.Layers.auto_increment++;

			if (config.layer == null) {
				config.layer = config.layers[0];
			}

			this.inserted_layer_id = layer.id;
		}

		if (layer.id >= app.Layers.auto_increment)
			app.Layers.auto_increment = layer.id + 1;

		if (image_load_promise) {
			await image_load_promise;
		}

		if (autoresize_as) {
			this.autoresize_canvas_action = new app.Actions.Autoresize_canvas_action(...autoresize_as);
			try {
				await this.autoresize_canvas_action.do();
			} catch(error) {
				this.autoresize_canvas_action = null;
			}
		}

		app.Layers.render();
		app.GUI.GUI_layers.render_layers();
	}

	async undo() {
		super.undo();
		app.Layers.auto_increment = this.previous_auto_increment;
		if (this.autoresize_canvas_action) {
			await this.autoresize_canvas_action.undo();
			this.autoresize_canvas_action = null;
		}
		if (this.order_shifts) {
			for (const s of this.order_shifts) {
				const layer = config.layers.find(l => l.id === s.id);
				if (layer) layer.order = s.old_order;
			}
			this.order_shifts = null;
		}
		if (this.inserted_layer_id) {
			const index = config.layers.findIndex(l => l.id === this.inserted_layer_id);
			if (index > -1) {
				config.layers.splice(index, 1);
			} else {
				config.layers.pop();
			}
			this.inserted_layer_id = null;
		}
		if (this.update_layer_action) {
			await this.update_layer_action.undo();
			this.update_layer_action.free();
			this.update_layer_action = null;
		}
		if (this.delete_layer_action) {
			await this.delete_layer_action.undo();
			this.delete_layer_action.free();
			this.delete_layer_action = null;
		}
		config.layer = this.previous_selected_layer;
		this.previous_selected_layer = null;

		if (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['text']) {
			const textTool = app.GUI.GUI_tools.tools_modules['text'].object;
			if (textTool) {
				textTool.layer = config.layer;
				if (!config.layer || config.layer.type !== 'text') {
					if (textTool.textarea) textTool.textarea.blur();
					textTool.focused = false;
					textTool.focusedValue = null;
				}
			}
		}

		app.Layers.render();
		app.GUI.GUI_layers.render_layers();
	}

	free() {
		if (this.delete_layer_action) {
			this.delete_layer_action.free();
			this.delete_layer_action = null;
		}
		if (this.update_layer_action) {
			this.update_layer_action.free();
			this.update_layer_action = null;
		}
		this.previous_selected_layer = null;
		this.order_shifts = null;
	}
}