import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Helper_class from './../../libs/helpers.js';
import Mask_class from './../../modules/mask/mask.js';
import Layer_new_class from './new.js';
import { is_group, get_children, get_parent_id } from './../../libs/layer-tree.js';

var instance = null;

class Layer_duplicate_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.Mask = new Mask_class();
		this.Layer_new = new Layer_new_class();

		this.set_events();
	}

	set_events() {
		document.addEventListener('keydown', (event) => {
			var code = event.keyCode;
			if (this.Helper.is_input(event.target))
				return;

			if (code == 74 && (event.ctrlKey == true || event.metaKey)) {
				//Ctrl+J - duplicate layer
				this.duplicate();
				event.preventDefault();
			}
		}, false);
	}

	_next_name(name) {
		var name_number = (name || 'Layer').match(/^(.*) #([0-9]+)$/);
		if (name_number == null) {
			return name + " #2";
		}
		return name_number[1] + " #" + (parseInt(name_number[2]) + 1);
	}

	_clone_layer_params(source, parent_id, name_override) {
		var params = JSON.parse(JSON.stringify(source));
		delete params.id;
		delete params.order;
		params.parent_id = parent_id != null ? parent_id : get_parent_id(source);
		params.name = name_override != null ? name_override : this._next_name(source.name);

		if (params.x != 0 || params.y != 0 || params.width != config.WIDTH || params.height != config.HEIGHT) {
			if (!is_group(source)) {
				params.x += 10;
				params.y += 10;
			}
		}

		for (var i in params) {
			if (i[0] == '_')
				delete params[i];
		}

		if (params.type == 'image' && source.link) {
			params.link = source.link.cloneNode(true);
		}

		if (source.mask != null) {
			var msource = this.Mask.get_mask_source(source);
			var link_canvas = (msource != null) ? this.Mask.copy_mask_canvas(msource) : source.mask.link;
			params.mask = {
				link: link_canvas,
				x: source.mask.x,
				y: source.mask.y,
				width: source.mask.width,
				height: source.mask.height,
				enabled: source.mask.enabled,
				linked: source.mask.linked !== false,
			};
		}

		if (is_group(source)) {
			params.type = 'group';
			params.opened = source.opened !== false;
			params.link = null;
			params.data = null;
		}

		return params;
	}

	async _duplicate_tree(source, parent_id, is_root) {
		var params = this._clone_layer_params(
			source,
			parent_id,
			is_root ? this._next_name(source.name) : source.name
		);
		await app.State.do_action(
			new app.Actions.Insert_layer_action(params, false)
		);
		var created = config.layer;
		if (is_group(source) && created) {
			var kids = get_children(source.id);
			for (var i = 0; i < kids.length; i++) {
				await this._duplicate_tree(kids[i], created.id, false);
			}
			await app.State.do_action(new app.Actions.Select_layer_action(created.id));
		}
	}

	duplicate() {
		if (this.Base_layers.Base_selection != null
			&& this.Base_layers.Base_selection.has_committed_selection()) {
			this.Layer_new.new_selection();
			return;
		}

		var source = config.layer;
		if (!source) return;

		if (is_group(source)) {
			this._duplicate_tree(source, get_parent_id(source), true);
			return;
		}

		var params = this._clone_layer_params(source, get_parent_id(source), this._next_name(source.name));
		app.State.do_action(
			new app.Actions.Bundle_action('duplicate_layer', 'Duplicate Layer', [
				new app.Actions.Insert_layer_action(params)
			])
		);
	}

}

export default Layer_duplicate_class;
