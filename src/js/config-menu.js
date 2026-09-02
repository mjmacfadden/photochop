const menuDefinition = [
	{
		name: 'File',
		children: [
			{
				name: 'New',
				shortcut: 'Ctrl + N',
				target: 'file/new.new'
			},
			{
				divider: true
			},
			{
				name: 'Open',
				shortcut: 'Ctrl + O',
				ellipsis: true,
				target: 'file/open.open_file'
			},
			{
				name: 'Open as Layer',
				ellipsis: true,
				target: 'file/open.open_file_as_layer'
			},
			{
				name: 'Close',
				shortcut: 'Ctrl + W',
				target: 'file/close.close'
			},
			{
				name: 'Open Directory',
				ellipsis: true,
				target: 'file/open.open_dir'
			},
			{
				name: 'Open from Webcam',
				target: 'file/open.open_webcam'
			},
			{
				name: 'Open URL',
				ellipsis: true,
				target: 'file/open.open_url'
			},
			{
				name: 'Open Data URL',
				ellipsis: true,
				target: 'file/open.open_data_url'
			},
			{
				name: 'Search Images',
				ellipsis: true,
				target: 'file/open.search'
			},
			{
				divider: true
			},
			{
				name: 'Export',
				ellipsis: true,
				shortcut: 'Ctrl + S',
				target: 'file/save.export'
			},
			{
				name: 'Save As',
				ellipsis: true,
				shortcut: 'Ctrl + Shift + S',
				target: 'file/save.save'
			},
			{
				name: 'Save As Data URL',
				ellipsis: true,
				target: 'file/save.save_data_url'
			},
			{
				name: 'Print',
				ellipsis: true,
				shortcut: 'Ctrl + P',
				target: 'file/print.print'
			},
			{
				divider: true
			},
			{
				name: 'Quick Save',
				shortcut: 'F9',
				target: 'file/quicksave.quicksave'
			},
			{
				name: 'Quick Load',
				shortcut: 'F10',
				target: 'file/quickload.quickload'
			}
		]
	},
	{
		name: 'Edit',
		children: [
			{
				name: 'Undo',
				shortcut: 'Ctrl + Z',
				target: 'edit/undo.undo'
			},
			{
				name: 'Redo',
				shortcut: 'Ctrl + Shift + Z',
				target: 'edit/redo.redo'
			},
			{
				divider: true
			},
			{
				name: 'Delete Selection',
				shortcut: 'Del',
				target: 'edit/selection.delete'
			},
			{
				name: 'Fill with Foreground Color',
				shortcut: 'Alt + Del',
				target: 'edit/selection.fill_foreground'
			},
			{
				name: 'Fill with Background Color',
				shortcut: 'Ctrl + Del',
				target: 'edit/selection.fill_background'
			},
			{
				name: 'Cut',
				shortcut: 'Ctrl + X',
				target: 'edit/copy.cut_to_clipboard'
			},
			{
				name: 'Copy',
				shortcut: 'Ctrl + C',
				target: 'edit/copy.copy_to_clipboard'
			},
			{
				name: 'Copy Selection to Layer',
				shortcut: 'Ctrl + J',
				target: 'layer/new.new_selection'
			},
		{
			name: 'Paste',
			shortcut: 'Ctrl + V',
			target: 'edit/paste.paste'
		},
		{
			name: 'Paste to Fit',
			shortcut: 'Ctrl + Shift + V',
			target: 'edit/paste.paste_to_fit'
		},
		{
			divider: true
		},
			{
				name: 'Select All',
				shortcut: 'Ctrl + A',
				target: 'edit/selection.select_all'
			},
			{
				name: 'Deselect',
				shortcut: 'Ctrl + D',
				target: 'edit/selection.deselect'
			}
		]
	},
	{
		name: 'View',
		children: [
			{
				name: 'Zoom',
				children: [
					{
						name: 'Zoom In',
						shortcut: 'Ctrl + +',
						target: 'view/zoom.in'
					},
					{
						name: 'Zoom Out',
						shortcut: 'Ctrl + -',
						target: 'view/zoom.out'
					},
					{
						divider: true
					},
					{
						name: 'Original Size',
						target: 'view/zoom.original'
					},
					{
						name: 'Fit Window',
						shortcut: 'Ctrl + 0',
						target: 'view/zoom.auto'
					}
				]
			},
			{
				name: 'Grid',
				shortcut: 'G',
				target: 'view/grid.grid'
			},
			{
				name: 'Transparency Grid',
				target: 'view/transparency.toggle'
			},
			{
				name: 'Guides',
				children: [
					{
						name: 'Insert',
						ellipsis: true,
						target: 'view/guides.insert'
					},
					{
						name: 'Update',
						target: 'view/guides.update'
					},
					{
						name: 'Remove all',
						target: 'view/guides.remove'
					}
				]
			},
			{
				name: 'Ruler',
				shortcut: 'Ctrl + R',
				target: 'view/ruler.ruler'
			},
			{
				name: 'Preview',
				target: 'view/preview.preview'
			},
			{
				divider: true
			},
			{
				name: 'Full Screen',
				target: 'view/full_screen.fs'
			}
		]
	},
	{
		name: 'Image',
		children: [
			{
				name: 'Information',
				shortcut: 'I',
				ellipsis: true,
				target: 'image/information.information'
			},
			{
				name: 'Canvas Size',
				ellipsis: true,
				target: 'image/size.size'
			},
			{
				name: 'Trim',
				ellipsis: true,
				shortcut: 'T',
				target: 'image/trim.trim'
			},
			{
				divider: true
			},
			{
				name: 'Resize',
				ellipsis: true,
				shortcut: 'R',
				target: 'image/resize.resize'
			},
			{
				name: 'Rotate',
				ellipsis: true,
				target: 'image/rotate.rotate'
			},
			{
				name: 'Flip',
				children: [
					{
						name: 'Vertical',
						target: 'image/flip.vertical'
					},
					{
						name: 'Horizontal',
						target: 'image/flip.horizontal'
					}
				]
			},
			{
				name: 'Translate',
				ellipsis: true,
				target: 'image/translate.translate'
			},
			{
				name: 'Opacity',
				ellipsis: true,
				target: 'image/opacity.opacity'
			},
			{
				divider: true
			},
			{
				name: 'Color Corrections',
				ellipsis: true,
				target: 'image/color_corrections.color_corrections'
			},
			{
				name: 'Auto Adjust Colors',
				shortcut: 'F',
				target: 'image/auto_adjust.auto_adjust'
			},
			{
				name: 'Decrease Color Depth',
				target: 'image/decrease_colors.decrease_colors'
			},
			{
				name: 'Color Palette',
				ellipsis: true,
				target: 'image/palette.palette'
			},
			{
				divider: true
			},
			{
				name: 'Histogram',
				ellipsis: true,
				target: 'image/histogram.histogram'
			}
		]
	},
	{
		name: 'Layer',
		children: [
			{
				name: 'New',
				shortcut: 'Ctrl + Shift + N',
				target: 'layer/new.new'
			},
			{
				name: 'New from Selection',
				target: 'layer/new.new_selection'
			},
			{
				name: 'New Group',
				target: 'layer/group.new_group'
			},
			{
				name: 'Group Layers',
				shortcut: 'Ctrl + G',
				target: 'layer/group.group_layers'
			},
			{
				name: 'Ungroup Layers',
				shortcut: 'Ctrl + Shift + G',
				target: 'layer/group.ungroup'
			},
			{
				name: 'New Adjustment Layer',
				children: [
					{
						name: 'Brightness',
						ellipsis: true,
						target: 'layer/adjustment.brightness'
					},
					{
						name: 'Contrast',
						ellipsis: true,
						target: 'layer/adjustment.contrast'
					},
					{
						name: 'Hue Rotate',
						ellipsis: true,
						target: 'layer/adjustment.hue_rotate'
					},
					{
						name: 'Saturate',
						ellipsis: true,
						target: 'layer/adjustment.saturate'
					},
					{
						name: 'Grayscale',
						ellipsis: true,
						target: 'layer/adjustment.grayscale'
					},
					{
						name: 'Sepia',
						ellipsis: true,
						target: 'layer/adjustment.sepia'
					},
					{
						name: 'Invert (Negative)',
						ellipsis: true,
						target: 'layer/adjustment.invert'
					},
					{
						name: 'Gaussian Blur',
						ellipsis: true,
						target: 'layer/adjustment.blur'
					},
					{
						name: 'Threshold',
						ellipsis: true,
						target: 'layer/adjustment.threshold'
					}
				]
			},
			{
				divider: true
			},
			{
				name: 'Duplicate',
				shortcut: 'Ctrl + J',
				target: 'layer/duplicate.duplicate'
			},
			{
				name: 'Show / Hide',
				target: 'layer/visibility.toggle'
			},
			{
				name: 'Delete',
				target: 'layer/delete.delete'
			},
			{
				name: 'Convert to Raster',
				target: 'layer/raster.raster'
			},
			{
				divider: true
			},
			{
				name: 'Move',
				children: [
					{
						name: 'Up',
						target: 'layer/move.up'
					},
					{
						name: 'Down',
						target: 'layer/move.down'
					}
				]
			},
			{
				name: 'Create / Release Clipping Mask',
				shortcut: 'Ctrl + Alt + G',
				target: 'layer/composition.toggle_clipping_mask'
			},
			{
				name: 'Composition',
				ellipsis: true,
				target: 'layer/composition.composition'
			},
			{
				name: 'Rename',
				ellipsis: true,
				target: 'layer/rename.rename'
			},
			{
				name: 'Clear',
				target: 'layer/clear.clear'
			},
			{
				divider: true
			},
			{
				name: 'Differences Down',
				target: 'layer/differences.differences'
			},
			{
				name: 'Merge Down',
				target: 'layer/merge.merge'
			},
			{
				name: 'Flatten Image',
				target: 'layer/flatten.flatten'
			}
		]
	},
	{
		name: 'Effects',
		children: [
			{
				name: 'Effect browser',
				ellipsis: true,
				target: 'effects/browser.browser'
			},
			{
				divider: true
			},
			{
				name: 'Common Filters',
				children: [
					{
						name: 'Gaussian Blur',
						ellipsis: true,
						target: 'effects/common/blur.blur'
					},
					{
						name: 'Brightness',
						ellipsis: true,
						target: 'effects/common/brightness.brightness'
					},
					{
						name: 'Contrast',
						ellipsis: true,
						target: 'effects/common/contrast.contrast'
					},
					{
						name: 'Grayscale',
						ellipsis: true,
						target: 'effects/common/grayscale.grayscale'
					},
					{
						name: 'Hue Rotate',
						ellipsis: true,
						target: 'effects/common/hue-rotate.hue_rotate'
					},
					{
						name: 'Negative',
						ellipsis: true,
						target: 'effects/common/invert.invert'
					},
					{
						name: 'Saturate',
						ellipsis: true,
						target: 'effects/common/saturate.saturate'
					},
					{
						name: 'Sepia',
						ellipsis: true,
						target: 'effects/common/sepia.sepia'
					},
					{
						name: 'Shadow',
						ellipsis: true,
						target: 'effects/common/shadow.shadow'
					},
				]
			},
			{
				name: 'Instagram Filters',
				children: [
					{
						name: '1977',
						target: 'effects/instagram/1977.1977'
					},
					{
						name: 'Aden',
						target: 'effects/instagram/aden.aden'
					},
					{
						name: 'Clarendon',
						target: 'effects/instagram/clarendon.clarendon'
					},
					{
						name: 'Gingham',
						target: 'effects/instagram/gingham.gingham'
					},
					{
						name: 'Inkwell',
						target: 'effects/instagram/inkwell.inkwell'
					},
					{
						name: 'Lo-fi',
						target: 'effects/instagram/lofi.lofi'
					},
					{
						name: 'Toaster',
						target: 'effects/instagram/toaster.toaster'
					},
					{
						name: 'Valencia',
						target: 'effects/instagram/valencia.valencia'
					},
					{
						name: 'X-Pro II',
						target: 'effects/instagram/xpro2.xpro2'
					}
				]
			},
			{
				name: 'Black and White',
				ellipsis: true,
				target: 'effects/black_and_white.black_and_white'
			},
			{
				name: 'Borders',
				ellipsis: true,
				target: 'effects/borders.borders'
			},
			{
				name: 'Blueprint',
				target: 'effects/blueprint.blueprint'
			},
			{
				name: 'Box Blur',
				ellipsis: true,
				target: 'effects/box_blur.box_blur'
			},
			{
				name: 'Denoise',
				ellipsis: true,
				target: 'effects/denoise.denoise'
			},
			{
				name: 'Dither',
				ellipsis: true,
				target: 'effects/dither.dither'
			},
			{
				name: 'Dot Screen',
				ellipsis: true,
				target: 'effects/dot_screen.dot_screen'
			},
			{
				name: 'Edge',
				target: 'effects/edge.edge'
			},
			{
				name: 'Emboss',
				target: 'effects/emboss.emboss'
			},
			{
				name: 'Enrich',
				ellipsis: true,
				target: 'effects/enrich.enrich'
			},
			{
				name: 'Grains',
				ellipsis: true,
				target: 'effects/grains.grains'
			},
			{
				name: 'Heatmap',
				target: 'effects/heatmap.heatmap'
			},
			{
				name: 'Mosaic',
				ellipsis: true,
				target: 'effects/mosaic.mosaic'
			},
			{
				name: 'Night Vision',
				target: 'effects/night_vision.night_vision'
			},
			{
				name: 'Oil',
				ellipsis: true,
				target: 'effects/oil.oil'
			},
			{
				name: 'Pencil',
				target: 'effects/pencil.pencil'
			},
			{
				name: 'Sharpen',
				ellipsis: true,
				target: 'effects/sharpen.sharpen'
			},
			{
				name: 'Solarize',
				target: 'effects/solarize.solarize'
			},
			{
				name: 'Tilt Shift',
				ellipsis: true,
				target: 'effects/tilt_shift.tilt_shift'
			},
			{
				name: 'Vignette',
				ellipsis: true,
				target: 'effects/vignette.vignette'
			},
			{
				name: 'Vibrance',
				ellipsis: true,
				target: 'effects/vibrance.vibrance'
			},
			{
				name: 'Vintage',
				ellipsis: true,
				target: 'effects/vintage.vintage'
			},
			{
				name: 'Zoom Blur',
				ellipsis: true,
				target: 'effects/zoom_blur.zoom_blur'
			}
		]
	},
	{
		name: 'Tools',
		children: [
			{
				name: 'Sprites',
				target: 'tools/sprites.sprites'
			},
			{
				name: 'Key-Points',
				target: 'tools/keypoints.keypoints'
			},
			{
				name: 'Content Fill',
				ellipsis: true,
				target: 'tools/content_fill.content_fill'
			},
			{
				divider: true
			},
			{
				name: 'Color Zoom',
				ellipsis: true,
				target: 'tools/color_zoom.color_zoom'
			},
			{
				name: 'Replace Color',
				ellipsis: true,
				target: 'tools/replace_color.replace_color'
			},
			{
				name: 'Restore Alpha',
				ellipsis: true,
				target: 'tools/restore_alpha.restore_alpha'
			},
			{
				name: 'External',
				children: [
					{
						name: 'TINYPNG - Compress PNG and JPEG',
						href: 'https://tinypng.com'
					},
					{
						name: 'REMOVE.BG - Remove Image Background',
						href: 'https://www.remove.bg'
					},
					{
						name: 'PNGTOSVG - Convert Image to SVG',
						href: 'https://www.pngtosvg.com'
					},
					{
						name: 'SQUOOSH - Compress and Compare Images',
						href: 'https://squoosh.app'
					}
				]
			},
			{
				divider: true
			},
			{
				name: 'Language',
				children: [
					{
						name: 'English',
						target: 'tools/translate.translate',
						parameter: 'en',
					},
					{
						divider: true
					},
					{
						//Arabic
						name: 'عربي',
						target: 'tools/translate.translate',
						parameter: 'ar',
					},
					{
						//Chinese simplified
						name: '简体中文',
						target: 'tools/translate.translate',
						parameter: 'zh',
					},
					{
						name: 'Deutsch',
						target: 'tools/translate.translate',
						parameter: 'de',
					},
					{
						name: 'Dutch',
						target: 'tools/translate.translate',
						parameter: 'nl',
					},
					{
						name: 'English (UK)',
						target: 'tools/translate.translate',
						parameter: 'uk',
					},
					{
						name: 'Español',
						target: 'tools/translate.translate',
						parameter: 'es',
					},
					{
						name: 'Français',
						target: 'tools/translate.translate',
						parameter: 'fr',
					},
					{
						name: 'Greek',
						target: 'tools/translate.translate',
						parameter: 'el',
					},
					{
						name: 'Italiano',
						target: 'tools/translate.translate',
						parameter: 'it',
					},
					{
						//Japanese
						name: '日本語',
						target: 'tools/translate.translate',
						parameter: 'ja',
					},
					{
						//Korean
						name: '한국어',
						target: 'tools/translate.translate',
						parameter: 'ko',
					},
					{
						name: 'Lietuvių',
						target: 'tools/translate.translate',
						parameter: 'lt',
					},
					{
						name: 'Português',
						target: 'tools/translate.translate',
						parameter: 'pt',
					},
					{
						name: 'русский язык',
						target: 'tools/translate.translate',
						parameter: 'ru',
					},
					{
						name: 'Türkçe',
						target: 'tools/translate.translate',
						parameter: 'tr',
					}
				]
			},
			{
				name: 'Search',
				shortcut: 'F3',
				ellipsis: true,
				target: 'tools/search.search'
			},
			{
				name: 'Settings',
				ellipsis: true,
				target: 'tools/settings.settings'
			}
		]
	},
	{
		name: 'Window',
		children: [
			{
				name: 'Adjustments',
				target: 'window/toggle.toggle',
				parameter: 'adjustments',
				check: () => {
					const node = document.querySelector('.sidebar_right .adjustments.block');
					return node != null && !node.classList.contains('hidden');
				}
			},
			{
				name: 'Colors',
				target: 'window/toggle.toggle',
				parameter: 'colors',
				check: () => {
					const node = document.querySelector('.sidebar_right .colors.block');
					return node != null && !node.classList.contains('hidden');
				}
			},
			{
				name: 'Layers',
				target: 'window/toggle.toggle',
				parameter: 'layers',
				check: () => {
					const node = document.querySelector('.sidebar_right .layers.block');
					return node != null && !node.classList.contains('hidden');
				}
			},
			{
				name: 'Layer Details',
				target: 'window/toggle.toggle',
				parameter: 'details',
				check: () => {
					const node = document.querySelector('.sidebar_right .details.block');
					return node != null && !node.classList.contains('hidden');
				}
			},
			{
				name: 'Preview',
				target: 'window/toggle.toggle',
				parameter: 'preview',
				check: () => {
					const node = document.querySelector('.sidebar_right .preview.block');
					return node != null && !node.classList.contains('hidden');
				}
			}
		]
	},
	{
		name: 'Help',
		children: [
			{
				name: 'Keyboard Shortcuts',
				ellipsis: true,
				target: 'help/shortcuts.shortcuts'
			},
			{
				name: 'Report Issues',
				href: 'https://github.com/viliusle/miniPaint/issues'
			},
			{
				divider: true
			},
			{
				name: 'About',
				ellipsis: true,
				target: 'help/about.about'
			}
		]
	}
];


export default menuDefinition;