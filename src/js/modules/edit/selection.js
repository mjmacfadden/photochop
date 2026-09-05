import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Selection_class from './../../tools/selection.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Edit_selection_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
		this.Selection = new Selection_class(this.Base_layers.ctx);
	}

	select_all() {
		const textTool = (window.app && window.app.GUI && window.app.GUI.GUI_tools && window.app.GUI.GUI_tools.tools_modules['text'])
			? window.app.GUI.GUI_tools.tools_modules['text'].object
			: null;
		const isTextEditing = textTool && (textTool.focused || (typeof textTool.is_cursor_active === 'function' ? textTool.is_cursor_active() : false));
		if (isTextEditing && config.layer && config.layer.type === 'text') {
			textTool.select_all_text();
			return;
		}
		this.Selection.select_all();
	}

	deselect() {
		this.Selection.clear_selection();
	}

	delete() {
		this.Selection.delete_selection();
	}

	fill_foreground() {
		this.Selection.fill(config.COLOR || '#000000');
	}

	fill_background() {
		this.Selection.fill(config.COLOR_BG || '#ffffff');
	}
}

export default Edit_selection_class;
