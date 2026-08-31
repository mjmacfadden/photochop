import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';

class Window_toggle_class {

	constructor() {
		this.Helper = new Helper_class();
	}

	toggle(panel_name) {
		const selectorMap = {
			colors: '.sidebar_right .colors.block',
			adjustments: '.sidebar_right .adjustments.block',
			layers: '.sidebar_right .layers.block',
			details: '.sidebar_right .details.block',
			preview: '.sidebar_right .preview.block'
		};

		const selector = selectorMap[panel_name];
		if (!selector) return;

		const node = document.querySelector(selector);
		if (!node) return;

		const isHidden = node.classList.toggle('hidden');
		this.Helper.setCookie('panel_visible_' + panel_name, isHidden ? 0 : 1);

		if (panel_name === 'preview') {
			this.Helper.setCookie('preview_panel', isHidden ? 0 : 1);
			config.need_render = true;
		}
	}

}

export default Window_toggle_class;
