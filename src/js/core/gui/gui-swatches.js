/*
 * Vantage Point - Swatches Panel & Recent Colors Manager
 */

import config from "./../../config.js";
import app from "./../../app.js";
import Helper_class from "./../../libs/helpers.js";
import { SWATCH_CATEGORIES } from "./gui-swatches-data.js";

var instance = null;

class GUI_swatches_class {

	constructor(Base_gui) {
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_gui = Base_gui;
		this.Helper = new Helper_class();

		this.max_recent_colors = 10;
		this.recent_colors = this.load_recent_colors();
		this.search_query = "";
		this.collapsed_categories = this.load_collapsed_state();
		this._drag_active = false;
		this._save_timer = null;
		this.el = null;

		window.addEventListener("mouseup", () => {
			this.finish_color_selection();
		});
		window.addEventListener("touchend", () => {
			this.finish_color_selection();
		});
	}

	load_recent_colors() {
		try {
			const saved = localStorage.getItem("vantage_recent_colors");
			if (saved) {
				const parsed = JSON.parse(saved);
				if (Array.isArray(parsed) && parsed.length > 0) {
					return parsed.filter(c => /^#[0-9a-fA-F]{6}$/i.test(c)).slice(0, this.max_recent_colors);
				}
			}
		} catch (e) {
			console.warn("[Swatches] Error loading recent colors:", e);
		}
		return [
			"#000000", "#ffffff", "#e74c3c", "#e67e22", "#f1c40f",
			"#2ecc71", "#1abc9c", "#3498db", "#9b59b6", "#34495e"
		];
	}

	save_recent_colors() {
		clearTimeout(this._save_timer);
		this._save_timer = setTimeout(() => {
			try {
				localStorage.setItem("vantage_recent_colors", JSON.stringify(this.recent_colors));
			} catch (e) {}
		}, 400);
	}

	load_collapsed_state() {
		try {
			const saved = localStorage.getItem("vantage_swatch_collapsed");
			if (saved) {
				return JSON.parse(saved) || {};
			}
		} catch (e) {}
		// By default, only the first category is open, others collapsed for neatness
		const state = {};
		const catNames = Object.keys(SWATCH_CATEGORIES);
		catNames.forEach((name, idx) => {
			if (idx > 0) state[name] = true;
		});
		return state;
	}

	save_collapsed_state() {
		try {
			localStorage.setItem("vantage_swatch_collapsed", JSON.stringify(this.collapsed_categories));
		} catch (e) {}
	}

	record_color_selection(hex, is_drag = false) {
		if (!hex || !/^#[0-9a-fA-F]{6}$/i.test(hex)) return;
		const normalized = "#" + hex.replace(/^#/, "").toLowerCase();
		if (!/^#[0-9a-f]{6}$/.test(normalized)) return;

		if (is_drag) {
			if (!this._drag_active) {
				this._drag_active = true;
				this.add_recent_color(normalized);
			} else {
				this.update_latest_recent_color(normalized);
			}
		} else {
			this._drag_active = false;
			this.add_recent_color(normalized);
		}
	}

	finish_color_selection() {
		if (this._drag_active) {
			this._drag_active = false;
			this.save_recent_colors();
		}
	}

	add_recent_color(normalized) {
		const idx = this.recent_colors.indexOf(normalized);
		if (idx === 0) {
			this.update_active_swatch_indicator();
			return;
		}
		if (idx > 0) {
			this.recent_colors.splice(idx, 1);
		}
		this.recent_colors.unshift(normalized);
		if (this.recent_colors.length > this.max_recent_colors) {
			this.recent_colors = this.recent_colors.slice(0, this.max_recent_colors);
		}
		this.save_recent_colors();
		this.update_recent_colors_dom();
	}

	update_latest_recent_color(normalized) {
		if (this.recent_colors.length === 0) {
			this.add_recent_color(normalized);
			return;
		}
		if (this.recent_colors[0] === normalized) {
			this.update_active_swatch_indicator();
			return;
		}
		this.recent_colors[0] = normalized;
		this.update_recent_colors_dom();
	}

	clear_recent_colors() {
		this.recent_colors = [];
		try {
			localStorage.setItem("vantage_recent_colors", JSON.stringify(this.recent_colors));
		} catch (e) {}
		this.render_recent_colors_grid();
	}

	select_color(hex, is_background = false) {
		if (!hex) return;
		const normalized = "#" + hex.replace(/^#/, "").toLowerCase();

		if (is_background) {
			config.COLOR_BG = normalized;
			this.Helper.setCookie("color_bg", config.COLOR_BG);
			if (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.update_toolbar_swatches) {
				app.GUI.GUI_tools.update_toolbar_swatches();
			}
		} else {
			config.COLOR = normalized;
			this.Helper.setCookie("color", config.COLOR);
			if (app.GUI && app.GUI.GUI_colors && app.GUI.GUI_colors.set_color) {
				app.GUI.GUI_colors.set_color({ hex: normalized }, false);
			}
			if (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.update_toolbar_swatches) {
				app.GUI.GUI_tools.update_toolbar_swatches();
			}
			this.record_color_selection(normalized, false);
		}
		this.update_active_swatch_indicator();
	}

	render_main_swatches() {
		this.render_recent_colors_grid();
		this.render_swatches_panel();
		this.update_active_swatch_indicator();
	}

	update_recent_colors_dom() {
		const container = document.getElementById("recent_colors_grid");
		if (!container) return;

		const chips = container.querySelectorAll(".recent_color_chip");
		if (chips.length !== this.recent_colors.length || this.recent_colors.length === 0) {
			this.render_recent_colors_grid();
			return;
		}

		const activeHex = (config.COLOR || "").toLowerCase();
		for (let i = 0; i < this.recent_colors.length; i++) {
			const hex = this.recent_colors[i];
			const chip = chips[i];
			chip.style.backgroundColor = hex;
			chip.dataset.hex = hex;
			chip.title = `${hex.toUpperCase()}\nLeft-click: foreground\nAlt/Right-click: background`;
			if (hex.toLowerCase() === activeHex) {
				chip.classList.add("active");
			} else {
				chip.classList.remove("active");
			}
		}
	}

	render_recent_colors_grid() {
		const container = document.getElementById("recent_colors_grid");
		const clearBtn = document.getElementById("recent_colors_clear_btn");
		if (!container) return;

		container.innerHTML = "";

		if (clearBtn && !clearBtn._has_listener) {
			clearBtn._has_listener = true;
			clearBtn.addEventListener("click", () => {
				this.clear_recent_colors();
			});
		}

		if (this.recent_colors.length === 0) {
			container.innerHTML = `<span class="recent_colors_empty">No recent colors</span>`;
			return;
		}

		const activeHex = (config.COLOR || "").toLowerCase();

		for (const hex of this.recent_colors) {
			const chip = document.createElement("button");
			chip.type = "button";
			chip.className = "recent_color_chip";
			if (hex.toLowerCase() === activeHex) {
				chip.classList.add("active");
			}
			chip.style.backgroundColor = hex;
			chip.title = `${hex.toUpperCase()}\nLeft-click: foreground\nAlt/Right-click: background`;
			chip.dataset.hex = hex;

			chip.addEventListener("click", (e) => {
				this.select_color(chip.dataset.hex, e.altKey);
			});

			chip.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				this.select_color(chip.dataset.hex, true);
			});

			container.appendChild(chip);
		}
		this.update_active_swatch_indicator();
	}

	render_swatches_panel() {
		this.el = document.getElementById("toggle_swatches");
		if (!this.el) return;

		this.el.innerHTML = `
			<div class="swatches_panel_content">
				<div class="swatches_toolbar">
					<div class="swatches_toolbar_row">
						<div class="swatches_search_box">
							<svg id="swatches_search_icon" class="swatches_search_icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="11" cy="11" r="8"></circle>
								<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
							</svg>
							<input type="text" id="swatches_search_input" class="swatches_search_input" placeholder="Search swatches..." />
							<button type="button" id="swatches_search_clear" class="swatches_search_clear hidden" title="Clear search">&times;</button>
						</div>
						<button type="button" id="swatches_toggle_all_btn" class="swatches_icon_btn" title="Expand/Collapse All Categories">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="7 13 12 18 17 13"></polyline>
								<polyline points="7 6 12 11 17 6"></polyline>
							</svg>
						</button>
					</div>
				</div>

				<div class="swatches_schemes_wrapper">
					<div id="swatches_folders_container" class="swatches_folders_container"></div>
				</div>
			</div>
		`;

		this.init_swatches_events();
		this.render_folders();
	}

	init_swatches_events() {
		const searchInput = document.getElementById("swatches_search_input");
		const searchClear = document.getElementById("swatches_search_clear");

		if (searchInput) {
			searchInput.addEventListener("input", (e) => {
				this.search_query = e.target.value.trim().toLowerCase();
				if (searchClear) {
					searchClear.classList.toggle("hidden", searchInput.value.length === 0);
				}
				this.render_folders();
			});
		}

		if (searchClear) {
			searchClear.addEventListener("click", () => {
				if (searchInput) {
					searchInput.value = "";
					searchInput.focus();
				}
				this.search_query = "";
				searchClear.classList.add("hidden");
				this.render_folders();
			});
		}

		const toggleAllBtn = document.getElementById("swatches_toggle_all_btn");
		if (toggleAllBtn) {
			toggleAllBtn.addEventListener("click", () => {
				const catNames = Object.keys(SWATCH_CATEGORIES);
				const someOpen = catNames.some(name => !this.collapsed_categories[name]);
				catNames.forEach(name => {
					this.collapsed_categories[name] = someOpen;
				});
				this.save_collapsed_state();
				this.render_folders();
			});
		}
	}

	render_folders() {
		const container = document.getElementById("swatches_folders_container");
		if (!container) return;

		container.innerHTML = "";

		const query = this.search_query;
		const catNames = Object.keys(SWATCH_CATEGORIES);
		let totalMatches = 0;

		catNames.forEach(catName => {
			let palettes = SWATCH_CATEGORIES[catName] || [];

			if (query) {
				palettes = palettes.filter(p => {
					if (p.name.toLowerCase().includes(query)) return true;
					return p.colors.some(c => c.hex.toLowerCase().includes(query) || (c.name && c.name.toLowerCase().includes(query)));
				});
				if (palettes.length === 0) {
					return;
				}
			}

			totalMatches += palettes.length;

			const isSearching = !!query;
			// Never hide categories! If searching, expand matched categories
			const isCollapsed = isSearching ? false : !!this.collapsed_categories[catName];

			const folderEl = document.createElement("div");
			folderEl.className = `swatches_folder ${isCollapsed ? "collapsed" : "expanded"}`;
			folderEl.dataset.category = catName;

			const headerEl = document.createElement("div");
			headerEl.className = "swatches_folder_header";
			headerEl.title = `Click to ${isCollapsed ? "expand" : "collapse"} ${catName}`;

			// Preview bar from first palette
			let previewColors = ["#e74c3c", "#f1c40f", "#2ecc71", "#3498db"];
			if (palettes.length > 0 && palettes[0].colors && palettes[0].colors.length >= 4) {
				previewColors = palettes[0].colors.slice(0, 4).map(c => c.hex);
			}
			const previewHtml = previewColors.map(c => `<span class="folder_preview_bar_segment" style="background:${c}"></span>`).join("");

			// Chevron icon without any folder icon (clean and modern)
			headerEl.innerHTML = `
				<div class="folder_header_left">
					<svg class="folder_chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<polyline points="9 18 15 12 9 6"></polyline>
					</svg>
					<span class="folder_title">${catName}</span>
					<span class="folder_count">(${palettes.length})</span>
				</div>
				<div class="folder_preview_bar">${previewHtml}</div>
			`;

			headerEl.addEventListener("click", () => {
				const nextState = !this.collapsed_categories[catName];
				this.collapsed_categories[catName] = nextState;
				this.save_collapsed_state();
				folderEl.classList.toggle("collapsed", nextState);
				folderEl.classList.toggle("expanded", !nextState);
			});

			folderEl.appendChild(headerEl);

			const bodyEl = document.createElement("div");
			bodyEl.className = "swatches_folder_body";

			palettes.forEach(palette => {
				const rowEl = document.createElement("div");
				rowEl.className = "swatches_palette_row";

				const nameEl = document.createElement("div");
				nameEl.className = "swatches_palette_name";
				nameEl.textContent = palette.name;
				nameEl.title = palette.name;

				const chipsEl = document.createElement("div");
				chipsEl.className = "swatches_palette_chips";

				palette.colors.forEach(color => {
					const chip = document.createElement("button");
					chip.type = "button";
					chip.className = "swatch_chip scheme_chip";
					chip.style.backgroundColor = color.hex;
					chip.dataset.hex = color.hex;
					chip.title = `${palette.name}\n${color.name ? color.name + " " : ""}${color.hex.toUpperCase()}\nLeft-click: foreground\nAlt/Right-click: background`;

					chip.addEventListener("click", (e) => {
						this.select_color(color.hex, e.altKey);
					});

					chip.addEventListener("contextmenu", (e) => {
						e.preventDefault();
						this.select_color(color.hex, true);
					});

					chipsEl.appendChild(chip);
				});

				rowEl.appendChild(nameEl);
				rowEl.appendChild(chipsEl);
				bodyEl.appendChild(rowEl);
			});

			folderEl.appendChild(bodyEl);
			container.appendChild(folderEl);
		});

		if (totalMatches === 0 && query) {
			container.innerHTML = `
				<div class="swatches_no_results">
					<span>No palettes match "${query}"</span>
				</div>
			`;
		}

		this.update_active_swatch_indicator();
	}

	update_active_swatch_indicator() {
		const activeHex = (config.COLOR || "").toLowerCase();
		const allChips = document.querySelectorAll(".recent_color_chip, .scheme_chip");
		allChips.forEach(chip => {
			if (chip.dataset.hex && chip.dataset.hex.toLowerCase() === activeHex) {
				chip.classList.add("active");
			} else {
				chip.classList.remove("active");
			}
		});
	}

}

export default GUI_swatches_class;
