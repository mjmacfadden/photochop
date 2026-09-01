import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';
import Base_gui_class from './../../core/base-gui.js';
import app from './../../app.js';

var instance = null;

class View_transparency_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.GUI = new Base_gui_class();
		this.Helper = new Helper_class();
	}

	toggle() {
		config.TRANSPARENCY = !config.TRANSPARENCY;
		this.Helper.setCookie('transparency', config.TRANSPARENCY ? 1 : 0);
		if (app.Documents) {
			const doc = app.Documents.get_active_document();
			if (doc) {
				doc.transparency = config.TRANSPARENCY;
			}
		}
		this.GUI.render_canvas_background('canvas_minipaint');
		this.GUI.render_canvas_background('canvas_preview', 8);
		config.need_render = true;
		if (app.Layers) {
			app.Layers.render(true);
		}
	}

}

export default View_transparency_class;
