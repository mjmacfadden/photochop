/**
 * Shared SVG icons for adjustment types (Adjustments grid + Layers panel thumbs).
 * Keep icons monochrome via currentColor; avoid hardcoded theme colors.
 */
const ADJUSTMENT_ICONS = {
	'brightness': `<svg class="adj_icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/></svg>`,
	'contrast': `<svg class="adj_icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>`,
	'hue-saturation': `<svg class="adj_icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a10 10 0 0 1 10 10c0 4-2.5 7.5-6 9"/><path d="M12 2A10 10 0 0 0 2 12c0 4 2.5 7.5 6 9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M19 16l3 5-5-1"/></svg>`,
	'hue-rotate': `<svg class="adj_icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a10 10 0 0 1 10 10c0 4-2.5 7.5-6 9"/><path d="M12 2A10 10 0 0 0 2 12c0 4 2.5 7.5 6 9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M19 16l3 5-5-1"/></svg>`,
	'saturate': `<svg class="adj_icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a10 10 0 0 1 10 10c0 4-2.5 7.5-6 9"/><path d="M12 2A10 10 0 0 0 2 12c0 4 2.5 7.5 6 9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M19 16l3 5-5-1"/></svg>`,
	'grayscale': `<svg class="adj_icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><polygon points="3,4 21,20 3,20" fill="currentColor"/></svg>`,
	'sepia': `<svg class="adj_icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><polyline points="21 15 16 10 5 21"/></svg>`,
	// Invert: diagonal positive/negative; evenodd hole for dark spot (theme-safe, no hardcoded fills).
	'invert': `<svg class="adj_icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path fill="currentColor" fill-rule="evenodd" stroke="none" d="M3 3 L21 21 L3 21 Z M8 14.5 A1.5 1.5 0 1 0 8 17.5 A1.5 1.5 0 1 0 8 14.5 Z"/><circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"/></svg>`,
	'exposure': `<svg class="adj_icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/></svg>`,
	'blur': `<svg class="adj_icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3.5"/><circle cx="5.5" cy="9.5" r="2.2" opacity="0.6"/><circle cx="18.5" cy="9.5" r="2.2" opacity="0.6"/><circle cx="8.5" cy="17.5" r="2.2" opacity="0.6"/><circle cx="15.5" cy="17.5" r="2.2" opacity="0.6"/><circle cx="12" cy="4.5" r="1.8" opacity="0.5"/></svg>`,
	'threshold': `<svg class="adj_icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><rect x="12" y="3" width="9" height="18" fill="currentColor"/></svg>`,
};

/** Generic half-circle fallback (Photoshop-style adjustment badge). */
const ADJUSTMENT_ICON_FALLBACK = `<svg class="adj_icon" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 2 A6 6 0 0 1 8 14 Z" fill="currentColor"/></svg>`;

function normalize_adjustment_type(type) {
	if (!type) return null;
	type = String(type).toLowerCase().replace(/_/g, '-');
	if (type === 'hue/saturation' || type === 'huesaturation') type = 'hue-saturation';
	return type;
}

/**
 * @param {string} type adjustment_type
 * @param {{className?: string}} [opts]
 * @returns {string} SVG markup
 */
function get_adjustment_icon(type, opts = {}) {
	const norm = normalize_adjustment_type(type);
	let svg = (norm && ADJUSTMENT_ICONS[norm]) || ADJUSTMENT_ICON_FALLBACK;
	if (opts.className) {
		svg = svg.replace('class="adj_icon"', `class="${opts.className}"`);
	}
	return svg;
}

export {
	ADJUSTMENT_ICONS,
	ADJUSTMENT_ICON_FALLBACK,
	normalize_adjustment_type,
	get_adjustment_icon,
};
