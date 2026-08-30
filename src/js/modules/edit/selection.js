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
		this.Selection.select_all();
	}

	deselect() {
		this.Selection.clear_selection();
	}

	delete() {
		this.Selection.delete_selection();
	}
}

export default Edit_selection_class;
