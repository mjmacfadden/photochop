import app from '../app.js';
import config from '../config.js';
import { Base_action } from './base.js';

export class Select_layer_action extends Base_action {
	/**
	 * marks layer as selected, active
	 *
	 * @param {int} layer_id
	 * @param {boolean} ignore_same_selection
	 * @param {null|{ids:number[], set_anchor?:boolean}} selection
	 *        Optional multi-select payload. When omitted, selection collapses
	 *        to [layer_id] and the Shift-click anchor is updated.
	 */
	constructor(layer_id, ignore_same_selection = false, selection = null) {
		super('select_layer', 'Select Layer');
		this.reset_selection_action = null;
		this.layer_id = parseInt(layer_id);
		this.ignore_same_selection = ignore_same_selection;
		this.selection = selection;
		this.old_layer = null;
		this.old_mask_active = config.mask_active;
		this.old_selected_layer_ids = null;
		this.old_layer_select_anchor_id = null;
	}

	async do() {
		super.do();

		let old_layer = config.layer;
		let new_layer = app.Layers.get_layer(this.layer_id);
		this.old_layer = old_layer;

		if (old_layer !== new_layer) {
			const textTool = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['text'])
				? app.GUI.GUI_tools.tools_modules['text'].object
				: null;
			if (textTool && textTool.focused) {
				await textTool.commit_text_changes();
				textTool.focused = false;
				if (textTool.textarea) textTool.textarea.blur();
			}
			config.layer = new_layer;
			config.mask_active = false;
			if (new_layer && new_layer.type === 'text' && config.TOOL && config.TOOL.name === 'text' && textTool) {
				textTool.focused = false;
				const editor = textTool.get_editor(new_layer);
				if (editor) {
					textTool.update_tool_attributes(new_layer, editor);
				}
			}
		} else if (!this.ignore_same_selection) {
			throw new Error('Aborted - Layer already selected');
		}

		this.old_selected_layer_ids = Array.isArray(config.selected_layer_ids)
			? config.selected_layer_ids.slice()
			: [];
		this.old_layer_select_anchor_id = config.layer_select_anchor_id;

		if (this.selection && Array.isArray(this.selection.ids)) {
			config.selected_layer_ids = this.selection.ids.map((id) => parseInt(id, 10)).filter((id) => !!id);
			if (this.selection.set_anchor !== false) {
				config.layer_select_anchor_id = this.layer_id;
			}
		} else {
			config.selected_layer_ids = config.layer ? [config.layer.id] : [];
			config.layer_select_anchor_id = config.layer ? config.layer.id : null;
		}

		this.reset_selection_action = new app.Actions.Reset_selection_action();
		await this.reset_selection_action.do();

		app.Layers.render();
		app.GUI.GUI_layers.render_layers();
		if (app.GUI && app.GUI.GUI_tools && typeof app.GUI.GUI_tools.update_transform_indicators === 'function') {
			app.GUI.GUI_tools.update_transform_indicators();
		}
	}

	async undo() {
		super.undo();

		if (this.reset_selection_action) {
			await this.reset_selection_action.undo();
			this.reset_selection_action = null;
		}

		config.layer = this.old_layer;
		this.old_layer = null;
		config.mask_active = this.old_mask_active;
		this.old_mask_active = false;

		if (this.old_selected_layer_ids != null) {
			config.selected_layer_ids = this.old_selected_layer_ids;
			this.old_selected_layer_ids = null;
		}
		config.layer_select_anchor_id = this.old_layer_select_anchor_id;
		this.old_layer_select_anchor_id = null;

		app.Layers.render();
		app.GUI.GUI_layers.render_layers();
		if (app.GUI && app.GUI.GUI_tools && typeof app.GUI.GUI_tools.update_transform_indicators === 'function') {
			app.GUI.GUI_tools.update_transform_indicators();
		}
	}

	free() {
		this.old_layer = null;
		this.old_selected_layer_ids = null;
		this.selection = null;
	}
}
