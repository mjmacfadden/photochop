import app from './../../app.js';
import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';

/**
 * View → Full Screen / Screen Mode
 *
 * F (and View → Canvas Only Mode / Full Screen) toggles Photoshop-style
 * screen mode: chrome hidden, black surround, fit-to-screen, PLUS true
 * browser Fullscreen API so the OS/browser chrome goes away (monitor-fill).
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

			// Esc restores normal UI when in canvas-only mode.
			// (Browser Esc while in Fullscreen API often exits fullscreen first;
			// fullscreenchange keeps canvas-only in sync in that case.)
			if (this.canvas_only
				&& !event.ctrlKey && !event.metaKey && !event.altKey
				&& (event.key === 'Escape' || event.code === 'Escape' || event.keyCode === 27)) {
				event.preventDefault();
				event.stopImmediatePropagation();
				this.exit_canvas_only();
			}
		}, true);

		document.addEventListener('fullscreenchange', () => {
			this.on_fullscreen_change();
		});
		// Safari / older WebKit
		document.addEventListener('webkitfullscreenchange', () => {
			this.on_fullscreen_change();
		});
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

	is_browser_fullscreen() {
		return !!(document.fullscreenElement
			|| document.webkitFullscreenElement
			|| document.mozFullScreenElement
			|| document.msFullscreenElement);
	}

	request_browser_fullscreen() {
		const root = document.documentElement;
		const req = root.requestFullscreen
			|| root.webkitRequestFullscreen
			|| root.mozRequestFullScreen
			|| root.msRequestFullscreen;
		if (!req) {
			return Promise.resolve();
		}
		try {
			const result = req.call(root);
			return result && typeof result.then === 'function'
				? result.catch(() => {})
				: Promise.resolve();
		}
		catch (e) {
			return Promise.resolve();
		}
	}

	exit_browser_fullscreen() {
		if (!this.is_browser_fullscreen()) {
			return Promise.resolve();
		}
		const exit = document.exitFullscreen
			|| document.webkitExitFullscreen
			|| document.mozCancelFullScreen
			|| document.msExitFullscreen;
		if (!exit) {
			return Promise.resolve();
		}
		try {
			const result = exit.call(document);
			return result && typeof result.then === 'function'
				? result.catch(() => {})
				: Promise.resolve();
		}
		catch (e) {
			return Promise.resolve();
		}
	}

	/**
	 * If the user leaves browser fullscreen via Esc / browser UI while in
	 * canvas-only mode, leave canvas-only too so modes stay in sync.
	 */
	on_fullscreen_change() {
		if (!this.is_browser_fullscreen() && this.canvas_only) {
			this.exit_canvas_only({ from_fullscreenchange: true });
		}
	}

	/**
	 * View → Full Screen: thin wrapper around the combined F screen mode
	 * (true fullscreen + chrome hide). Same path as F so they don't fight.
	 */
	fs() {
		this.toggle_canvas_only();
	}

	/**
	 * Photoshop-style screen mode toggle (F): normal ↔ canvas-only + monitor fullscreen.
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

		// True monitor fullscreen (YouTube-like): hide OS/browser chrome.
		// Must run in this user-gesture turn (F key / menu click).
		this.request_browser_fullscreen();

		// Let layout reflow (chrome hidden + fullscreen) before fitting
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

	/**
	 * @param {{ from_fullscreenchange?: boolean }} [options]
	 */
	exit_canvas_only(options) {
		if (!this.canvas_only) {
			return;
		}

		const from_fs_change = options && options.from_fullscreenchange;
		const saved = this.saved_state;
		this.canvas_only = false;
		this.saved_state = null;
		document.body.classList.remove('canvas-only-mode');

		// Exit browser fullscreen unless we got here because fullscreen already ended
		if (!from_fs_change) {
			this.exit_browser_fullscreen();
		}

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
