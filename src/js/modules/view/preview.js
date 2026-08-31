import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';

/**
 * Toggles the preview (mini navigator) panel in the right sidebar.
 * View -> Preview
 */
class View_preview_class {

	constructor() {
		this.Helper = new Helper_class();
	}

	preview() {
		var node = document.querySelector('.sidebar_right .preview.block');
		if (node == null) {
			return;
		}

		var hidden = node.classList.toggle('hidden');
		this.Helper.setCookie('preview_panel', hidden ? 0 : 1);
		this.Helper.setCookie('panel_visible_preview', hidden ? 0 : 1);

		//redraw the preview + active zone overlay when shown again
		config.need_render = true;
	}
}
export default View_preview_class;