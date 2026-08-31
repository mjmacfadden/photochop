//main config file

var config = {};

config.TRANSPARENCY = true;
config.TRANSPARENCY_TYPE = 'squares'; //squares, green, grey
config.LANG = 'en';
config.WIDTH = null;
config.HEIGHT = null;
config.visible_width = null;
config.visible_height = null;
config.COLOR = '#008000';
config.ALPHA = 255;
config.COLOR_BG = '#ffffff';
config.ALPHA_BG = 255;
config.ZOOM = 1;
config.SNAP = true;
config.pixabay_key = '3ca2cd8af3fde33af218bea02-9021417';
config.safe_search_can_be_disabled = true;
config.google_webfonts_key = 'AIzaSyBES3AipG'+'YVYNLtS,Vk-hJ11bbhJ9sTpRbA'.replace(',', '');
config.layers = [];
config.layer = null;
var need_render = false;
Object.defineProperty(config, 'need_render', {
	get: function () {
		return need_render;
	},
	set: function (value) {
		need_render = value === true;
		if (need_render && window.Layers && typeof window.Layers.request_render === 'function') {
			window.Layers.request_render();
		}
	}
});
config.need_render_changed_params = false; // Set specifically when param change in layer details triggered render
config.mask_active = false; // True when the active layer's mask is the editing target
config._internal_clipboard = null; // {data_url, x, y, width, height} last copied selection/layer
config._clipboard_position = null;
config.mouse = {};
config.mouse_lock = null;
config.swatches = {
	default: [] // Only default used right now, object format for swatch swapping in future.
};
config.user_fonts = {};
config.guides_enabled = true;
config.guides = [];
config.ruler_active = false;
config.enable_autoresize_by_default = true;

//Screen-px margin around the document on the transform-controls overlay canvas,
//so selection/transform handles stay visible even when a layer extends past the canvas edge.
config.TRANSFORM_MARGIN = 300;

// Renderer selection: 'auto' | 'canvas2d' | 'webgl'
// 'auto' tries WebGL first, falls back to Canvas 2D
config.RENDERER = 'auto';

//requires styles in reset.css
config.themes = [
	'dark',
	'light',
	'green',
];

//no-translate BEGIN
config.FONTS = [
	"Arial",
	"Courier",
	"Impact",
	"Helvetica",
	"Monospace",
	"Tahoma",
	"Times New Roman",
	"Verdana",
	"Amatic SC",
	"Arimo",
	"Codystar",
	"Creepster",
	"Indie Flower",
	"Lato",
	"Lora",
	"Merriweather",
	"Monoton",
	"Montserrat",
	"Mukta",
	"Muli",
	"Nosifer",
	"Nunito",
	"Oswald",
	"Orbitron",
	"Pacifico",
	"PT Sans",
	"PT Serif",
	"Playfair Display",
	"Poppins",
	"Raleway",
	"Roboto",
	"Rubik",
	"Special Elite",
	"Tangerine",
	"Titillium Web",
	"Ubuntu"
];
//no-translate END

config.TOOLS = [
	{
		name: 'select',
		title: 'Move Tool',
		attributes: {
			auto_select: true,
			show_transform_controls: true,
		},
		on_update: 'on_update',
	},
	{
		name: 'selection',
		title: 'Rectangular Marquee Tool',
		attributes: {},
		on_leave: 'on_leave',
		tool_group: {
			label: 'Selection Tools',
			hidden: false,
			items: [
				{
					shape: 'rect',
					title: 'Rectangular Marquee Tool',
					icon: 'selection',
				},
				{
					shape: 'ellipse',
					title: 'Elliptical Marquee Tool',
					icon: 'selection_ellipse',
				},
				{
					shape: 'lasso',
					title: 'Lasso Tool',
					icon: 'lasso',
				},
			],
		},
	},
	{
		name: 'brush',
		attributes: {
			size: 13,
			opacity: {
				value: 100,
				min: 1,
				max: 100,
				step: 1,
				slider: true,
			},
			hardness: {
				value: 100,
				min: 0,
				max: 100,
				step: 1,
				slider: true,
			},
			pressure: false,
		},
		tool_group: {
			label: 'Brush Tools',
			hidden: false,
			items: [
				{
					shape: 'brush',
					title: 'Brush Tool',
					icon: 'brush',
				},
				{
					shape: 'pencil',
					title: 'Pencil Tool',
					icon: 'pencil',
					tool: 'pencil',
				},
			],
		},
	},
	{
		name: 'pencil',
		visible: false,
		attributes: {
			size: 1,
			opacity: {
				value: 100,
				min: 1,
				max: 100,
				step: 1,
				slider: true,
			},
			pressure: false,
		},
	},
	{
		name: 'pick_color',
		attributes: {
			global: false,
		},
	},
	{
		name: 'erase',
		attributes: {
			size: 30,
			opacity: {
				value: 100,
				min: 1,
				max: 100,
				step: 1,
				slider: true,
			},
			hardness: {
				value: 100,
				min: 0,
				max: 100,
				step: 1,
				slider: true,
			},
			erase_to: {
				value: 'Auto',
				values: ['Auto', 'Transparent', 'Background Color'],
			},
			pressure: false,
		},
	},
	{
		name: 'magic_erase',
		title: 'Magic Eraser Tool',
		attributes: {
			power: 15,
			anti_aliasing: true,
			contiguous: false,
		},
	},
	{
		name: 'fill',
		attributes: {
			power: 5,
			anti_aliasing: false,
			contiguous: false,
		},
	},
	{
		name: 'shape',
		on_activate: 'on_activate',
		title: 'Shapes (H)',
		attributes: {
			size: 3,
			stroke: '#00aa00',
		},
	},
	{
		name: 'line',
		visible: false,
		attributes: {
			size: 4,
		},
	},
	{
		name: 'arrow',
		visible: false,
		attributes: {
			size: 4,
		},
	},
	{
		name: 'rectangle',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
			radius: {
				value: 0,
				min: 0,
			},
			square: false,
		},
	},
	{
		name: 'ellipse',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
			circle: false,
		},
	},
	{
		name: 'media',
		title: 'Search Images',
		on_activate: 'on_activate',
		attributes: {
			size: 30,
		},
	},
	{
		name: 'triangle',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'right_triangle',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'romb',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'parallelogram',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'trapezoid',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'plus',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'pentagon',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'hexagon',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'star',
		visible: false,
		attributes: {
			border_size: 4,
			corners: 5,
			inner_radius: 40,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'heart',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'cylinder',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'human',
		visible: false,
		attributes: {
			border_size: 4,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'tear',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'cog',
		visible: false,
		attributes: {
			fill_color: '#555555',
		},
	},
	{
		name: 'bezier_curve',
		visible: false,
		attributes: {
			size: 4,
		},
	},
	{
		name: 'moon',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'callout',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'text',
		on_update: 'on_params_update',
		attributes: {
			font: {
				value: 'Arial',
				values() {
					const user_font_names = Object.keys(config.user_fonts);
					return ['', '[Add Font...]', ...Array.from(new Set([...config.FONTS, ...user_font_names].sort()))];
				}
			},
			size: 40,
			bold: {
				value: false,
				icon: `bold.svg`
			},
			italic: {
				value: false,
				icon: `italic.svg`
			},
			underline: {
				value: false,
				icon: `underline.svg`
			},
			strikethrough: {
				value: false,
				icon: `strikethrough.svg`
			},
			fill: '#008800',
			stroke: '#000000',
			stroke_size: {
				value: 0,
				min: 0,
				step: 0.1
			},
			kerning: {
				value: 0,
				min: -999,
				max: 999,
				step: 1
			},
			leading: {
				value: 0,
				min: -999,
				max: 999,
				step: 1
			}
		},
	},
	{
		name: 'gradient',
		attributes: {
			color_1: '#008000',
			color_2: '#ffffff',
			alpha: 0,
			radial: false,
			radial_power: 50,
		},
	},
	{
		name: 'clone',
		attributes: {
			size: 30,
			anti_aliasing: true,
			source_layer: {
				value: 'Current',
				values: ['Current', 'Previous'],
			},
		},
	},
	{
		name: 'crop',
		on_update: 'on_params_update',
		on_leave: 'on_leave',
		attributes: {
			crop: true,
		},
	},
	{
		name: 'blur',
		attributes: {
			size: 30,
			strength: 1,
		},
	},
	{
		name: 'sharpen',
		attributes: {
			size: 30,
		},
	},
	{
		name: 'desaturate',
		attributes: {
			size: 50,
			anti_aliasing: true,
		},
	},
	{
		name: 'bulge_pinch',
		title: 'Bulge/Pinch Tool',
		attributes: {
			radius: 80,
			power: 50,
			bulge: true,
		},
	},
	{
		name: 'animation',
		on_activate: 'on_activate',
		on_update: 'on_params_update',
		on_leave: 'on_leave',
		attributes: {
			play: false,
			delay: 400,
		},
	},
	{
		name: 'polygon',
		visible: false,
		attributes: {
			border_size: 4,
			border: true,
			fill: true,
			border_color: '#555555',
			fill_color: '#aaaaaa',
		},
	},
	{
		name: 'pan',
		title: 'Pan Tool',
		attributes: {},
	},
];

//link to active tool
config.TOOL = config.TOOLS[2];
	
export default config;