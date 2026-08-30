import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import GUI_tools_class from './../../core/gui/gui-tools.js';
import Base_selection_class from './../../core/base-selection.js';
import Selection_class from './../../tools/selection.js';
import Helper_class from './../../libs/helpers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Layer_new_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
		this.Selection = new Selection_class(this.Base_layers.ctx);
		this.Base_selection = new Base_selection_class(this.Base_layers.ctx);
		this.GUI_tools = new GUI_tools_class();
		this.Helper = new Helper_class();

		this.set_events();
	}

	set_events() {
		document.addEventListener('keydown', (event) => {
			var code = event.keyCode;
			if (this.Helper.is_input(event.target))
				return;

			if (code == 78 && event.ctrlKey != true && event.metaKey != true) {
				//N
				this.new();
			}
		}, false);
	}

	new() {
		app.State.do_action(
			new app.Actions.Insert_layer_action()
		);
	}

	new_selection() {
		var extracted = this.Base_layers.Base_selection.extract_selection_image(config.layer);
		if (extracted == null) {
			alertify.error('Nothing is selected.');
			return;
		}

		var params = {
			name: (config.layer && config.layer.name ? config.layer.name + ' copy' : 'Selection'),
			type: 'image',
			data: extracted.canvas.toDataURL('image/png'),
			x: extracted.x,
			y: extracted.y,
			width: extracted.width,
			height: extracted.height,
			width_original: extracted.width,
			height_original: extracted.height,
		};
		app.State.do_action(
			new app.Actions.Bundle_action('new_layer', 'Layer Via Copy', [
				new app.Actions.Insert_layer_action(params, false),
			])
		);
	}

}

export default Layer_new_class;