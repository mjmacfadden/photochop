import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';
import app from './../../app.js';

class Window_toggle_class {

	constructor() {
		this.Helper = new Helper_class();
	}

	/**
	 * Show / hide a sidebar panel. Tabbed panels (Adjustments/Properties,
	 * Color/Swatches) focus the requested tab when showing; if that tab is
	 * already visible, the whole block is hidden (checkbox-toggle semantics).
	 */
	toggle(panel_name) {
		if (panel_name === 'properties') {
			this.toggle_adjustments_tab('properties');
			return;
		}
		if (panel_name === 'adjustments') {
			this.toggle_adjustments_tab('adjustments');
			return;
		}
		if (panel_name === 'swatches') {
			this.toggle_colors_tab('swatches');
			return;
		}
		if (panel_name === 'colors') {
			this.toggle_colors_tab('color');
			return;
		}

		const selectorMap = {
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

	toggle_adjustments_tab(tab) {
		const block = document.querySelector('.sidebar_right .adjustments.block');
		if (!block) return;

		const paneAdj = document.getElementById('toggle_adjustments');
		const paneProps = document.getElementById('toggle_properties');
		const activeTab = (paneProps && !paneProps.classList.contains('hidden'))
			? 'properties'
			: 'adjustments';
		const blockVisible = !block.classList.contains('hidden');
		const wrapper = document.getElementById('toggle_adjustments_wrapper');
		const contentVisible = wrapper && !wrapper.classList.contains('hidden');

		// Already showing this tab → hide the block
		if (blockVisible && contentVisible && activeTab === tab) {
			block.classList.add('hidden');
			this.Helper.setCookie('panel_visible_adjustments', 0);
			return;
		}

		// Show block + focus requested tab
		block.classList.remove('hidden');
		this.Helper.setCookie('panel_visible_adjustments', 1);
		if (app.GUI && typeof app.GUI.activate_adjustments_tab === 'function') {
			app.GUI.activate_adjustments_tab(tab);
		}
	}

	toggle_colors_tab(tab) {
		const block = document.querySelector('.sidebar_right .colors.block');
		if (!block) return;

		const paneSwatches = document.getElementById('toggle_swatches');
		const activeTab = (paneSwatches && !paneSwatches.classList.contains('hidden'))
			? 'swatches'
			: 'color';
		const blockVisible = !block.classList.contains('hidden');
		const wrapper = document.getElementById('toggle_colors_wrapper');
		const contentVisible = wrapper && !wrapper.classList.contains('hidden');

		if (blockVisible && contentVisible && activeTab === tab) {
			block.classList.add('hidden');
			this.Helper.setCookie('panel_visible_colors', 0);
			return;
		}

		block.classList.remove('hidden');
		this.Helper.setCookie('panel_visible_colors', 1);
		if (app.GUI && typeof app.GUI.activate_colors_tab === 'function') {
			app.GUI.activate_colors_tab(tab);
		}
	}

	is_adjustments_tab_visible(tab) {
		const block = document.querySelector('.sidebar_right .adjustments.block');
		if (!block || block.classList.contains('hidden')) return false;
		const wrapper = document.getElementById('toggle_adjustments_wrapper');
		if (wrapper && wrapper.classList.contains('hidden')) return false;
		if (tab === 'properties') {
			const pane = document.getElementById('toggle_properties');
			return pane != null && !pane.classList.contains('hidden');
		}
		const pane = document.getElementById('toggle_adjustments');
		return pane != null && !pane.classList.contains('hidden');
	}

	is_colors_tab_visible(tab) {
		const block = document.querySelector('.sidebar_right .colors.block');
		if (!block || block.classList.contains('hidden')) return false;
		const wrapper = document.getElementById('toggle_colors_wrapper');
		if (wrapper && wrapper.classList.contains('hidden')) return false;
		if (tab === 'swatches') {
			const pane = document.getElementById('toggle_swatches');
			return pane != null && !pane.classList.contains('hidden');
		}
		const pane = document.getElementById('toggle_colors');
		return pane != null && !pane.classList.contains('hidden');
	}

}

export default Window_toggle_class;
