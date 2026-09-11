import app from './../../app.js';
import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';

/**
 * View → Full Screen / Screen Mode
 *
 * - fs(): browser Fullscreen API (View → Full Screen menu)
 * - toggle_canvas_only(): Photoshop-style F key — normal ↔ canvas-only
 *   (chrome hidden, black surround, fit-to-screen). Independent of browser fullscreen.
 */
class View_fullScreen_class {

	constructor() {
		this.Helper = new Helper_class();
		this.canvas_only = false;
		this.saved_state = null;
		this.set_events();
	}

	set_events() {
		document.addEventListener('keydown', (event) => {
			if (this.should_ignore_shortcut(event)) {
				return;
			}

			const isF = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
				&& (event.code === 'KeyF' || event.key === 'f' || event.key === 'F' || event.keyCode === 70);

			if (isF) {
				event.preventDefault();
				event.stopImmediatePropagation();
				this.toggle_canvas_only();
				return;
			}

			// Esc restores normal UI when in canvas-only mode (nice-to-have)
			if (this.canvas_only
				&& !event.ctrlKey && !event.metaKey && !event.altKey
				&& (event.key === 'Escape' || event.code === 'Escape' || event.keyCode === 27)) {
				event.preventDefault();
				event.stopImmediatePropagation();
				this.exit_canvas_only();
			}
		}, true);
	}

	/**
	 * Skip when typing in inputs, contenteditable, open dialogs, or text-tool edit.
	 */
	should_ignore_shortcut(event) {
		const target = event.target;
		if (this.Helper.is_input(target)) {
			return true;
		}
		if (target && (target.isContentEditable || (target.closest && target.closest('[contenteditable="true"]')))) {
			return true;
		}
		if (target && target.closest && target.closest('#popups, .popup, [role="dialog"]')) {
			return true;
		}
		const popups = document.getElementById('popups');
		if (popups && popups.children.length > 0) {
			return true;
		}
		if (app.GUI && app.GUI.POP && typeof app.GUI.POP.get_active_instances === 'function'
			&& app.GUI.POP.get_active_instances() > 0) {
			return true;
		}

		// Text tool actively editing
		const isTextToolActive = config.TOOL && config.TOOL.name === 'text';
		const isTextLayer = config.layer && config.layer.type === 'text';
		if (isTextToolActive && isTextLayer && app.GUI && app.GUI.GUI_tools
			&& app.GUI.GUI_tools.tools_modules['text']) {
			const textTool = app.GUI.GUI_tools.tools_modules['text'].object;
			if (textTool && (textTool.focused
				|| (typeof textTool.is_cursor_active === 'function' && textTool.is_cursor_active()))) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Browser Fullscreen API (menu: View → Full Screen).
	 * Does not change app chrome / canvas-only mode.
	 */
	fs() {
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen();
		}
		else if (document.exitFullscreen) {
			document.exitFullscreen();
		}
	}

	/**
	 * Photoshop-style screen mode toggle (F): normal ↔ canvas-only.
	 */
	toggle_canvas_only() {
		if (this.canvas_only) {
			this.exit_canvas_only();
		}
		else {
			this.enter_canvas_only();
		}
	}

	enter_canvas_only() {
		if (this.canvas_only) {
			return;
		}

		const preview = app.GUI && app.GUI.GUI_preview;
		const move_pos = preview && preview.zoom_data ? preview.zoom_data.move_pos : null;

		this.saved_state = {
			zoom: config.ZOOM,
			move_pos: move_pos ? { x: move_pos.x, y: move_pos.y } : null,
		};

		this.canvas_only = true;
		document.body.classList.add('canvas-only-mode');

		// Let layout reflow (chrome hidden) before fitting
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (!this.canvas_only) {
					return;
				}
				if (app.GUI) {
					app.GUI.prepare_canvas();
				}
				if (preview) {
					preview.zoom_data.move_pos = null;
					preview.set_center_zoom();
					preview.zoom_auto();
				}
			});
		});
	}

	exit_canvas_only() {
		if (!this.canvas_only) {
			return;
		}

		const saved = this.saved_state;
		this.canvas_only = false;
		this.saved_state = null;
		document.body.classList.remove('canvas-only-mode');

		const preview = app.GUI && app.GUI.GUI_preview;

		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (app.GUI) {
					app.GUI.prepare_canvas();
				}
				if (preview && saved) {
					if (saved.move_pos) {
						preview.zoom_data.move_pos = {
							x: saved.move_pos.x,
							y: saved.move_pos.y,
						};
					}
					else {
						preview.zoom_data.move_pos = null;
					}
					preview.set_center_zoom();
					preview.zoom(saved.zoom * 100);
				}
				else if (preview) {
					preview.zoom_auto();
				}
			});
		});
	}

}

export default View_fullScreen_class;
