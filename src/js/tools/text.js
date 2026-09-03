import app from './../app.js';
import config from './../config.js';
import zoomView from './../libs/zoomView.js';
import Base_tools_class from './../core/base-tools.js';
import Base_selection_class from './../core/base-selection.js';
import Base_layers_class from './../core/base-layers.js';
import GUI_tools_class from './../core/gui/gui-tools.js';
import Helper_class from './../libs/helpers.js';
import Dialog_class from './../libs/popup.js';
import WebFont from 'webfontloader';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * TODO
 * - Add leading, superscript, subscript
 * - Implement text direction (right to left, top to bottom, etc.); currently partial implementation
 * - Allow search & add google fonts
 * - Undo history
 */

// Default text styling
// WARNING - changing this could break backwards compatibility!
// Defaults aren't saved in text layer in order to reduce data size and increase meta comparison performance.
export const metaDefaults = {
	size: 38,
	family: 'Roboto',
	kerning: 0,
	leading: 0,
	bold: false,
	italic: false,
	underline: false,
	strikethrough: false,
	fill_color: '#008000',
	stroke_size: 0,
	stroke_color: '#000000'
};

const LOREM_IPSUM = 'Lorem ipsum';

// Global map of font name to font metrics information.
const fontMetricsMap = new Map();
const layerEditors = new WeakMap();
const fontLoadPromiseMap = new Map();
const fontLoadMap = new Map();
const localFontDataMap = new Map();
fontLoadMap.set('Arial', true);
fontLoadMap.set('Courier', true);
fontLoadMap.set('Impact', true);
fontLoadMap.set('Helvetica', true);
fontLoadMap.set('Monospace', true);
fontLoadMap.set('Tahoma', true);
fontLoadMap.set('Times New Roman', true);
fontLoadMap.set('Verdana', true);

function load_local_font({ family }, successCallback) {
	if (fontLoadMap.get(family) == null) {
		fontLoadMap.set(family, false);
		const localFont = localFontDataMap.get(family);
		const loadPromise = localFont ? localFont.blob().then((blob) => {
			const fontFace = new FontFace(family, blob);
			return fontFace.load().then((loadedFont) => {
				document.fonts.add(loadedFont);
				fontLoadMap.set(family, true);
				fontLoadPromiseMap.delete(family);
			});
		}).catch(() => {
			fontLoadPromiseMap.delete(family);
			alertify.error('Font ' + family + ' could not be loaded.');
		}) : Promise.resolve().then(() => {
			throw new Error('Local font data is unavailable');
		}).catch(() => {
			fontLoadPromiseMap.delete(family);
		});
		fontLoadPromiseMap.set(family, loadPromise);
	}
	if (successCallback) {
		const loadPromise = fontLoadPromiseMap.get(family);
		if (loadPromise) {
			loadPromise.then(successCallback);
		} else if (fontLoadMap.get(family) == true) {
			requestAnimationFrame(() => {
				successCallback();
			});
		}
	}
}

function load_font_family({ family, variants, source }, successCallback) {
	if (source === 'local') {
		load_local_font({ family }, successCallback);
		return;
	}
	if (fontLoadMap.get(family) == null) {
		fontLoadMap.set(family, false);
		const loadPromise = new Promise((resolve, reject) => {
			WebFont.load({
				google: {
					families: [family + (variants ? ':' + variants.join(',') : '')]
				},
				fontactive: (family) => {
					fontLoadMap.set(family, true);
					fontLoadPromiseMap.delete(family);
					resolve();
				},
				fontinactive: (family) => {
					alertify.error('Font ' + family + ' could not be loaded.');
					fontLoadPromiseMap.delete(family);
					reject();
				}
			});
		});
		fontLoadPromiseMap.set(family, loadPromise);
	}
	if (successCallback) {
		const loadPromise = fontLoadPromiseMap.get(family);
		if (loadPromise) {
			loadPromise.then(successCallback);
		} else if (fontLoadMap.get(family) == true) {
			requestAnimationFrame(() => {
				successCallback();
			});
		}
	}
}

/**
 * The canvas's native font metrics implementation doesn't really give us enough information...
 */
const kerningTestCanvas = document.createElement('canvas');
kerningTestCanvas.width = 10;
kerningTestCanvas.height = 10;
kerningTestCanvas.style = 'font-kerning: normal; text-rendering: optimizeLegibility;';
const kerningTestCtx = kerningTestCanvas.getContext('2d');
class Font_metrics_class {
	constructor(family, size) {
		this.family = family || (family = "Arial");
		this.size = parseFloat(size) || (size = 12);
		this.kerningMap = new Map();

		// Preparing container
		const line = document.createElement('div');
		const body = document.body;
		line.style.position = 'absolute';
		line.style.whiteSpace = 'nowrap';
		line.style.font = size + 'px ' + family;
		body.appendChild(line);

		// Now we can measure width and height of the letter
		const text = '——————————'; // 10 symbols to be more accurate with width
		line.innerHTML = text;
		this.width = line.offsetWidth / text.length;
		this.height = line.offsetHeight;

		// Now creating 1px sized item that will be aligned to baseline
		// to calculate baseline shift
		const baseline = document.createElement('span');
		baseline.style.display = 'inline-block';
		baseline.style.overflow = 'hidden';
		baseline.style.width = '1px';
		baseline.style.height = '1px';
		line.appendChild(baseline);

		// Baseline is important for positioning text on canvas
		this.baseline = baseline.offsetTop + baseline.offsetHeight;

		document.body.removeChild(line);
	}

	/**
	 * Attempts to determine the height of a letter via pixel comparison
	 * @param {string} letter - The letter to check
	 * @param {string} [baseline] - Baseline position override
	 */
	calculate_letter_bounds(letter, baseline) {
		baseline = baseline || 'alphabetic'
		kerningTestCanvas.width = this.width;
		kerningTestCanvas.height = this.height;
		kerningTestCtx.clearRect(0, 0, this.width, this.height);
		kerningTestCtx.font =
		' ' + (this.size) + 'px' +
		' ' + this.family;
		kerningTestCtx.textAlign = 'left';
		kerningTestCtx.textBaseline = baseline;
		kerningTestCtx.fillStyle = '#000000';
		kerningTestCtx.fillText(letter, 0, baseline === 'alphabetic' ? this.baseline : 0);
		const pixels = kerningTestCtx.getImageData(0, 0, this.width, this.height).data;
		const pixelLength = pixels.length;
		let start = 0;
		let end = this.height;
		for (let i = 0; i < pixelLength; i += 4) {
			if (pixels[i + 3] !== 0) {
				start = Math.floor(i / 4 / this.width);
				break;
			}
		}
		for (let i = pixelLength - 4; i >= 0; i -= 4) {
			if (pixels[i + 3] !== 0) {
				end = Math.floor(i / 4 / this.width);
				break;
			}
		}
		kerningTestCanvas.width = 10;
		kerningTestCanvas.height = 10;
		return {
			top: start,
			bottom: end,
			height: end - start
		}
	}

	/**
	 * Calculate the kerning offset between two letters.
	 * @param {string} letters - a two character string of the two letters to determine font kerning from. Returns the kerning offset that should be used to draw the 2nd letter. 
	 * @param {object} flags - font style, such as bold or italic
	 */
	get_kerning_offset(letters, flags = {}) {
		let offset = this.kerningMap.get(letters);
		if (offset == null) {
			kerningTestCtx.font =
			' ' + (flags.italic ? 'italic' : '') +
			' ' + (flags.bold ? 'bold' : '') +
			' ' + (this.size) + 'px' +
			' ' + this.family;
			offset = kerningTestCtx.measureText(letters).width - (kerningTestCtx.measureText(letters[0]).width + kerningTestCtx.measureText(letters[1]).width);
			this.kerningMap.set(letters, offset);
		}
		return offset;
	}
}

/**
 * This class's job is to store and modify the internal JSON format of a text layer.
 */
class Text_document_class {
	constructor() {
		this.lines = [];
		this.on_change = null;

		// If user edits params while no selection, queue meta insertion for next type.
		this.queuedMetaChanges = null;
	}

	/**
	 * Returns the number of lines in the document.
	 */
	get_line_count() {
		return this.lines.length;
	}

	/**
	 * Returns the length of a given line
	 * @param {number} lineNumber - The number of the line to get the length of
	 */
	get_line_character_count(lineNumber) {
		return this.get_line_text(lineNumber).length;
	}
	
	/**
	 * Returns the text string at a given line (ignores formatting).
	 * @param {number} lineNumber - The number of the line to get the text from
	 */
	get_line_text(lineNumber) {
		let lineText = '';
		for (let i = 0; i < this.lines[lineNumber].length; i++) {
			lineText += this.lines[lineNumber][i].text;
		}
		return lineText;
	}
	
	/**
	 * Returns the position of the end of the the word at the line/character provided
	 * @param {number} line - The reference line number (0 indexed) 
	 * @param {number} character - The reference character position (0 indexed)
	 * @param {boolean} noJump - Dont jump to the next word if at the end of current one
	 */
	get_word_end_position(line, character, noJump) {
		let newLine = line;
		let newCharacter = character;
		let fullText = this.get_line_text(newLine);
		if (character === fullText.length && newLine < this.lines.length - 1) {
			if (noJump) {
				return { line, character };
			}
			newLine += 1;
			character = 0;
			fullText = this.get_line_text(newLine);
		}
		const text = fullText.slice(character);
		if (noJump && text[0] === ' ') {
			return { line, character };
		}
		for (let i = 1; i < text.length; i++) {
			if (text[i] === ' ') {
				newCharacter = character + i;
				break;
			}
		}
		if (newCharacter === character) {
			newCharacter = fullText.length + 1;
		}
		return {
			line: newLine,
			character: newCharacter
		}
	}

	/**
	 * Returns the position of the start of the the word at the line/character provided
	 * @param {number} line - The reference line number (0 indexed) 
	 * @param {number} character - The reference character position (0 indexed)
	 * @param {boolean} noJump - Dont jump to the next word if at the end of current one
	 */
	get_word_start_position(line, character, noJump) {
		let newLine = line;
		let newCharacter = character;
		let isWrap = false;
		if (character === 0 && newLine > 0) {
			if (noJump) {
				return { line, character };
			}
			isWrap = true;
			newLine -= 1;
		}
		const fullText = this.get_line_text(newLine);
		if (isWrap) {
			character = fullText.length;
		}
		const text = fullText.slice(0, character);
		if (noJump && text[text.length - 1] === ' ') {
			return { line, character };
		}
		for (let i = -1; i >= -text.length; i--) {
			if (text[i + text.length - 1] === ' ') {
				newCharacter = character + i;
				break;
			}
		}
		if (newCharacter === character) {
			newCharacter = 0;
		}
		return {
			line: newLine,
			character: newCharacter
		}
	}
	
	/**
	 * Determine if the metadata (formatting) of two text spans is the same, usually used to determine if the spans can be merged together.
	 */
	is_same_span_meta(meta1, meta2) {
		const meta1Keys = Object.keys(meta1).sort();
		const meta2Keys = Object.keys(meta2).sort();
		if (meta1Keys.length !== meta2Keys.length) {
			return false;
		}
		for (let i = 0; i < meta1Keys.length; i++) {
			if (meta1Keys[i] !== meta2Keys[i]) {
				return false;
			}
			const meta1Value = meta1[meta1Keys[i]];
			const meta2Value = meta2[meta2Keys[i]];
			if (JSON.stringify(meta1Value) !== JSON.stringify(meta2Value)) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Inserts a span with empty text in the document at the specified line and character position
	 * @param {number} line - The line number to insert at (0 indexed) 
	 * @param {number} character - The character position to insert at (0 indexed)
	 * @param {object} meta - Metadata to associate with span
	 */
	insert_empty_span(line, character, meta) {
		let insertedSpan = null;
		const lineDef = this.lines[line];
		let newLine = [];
		let spanStartCharacter = 0;
		let wasInserted = false;
		for (let span of lineDef) {
			if (!wasInserted && character >= spanStartCharacter && character <= spanStartCharacter + span.text.length) {
				let textBefore = span.text.slice(0, character - spanStartCharacter);
				let textAfter = span.text.slice(character - spanStartCharacter);
				if (textBefore.length > 0) {
					newLine.push({
						text: textBefore,
						meta: JSON.parse(JSON.stringify(span.meta))
					});
				}
				const newMeta = JSON.parse(JSON.stringify(span.meta));
				for (let metaKey in meta) {
					newMeta[metaKey] = meta[metaKey];
				}
				insertedSpan = {
					text: '',
					meta: newMeta
				};
				newLine.push(insertedSpan);
				if (textAfter.length > 0) {
					newLine.push({
						text: textAfter,
						meta: JSON.parse(JSON.stringify(span.meta))
					});
				}
				wasInserted = true;
			} else {
				newLine.push(span);
			}
			spanStartCharacter += span.text.length;
		}
		this.lines[line] = newLine;
		return insertedSpan;
	}
	
	/**
	 * Inserts a text string in the document at the specified line and character position
	 * @param {string} text - The text string to insert
	 * @param {number} line - The line number to insert at (0 indexed) 
	 * @param {number} character - The character position to insert at (0 indexed)
	 */
	insert_text(text, line, character) {

		let insertedSpan;
		if (this.queuedMetaChanges) {
			insertedSpan = this.insert_empty_span(line, character, this.queuedMetaChanges);
			this.queuedMetaChanges = null;
		}

		const insertLine = this.lines[line];
		const textHasNewline = text.includes('\n');
		let characterCount = 0;
		let modifyingSpan = null;
		let previousSpans = [];
		let nextSpans = [];
		let newLine = line;
		let newCharacter = character;

		// Insert text into span at specified line/character
		for (let i = 0; i < insertLine.length; i++) {
			const span = insertLine[i];
			const spanLength = span.text.length;
			if (!modifyingSpan && (character > characterCount || character === 0) && character <= characterCount + spanLength) {
				if (insertLine[i + 1] && insertLine[i + 1].text === '') {
					modifyingSpan = insertLine[i + 1];
				} else {
					modifyingSpan = span;
				}
				const textIdx = character - characterCount;
				modifyingSpan.text = modifyingSpan.text.slice(0, textIdx) + text + modifyingSpan.text.slice(textIdx);
				if (!textHasNewline) {
					newCharacter = characterCount + textIdx + text.length;
					break;
				}
			} else if (textHasNewline) {
				if (modifyingSpan) {
					nextSpans.push(span);
				} else {
					previousSpans.push(span);
				}
			}
			characterCount += spanLength;
		}

		// Create new lines if newline character was used
		if (textHasNewline && modifyingSpan) {
			const modifiedSpans = [];
			const textLines = modifyingSpan.text.split('\n');
			for (let i = 0; i < textLines.length; i++) {
				modifiedSpans.push({
					meta: JSON.parse(JSON.stringify(modifyingSpan.meta)),
					text: textLines[i]
				});
			}
			this.lines[line] = [...previousSpans, modifiedSpans.shift()];
			for (let i = 0; i < modifiedSpans.length; i++) {
				if (i === modifiedSpans.length - 1) {
					if (!modifiedSpans[i].text && nextSpans.length > 0) {
						this.lines.splice(line + i + 1, 0, nextSpans);
					} else {
						this.lines.splice(line + i + 1, 0, [modifiedSpans[i], ...nextSpans]);
					}
					newLine = line + i + 1;
					newCharacter = text.length - 1 - text.lastIndexOf('\n');
				} else {
					this.lines.splice(line + i + 1, 0, [modifiedSpans[i]]);
				}
			}
		}

		// Notify change
		if (this.on_change) {
			this.on_change(this.lines);
		}

		// Return end position
		return {
			line: newLine,
			character: newCharacter
		};
	}
	
	/**
	 * Deletes text withing the specified range
	 * @param {number} startLine - The starting line of the text range
	 * @param {number} startCharacter - The character position at the starting line of the text range
	 * @param {number} endLine - The ending line of the text range
	 * @param {number} endCharacter - The character position at the ending line of the text range
	 */
	delete_range(startLine, startCharacter, endLine, endCharacter) {
		// Check bounds
		startLine >= 0 || (startLine = 0);
		startCharacter >= 0 || (startCharacter = 0);
		endLine < this.lines.length || (endLine = this.lines.length - 1);
		const endLineCharacterCount = this.get_line_character_count(endLine);
		endCharacter <= endLineCharacterCount || (
			endCharacter = endLineCharacterCount
		);

		// Early return if there's nothing to delete
		if (startLine === endLine && startCharacter === endCharacter) {
			return {
				line: startLine,
				character: startCharacter
			};
		}

		// Get spans in start line before range
		const beforeSpans = [];
		const afterSpans = [];
		let characterCount = 0;
		let startSpan = null;
		let startSpanDeleteIndex = 0;
		for (let i = 0; i < this.lines[startLine].length; i++) {
			const span = this.lines[startLine][i];
			const spanLength = span.text.length;
			if (!startSpan && (startCharacter > characterCount || startCharacter === 0) && startCharacter <= characterCount + spanLength) {
				startSpan = span;
				startSpanDeleteIndex = Math.max(0, startCharacter - characterCount);
				break;
			}
			if (!startSpan) {
				beforeSpans.push(span);
			}
			characterCount += spanLength;
		}

		// Get spans in end line after range
		characterCount = 0;
		let endSpan = null;    
		let endSpanDeleteIndex = 0;
		for (let i = 0; i < this.lines[endLine].length; i++) {
			const span = this.lines[endLine][i];
			const spanLength = span.text.length;
			if (!endSpan && (endCharacter > characterCount || endCharacter === 0) && endCharacter <= characterCount + spanLength) {
				endSpan = span;
				endSpanDeleteIndex = Math.max(0, endCharacter - characterCount);
			}
			else if (endSpan) {
				afterSpans.push(span);
			}
			characterCount += spanLength;
		}

		// Merge start and end lines
		this.lines[startLine] = [...beforeSpans];
		if (startSpan === endSpan || this.is_same_span_meta(startSpan.meta, endSpan.meta)) {
			const combinedSpans = {
				meta: startSpan.meta,
				text: startSpan.text.slice(0, startSpanDeleteIndex) + endSpan.text.slice(endSpanDeleteIndex)
			};
			if (combinedSpans.text || (beforeSpans.length === 0 && afterSpans.length === 0)) {
				this.lines[startLine].push(combinedSpans);
			}
		} else {
			const middleSpans = [];
			let isAddedStartSpan = false;
			let isAddedEndSpan = false;
			if (startSpan) {
				startSpan.text = startSpan.text.slice(0, startSpanDeleteIndex);
				if (startSpan.text) {
					middleSpans.push(startSpan);
					isAddedStartSpan = true;
				}
			}
			if (endSpan) {
				endSpan.text = endSpan.text.slice(endSpanDeleteIndex)
				if (endSpan.text || middleSpans.length === 0) {
					middleSpans.push(endSpan);
					isAddedEndSpan = true;
				}
			}
			if (isAddedStartSpan && !isAddedEndSpan) {
				const afterSpan = afterSpans[0];
				if (afterSpan && this.is_same_span_meta(startSpan.meta, afterSpan.meta)) {
					afterSpans.shift();
					startSpan.text += afterSpan.text;
				}
			}
			else if (isAddedEndSpan && !isAddedStartSpan) {
				const beforeSpan = beforeSpans[beforeSpans.length - 1];
				if (beforeSpan && this.is_same_span_meta(beforeSpan.meta, endSpan.meta)) {
					beforeSpans.pop();
					beforeSpan.text += endSpan.text;
				}
			}
			else if (middleSpans.length === 0) {
				const beforeSpan = beforeSpans[beforeSpans.length - 1];
				const afterSpan = afterSpans[0];
				if (beforeSpan && afterSpan && this.is_same_span_meta(beforeSpan.meta, afterSpan.meta)) {
					afterSpans.shift();
					beforeSpan.text += afterSpan.text;
				}
			}
			this.lines[startLine] = this.lines[startLine].concat(middleSpans);
		}
		this.lines[startLine] = this.lines[startLine].concat(afterSpans);

		// Delete lines in-between range
		this.lines.splice(startLine + 1, endLine - startLine);

		// Notify change
		if (this.on_change) {
			this.on_change(this.lines);
		}

		// Return new position
		return {
			line: startLine,
			character: startCharacter
		};
	}
	
	/**
	 * Deletes a single character in front or behind the specified character position, handling deleting new lines, etc.
	 * @param {boolean} forward - True if deleting the next character, otherwise deletes the previous character
	 * @param {number} startLine - The line number to delete from
	 * @param {number} startCharacter - The character position to delete from
	 */
	delete_character(forward, startLine, startCharacter) {
		let endLine = startLine;
		let endCharacter = startCharacter;
		
		// Delete forwards
		if (forward) {
			// If there are characters after cursor on this line we remove one
			if (startCharacter < this.get_line_character_count(startLine)) {
				++endCharacter;
			}
			// if there are Lines after this one we append it
			else if (startLine < this.lines.length - 1) {
				++endLine;
				endCharacter = 0;
			}
		}
		// Delete backwards
		else {
			// If there are characters before the cursor on this line we remove one
			if (startCharacter > 0) {
				--startCharacter;
			}
			// if there are rows before we append current to previous one
			else if (startLine > 0) {
				--startLine;
				startCharacter = this.get_line_character_count(startLine);
			}
		}

		return this.delete_range(startLine, startCharacter, endLine, endCharacter);
	}
	
	/**
	 * Retrieves a metadata summary object for the specified range of text. 
	 * @param {number} startLine - The starting line of the text range
	 * @param {number} startCharacter - The character position at the starting line of the text range
	 * @param {number} endLine - The ending line of the text range
	 * @param {number} endCharacter - The character position at the ending line of the text range
	 */
	get_meta_range(startLine, startCharacter, endLine, endCharacter) {
		// Check bounds
		startLine >= 0 || (startLine = 0);
		startCharacter >= 0 || (startCharacter = 0);
		endLine < this.lines.length || (endLine = this.lines.length - 1);
		const endLineCharacterCount = this.get_line_character_count(endLine);
		endCharacter <= endLineCharacterCount || (
			endCharacter = endLineCharacterCount
		);
		const isEmpty = startLine === endLine && startCharacter === endCharacter;

		// Loop through all spans in range and collect meta values
		const metaCollection = {};
		for (const metaKey in metaDefaults) {
			metaCollection[metaKey] = [];
		}
		let isInsideRange = false;
		for (let lineIndex = startLine; lineIndex <= endLine; lineIndex++) {
			const line = this.lines[lineIndex];
			let spanStartCharacter = 0;
			let startSpan = null;
			let endSpan = null;
			for (let spanIndex = 0; spanIndex < line.length; spanIndex++) {
				const span = line[spanIndex];
				if (lineIndex === startLine) {
					if (
						(!isEmpty && startCharacter >= spanStartCharacter && startCharacter < spanStartCharacter + span.text.length) ||
						(isEmpty && startCharacter > spanStartCharacter && startCharacter <= spanStartCharacter + span.text.length) ||
						(startCharacter === 0 && spanStartCharacter === 0)
					) {
						isInsideRange = true;
						startSpan = span;
					}
				}
				if (lineIndex === endLine && isInsideRange) {
					if (
						(!isEmpty && endCharacter <= spanStartCharacter + span.text.length) ||
						(isEmpty && endCharacter < spanStartCharacter + span.text.length)
					) {
						endSpan = span;
						isInsideRange = false;
					}
				}
				if (isInsideRange || startSpan === span || (!isEmpty && endSpan === span)) {
					for (const metaKey in metaCollection) {
						let metaValue = span.meta[metaKey];
						if (metaValue == null) {
							metaValue = metaDefaults[metaKey];
						}
						if (!metaCollection[metaKey].includes(metaValue)) {
							metaCollection[metaKey].push(metaValue);
						}
					}
				}
				spanStartCharacter += span.text.length;
			}
		}

		// Fill in default values for undefined meta keys
		for (const metaKey in metaDefaults) {
			if (metaCollection[metaKey].length === 0) {
				metaCollection[metaKey] = [metaDefaults[metaKey]];
			}
		}
		return metaCollection;
	}

	/**
	 * Sets styling metadata for the specified range of text. 
	 * @param {number} startLine - The starting line of the text range
	 * @param {number} startCharacter - The character position at the starting line of the text range
	 * @param {number} endLine - The ending line of the text range
	 * @param {number} endCharacter - The character position at the ending line of the text range
	 * @param {object} meta - The meta to set
	 */
	set_meta_range(startLine, startCharacter, endLine, endCharacter, meta) {
		// Check bounds
		startLine >= 0 || (startLine = 0);
		startCharacter >= 0 || (startCharacter = 0);
		endLine < this.lines.length || (endLine = this.lines.length - 1);
		const endLineCharacterCount = this.get_line_character_count(endLine);
		endCharacter <= endLineCharacterCount || (
			endCharacter = endLineCharacterCount
		);

		// Set meta of spans in selection
		let isInsideRange = false;
		for (let lineIndex = startLine; lineIndex <= endLine; lineIndex++) {
			const line = this.lines[lineIndex];
			let newLine = [];
			let spanStartCharacter = 0;
			for (let span of line) {
				const spanText = span.text;
				const spanLength = spanText.length;
				if (lineIndex === startLine) {
					if (startCharacter <= spanStartCharacter) {
						isInsideRange = true;
					}
				}
				if (lineIndex === endLine) {
					if (endCharacter < spanStartCharacter + spanLength) {
						isInsideRange = false;
					}
				}
				// Selection start splits the span it's inside of
				let choppedStartCharacters = 0;
				if (startCharacter > spanStartCharacter && startCharacter < spanStartCharacter + spanLength && lineIndex === startLine) {
					choppedStartCharacters = startCharacter - spanStartCharacter;
					newLine.push({
						text: span.text.slice(0, startCharacter - spanStartCharacter),
						meta: JSON.parse(JSON.stringify(span.meta))
					});
					span.text = span.text.slice(startCharacter - spanStartCharacter);
					isInsideRange = true;
				}
				newLine.push(span);
				// Selection end splits the span it's inside of
				if (endCharacter > spanStartCharacter && endCharacter < spanStartCharacter + spanLength && lineIndex === endLine) {
					newLine.push({
						text: span.text.slice(endCharacter - spanStartCharacter - choppedStartCharacters),
						meta: JSON.parse(JSON.stringify(span.meta))
					});
					span.text = span.text.slice(0, endCharacter - spanStartCharacter - choppedStartCharacters);
					isInsideRange = true;
				}
				// Add meta to span
				if (isInsideRange) {
					for (const metaKey in meta) {
						span.meta[metaKey] = meta[metaKey];
					}
				}
				spanStartCharacter += spanLength;
			}
			this.lines[lineIndex] = newLine;
		}

		this.normalize(startLine, endLine);

		// Notify change
		if (this.on_change) {
			this.on_change(this.lines);
		}
	}

	/**
	 * Merges sibling spans that have the same metadata, and removes empty spans. 
	 * @param {number} startLine - The starting line of the text range
	 * @param {number} endLine - The ending line of the text range
	 */
	normalize(startLine, endLine) {
		for (let lineIndex = startLine; lineIndex <= endLine; lineIndex++) {
			const line = this.lines[lineIndex];
			let spanIndex = 0;
			for (spanIndex = 0; spanIndex < line.length; spanIndex++) {
				const span1 = line[spanIndex];
				const span2 = line[spanIndex + 1];
				if (span1 && span2 && this.is_same_span_meta(span1.meta, span2.meta)) {
					line[spanIndex] = {
						text: span1.text + span2.text,
						meta: span1.meta
					};
					line.splice(spanIndex + 1, 1);
					spanIndex--;
					continue;
				}
				if (span1.text === '' && line.length > 1) {
					line.splice(spanIndex, 1);
					spanIndex--;
					continue;
				}
			}
		}
	}

}


/**
 * This class represents a single selection range in a text editor's document.
 */
class Text_selection_class {
	constructor(/* Text_editor_class */ editor) {
		this.editor = editor;
		this.isVisible = false;
		this.isCursorVisible = false;
		this.isActiveSideEnd = true;
		this.isBlinkVisible = true;
		this.blinkInterval = 500;

		this.start = {
			line: 0,
			character: 0
		};
		
		this.end = {
			line: 0,
			character: 0
		};

		this.set_position(0, 0);
	}
	
	/**
	 * Returns if the current text selection contains no characters
	 * @returns {boolean}
	 */
	is_empty() {
		return this.compare_position(this.start.line, this.start.character, this.end.line, this.end.character) === 0;
	}
	
	/**
	 * Determines the relative position of two line/character sets.
	 * @param {number} line1
	 * @param {number} character1 
	 * @param {number} line2 
	 * @param {number} character2
	 * @returns {number} -1 if line1/character1 is less than line2/character2, 1 if greater, and 0 if equal
	 */
	compare_position(line1, character1, line2, character2) {
		if (line1 < line2) {
			return -1;
		} else if (line1 > line2) {
			return 1;
		} else {
			if (character1 < character2) {
				return -1;
			} else if (character1 > character2) {
				return 1;
			} else {
				return 0;
			}
		}
	}
	
	/**
	 * Sets the head position of the selection to the specified line/character, optionally extends to selection to that position.
	 * @param {number} line - The line number to set the selection to 
	 * @param {number} character - The character index to set the selection to
	 * @param {boolean} [keepSelection] - If true, extends the current selection to the specified position. If false or undefined, sets an empty selection at that position. 
	 */
	set_position(line, character, keepSelection) {
		if (line == null) {
			line = this.end.line;
		}
		if (character == null) {
			character = this.end.character;
		}

		// Check lower bounds
		line >= 0 || (line = 0);
		character >= 0 || (character = 0);

		// Check upper bounds
		const lineCount = this.editor.document.get_line_count();
		line < lineCount || (line = lineCount - 1);
		const lineCharacterCount = this.editor.document.get_line_character_count(line);
		character <= lineCharacterCount || (character = lineCharacterCount);

		// Add to selection
		if (keepSelection) {
			const positionCompare = this.compare_position(
				line,
				character,
				this.start.line,
				this.start.character
			);

			// Determine whether we should make the start side of the range active, selection moving left or up.
			if (positionCompare === -1 && (this.is_empty() || line < this.start.line)) {
				this.isActiveSideEnd = false;
			}

			// Assign new value to the side that is active
			if (this.isActiveSideEnd) {
				this.end.line = line;
				this.end.character = character;
			} else {
				this.start.line = line;
				this.start.character = character;
			}

			// Making sure that end is greater than start and swap if necessary
			if (this.compare_position(this.start.line, this.start.character, this.end.line, this.end.character) > 0) {
				this.isActiveSideEnd = !this.isActiveSideEnd;
				const temp = {
					line: this.start.line,
					character: this.start.character
				}
				this.start.line = this.end.line;
				this.start.character = this.end.character;
				this.end.line = temp.line;
				this.end.character = temp.character;
			}
		}
		// Empty cursor move
		else {
			this.isActiveSideEnd = true;
			this.start.line = this.end.line = line;
			this.start.character = this.end.character = character;
		}

		// Reset cursor blink
		this.isBlinkVisible = true;
		if (this.isVisible) {
			this.start_blinking();
		}
	}
	
	/**
	 * Retrieves the position of the head of the selection (could be the start or end of the selection based on previous operations)
	 * @returns {object} - { line, character }
	 */
	get_position() {
		if (this.isActiveSideEnd) {
			return {
				character: this.end.character,
				line: this.end.line
			};
		} else {
			return {
				character: this.start.character,
				line: this.start.line
			};
		}
	}

	/**
	 * Gets the plain text value in the current selection range.
	 * @returns {string}
	 */
	get_text() {
		const positionCompare = this.compare_position(this.start.line, this.start.character, this.end.line, this.end.character);
		const firstLine = positionCompare === 1 ? this.end.line : this.start.line;
		const lastLine = positionCompare === 1 ? this.start.line : this.end.line;
		const firstCharacter = positionCompare === 1 ? this.end.character : this.start.character;
		const lastCharacter = positionCompare === 1 ? this.start.character : this.end.character;
		let textLines = [];
		for (let i = firstLine; i <= lastLine; i++) {
			if (i === firstLine && i === lastLine) {
				textLines.push(this.editor.document.get_line_text(i).slice(firstCharacter, lastCharacter));
			} else if (i === firstLine) {
				textLines.push(this.editor.document.get_line_text(i).slice(firstCharacter));
			} else if (i === lastLine) {
				textLines.push(this.editor.document.get_line_text(i).slice(0, lastCharacter));
			} else {
				textLines.push(this.editor.document.get_line_text(i));
			}
		}
		return textLines.join('\n');
	}
	
	/**
	 * Sets the visibility of the selection in the editor.
	 * @param {boolean} isVisible 
	 */
	set_visible(isVisible) {
		if (this.isVisible != isVisible) {
			this.isVisible = isVisible;
		}
	}

	/**
	 * Sets the visibility of the selection cursor in the editor.
	 * @param {boolean} isVisible 
	 */
	set_cursor_visible(isVisible) {
		if (this.isCursorVisible != isVisible) {
			this.isCursorVisible = isVisible;
			if (this.isCursorVisible) {
				this.isBlinkVisible = true;
				this.start_blinking();
			} else {
				this.stop_blinking();
			}
		}
	}
	
	/**
	 * Starts the selection cursor blinking.
	 */
	start_blinking() {
		clearInterval(this.blinkIntervalHandle);
		this.blinkIntervalHandle = setInterval(this.blink.bind(this), this.blinkInterval);
	}
	
	/**
	 * Stops the selection cursor blinking.
	 */
	stop_blinking() {
		clearInterval(this.blinkIntervalHandle);
	}
	
	/**
	 * Toggles the visibility of the selection cursor.
	 */
	blink() {
		this.isBlinkVisible = !this.isBlinkVisible;
		const firstLine = Math.min(this.start.line, this.end.line);
		const lastLine = Math.max(this.start.line, this.end.line);
		/*
		this.editor.render({
			lineStart: firstLine,
			lineEnd: lastLine
		});
		*/
		// this.Base_layers.render();
	}
	
	/**
	 * Moves the cursor to a previous line.
	 * @param {number} length - The number of lines to move 
	 * @param {boolean} keepSelection - Whether to move to an empty selection or extend the current selection
	 */
	move_line_previous(length, keepSelection) {
		length = length == null ? 1 : length;
		const position = this.get_position();
		this.set_position(position.line - length, null, keepSelection);
	}
	
	/**
	 * Moves the cursor to a next line.
	 * @param {number} length - The number of lines to move 
	 * @param {boolean} keepSelection - Whether to move to an empty selection or extend the current selection
	 */
	move_line_next(length, keepSelection) {
		length = length == null ? 1 : length;
		const position = this.get_position();
		this.set_position(position.line + length, null, keepSelection);
	}
		
	/**
	 * Moves to the start of the current line.
	 * @param {boolean} keepSelection - Whether to move to an empty selection or extend the current selection 
	 */
	move_line_start(keepSelection) {
		const position = this.get_position();
		this.set_position(position.line, 0, keepSelection);
	}

	/**
	 * Moves to the end of the current line.
	 * @param {boolean} keepSelection - Whether to move to an empty selection or extend the current selection 
	 */
	move_line_end(keepSelection) {
		const position = this.get_position();
		this.set_position(position.line, this.editor.document.get_line_character_count(position.line), keepSelection);
	}
	
	/**
	 * Moves the cursor to a character behind in the document, handles line wrapping.
	 * @param {number} length - The number of characters to move 
	 * @param {boolean} keepSelection - Whether to move to an empty selection or extend the current selection 
	 */
	move_character_previous(length, keepSelection) {
		length = length == null ? 1 : length;
		const position = this.get_position();
		if (position.character - length < 0) {
			if (position.line > 0) {
				this.set_position(position.line - 1, this.editor.document.get_line_character_count(position.line - 1), keepSelection);
			}
		} else {
			this.set_position(position.line, position.character - length, keepSelection);
		}
	}
	
	/**
	 * Moves the cursor to a character ahead in the document, handles line wrapping.
	 * @param {number} length - The number of characters to move 
	 * @param {boolean} keepSelection - Whether to move to an empty selection or extend the current selection 
	 */
	move_character_next(length, keepSelection) {
		length = length == null ? 1 : length;
		const position = this.get_position();
		const characterCount = this.editor.document.get_line_character_count(position.line);
		if (position.character + length > characterCount) {
			if (position.line + 1 < this.editor.document.lines.length) {
				this.set_position(position.line + 1, 0, keepSelection);
			}
		} else {
			this.set_position(position.line, position.character + length, keepSelection);
		}
	}

	/**
	 * Moves the cursor to the beginning of the current word or previous word, handles line wrapping.
	 * @param {boolean} keepSelection - Whether to move to an empty selection or extend the current selection 
	 */
	move_word_previous(keepSelection) {
		const position = this.get_position();
		const newPosition = this.editor.document.get_word_start_position(position.line, position.character);
		this.set_position(newPosition.line, newPosition.character, keepSelection);
	}

	/**
	 * Moves the cursor to the end of the current word or next word, handles line wrapping.
	 * @param {boolean} keepSelection - Whether to move to an empty selection or extend the current selection 
	 */
	move_word_next(keepSelection) {
		const position = this.get_position();
		const newPosition = this.editor.document.get_word_end_position(position.line, position.character);
		this.set_position(newPosition.line, newPosition.character, keepSelection);
	}
}


/**
 * This class handles rendering a text layer and editing it based on keyboard/mouse/touch controls
 */
class Text_editor_class {
	constructor(options) {
		options = options || {};

		this.editingCtx = document.getElementById('canvas_minipaint').getContext("2d");
		this.hasValueChanged = false;

		// Text boundary and offsets are precomputed before drawn
		this.lineRenderInfo = null;
		this.lastCalculatedZoom = 0;
		this.lastCalculatedLayerWidth = 0;
		this.lastCalculatedLayerHeight = 0;
		this.textBoundaryWidth = 0;
		this.textBoundaryHeight = 0;

		// Styling options during render
		this.selectionBackgroundColor = options.selectionBackgroundColor || '#1C79C4';
		this.selectionTextColor = options.selectionTextColor || '#FFFFFF';

		// Offset from top/left of layer for cursor visibility
		this.drawOffsetTop = options.paddingVertical != null ? options.paddingVertical : 6;
		this.drawOffsetLeft = options.paddingHorizontal != null ? options.paddingHorizontal : 10;

		// Tracking internal state for keyboard/mouse/touch control
		this.shiftPressed = false;
		this.ctrlPressed = false;
		this.isMouseSelectionActive = false;
		this.mouseSelectionStartX = 0;
		this.mouseSelectionStartY = 0;
		this.mouseSelectionStartLine = null;
		this.mouseSelectionStartCharacter = null;
		this.mouseSelectionMoveX = null;
		this.mouseSelectionMoveY = null;
		this.mouseSelectionEdgeScrollInterval = null;
		this.focused = false;
		
		// Text document for this editor
		this.document = new Text_document_class();
		this.document.lines = [[{ text: '', meta: {} }]];
		this.wrappedLines = [[]];

		// Text selection for this editor
		this.selection = new Text_selection_class(this);

		// The layer associated with this editor (so data can be updated)
		this.layer = null;
		this.document.on_change = () => {
			this.layer.data = this.document.lines;
		};
	}

	/**
	 * Sets the lines of the document (from layer data)
	 * @param {array} lines 
	 */
	set_lines(lines, preserveSelection = false) {
		const prevStart = this.selection ? {
			line: this.selection.start ? this.selection.start.line : 0,
			character: this.selection.start ? this.selection.start.character : 0
		} : null;
		const prevEnd = this.selection ? {
			line: this.selection.end ? this.selection.end.line : 0,
			character: this.selection.end ? this.selection.end.character : 0
		} : null;
		const prevActive = this.selection ? this.selection.isActiveSideEnd : true;
		this.document.lines = lines || [[{ text: '', meta: {} }]];
		if (this.selection) {
			const maxLine = Math.max(0, this.document.lines.length - 1);
			if (preserveSelection && prevStart && prevEnd) {
				const clamp = (line, character) => {
					const l = Math.max(0, Math.min(line, maxLine));
					const c = Math.max(0, Math.min(character, this.document.get_line_character_count(l)));
					return { line: l, character: c };
				};
				const start = clamp(prevStart.line, prevStart.character);
				const end = clamp(prevEnd.line, prevEnd.character);
				this.selection.set_position(start.line, start.character, false);
				this.selection.set_position(end.line, end.character, true);
				this.selection.isActiveSideEnd = prevActive;
			} else {
				const curLine = Math.min(prevEnd ? prevEnd.line : 0, maxLine);
				const lineCount = Math.max(0, this.document.get_line_character_count(curLine));
				const curChar = Math.min(prevEnd ? prevEnd.character : 0, lineCount);
				this.selection.set_position(curLine, curChar);
			}
		}
		this.hasValueChanged = true;
	}

	/**
	 * Returns the text string at a given line wrap (ignores formatting).
	 * @param {object} wrap - The wrap definition 
	 */
	get_wrap_text(wrap) {
		let wrapText = '';
		for (let i = 0; i < wrap.spans.length; i++) {
			wrapText += wrap.spans[i].text;
		}
		return wrapText;
	}

	/**
	 * Calculates font metrics for the given span and returns it. Caches by default.
	 * @param {object} span - The span to calculate metrics for
	 * @param {boolean} noCache - Skip caching if the metrics is expected to change in the future (e.g. font family not loaded yet.) 
	 */
	get_span_font_metrics(span, noCache) {
		const fontSize = (span.meta.size || metaDefaults.size);
		const fontName = (span.meta.family || metaDefaults.family);
		let fontMetrics = fontMetricsMap.get(fontName + '_' + fontSize);
		if (!fontMetrics) {
			fontMetrics = new Font_metrics_class(fontName, fontSize);
			if (!noCache) {
				fontMetricsMap.set(fontName + '_' + fontSize, fontMetrics);
			}
		}
		return fontMetrics;
	}

	/**
	 * Returns the complete text of the document.
	 */
	get_complete_text() {
		let completeText = '';
		for (let line of this.document.lines) {
			for (let span of line) {
					completeText += span.text;
			}
			if (this.document.lines.indexOf(line) !== this.document.lines.length - 1) {
					completeText += '\n';
			}
		}
		return completeText;
	}

	replace_entire_IME_text(beforeTempText, newText) {
		const cursorPosition = this.selection.get_position();
		let allText = beforeTempText;
		let lines = allText.split('\n');
		let currentLineText = lines[cursorPosition.line];
		let beforeText = currentLineText.substring(0, cursorPosition.character);
		let afterText = currentLineText.substring(cursorPosition.character);
		let updatedLineText = beforeText + newText + afterText;
		lines[cursorPosition.line] = updatedLineText;

		const newLines = lines.map(lineText => {
				return [{ text: lineText, meta: {} }];
		});
		this.set_lines(newLines);
		this.hasValueChanged = true;
	}

	set_IME_position(newText) {
		const cursorPosition = this.selection.get_position();
		let newTextLines = newText.split('\n');
		let newCursorLine = cursorPosition.line + newTextLines.length - 1;
		let newCursorCharacter = newText.length;
		this.selection.set_position(newCursorLine, newCursorCharacter + cursorPosition.character);
		this.hasValueChanged = true;
	}



	insert_text_at_current_position(text) {
		if (!this.selection.is_empty()) {
			this.delete_character_at_current_position();
		}
		const position = this.selection.get_position();
		const newPosition = this.document.insert_text(text, position.line, position.character);
		this.selection.set_position(newPosition.line, newPosition.character);
		this.hasValueChanged = true;
	}
	
	delete_character_at_current_position(forward) {
		let newPosition;
		if (this.selection.is_empty()) {
			const position = this.selection.get_position();
			newPosition = this.document.delete_character(forward, position.line, position.character);
		} else {
			newPosition = this.document.delete_range(
				this.selection.start.line,
				this.selection.start.character,
				this.selection.end.line,
				this.selection.end.character
			);
		}
		this.selection.set_position(newPosition.line, newPosition.character);
		this.hasValueChanged = true;
	}

	delete_selection() {
		let newPosition = this.document.delete_range(
			this.selection.start.line,
			this.selection.start.character,
			this.selection.end.line,
			this.selection.end.character
		);
		this.selection.set_position(newPosition.line, newPosition.character);
		this.hasValueChanged = true;
	}

	trigger_cursor_start(layer, layerX, layerY) {
		this.isMouseSelectionActive = true;
		this.mouseSelectionStartX = layerX;
		this.mouseSelectionStartY = layerY;
		const cursorStart = this.get_cursor_position_from_absolute_position(layer, layerX, layerY);
		this.mouseSelectionStartLine = cursorStart.line;
		this.mouseSelectionStartCharacter = cursorStart.character;
		this.selection.set_position(cursorStart.line, cursorStart.character, false);
	}
	
	trigger_cursor_move(layer, layerX, layerY) {
		const isInsideCanvas = true; // layerX > 0 && layerY > 0 && layerX < this.lastCalculatedLayerWidth && layerY < this.lastCalculatedLayerHeight;
		if (this.isMouseSelectionActive && isInsideCanvas) {
			this.mouseSelectionMoveX = layerX;
			this.mouseSelectionMoveY = layerY;
			const cursorEnd = this.get_cursor_position_from_absolute_position(layer, layerX, layerY);
			this.selection.set_position(this.mouseSelectionStartLine, this.mouseSelectionStartCharacter, false);
			this.selection.set_position(cursorEnd.line, cursorEnd.character, true);
		}
	}
	
	trigger_cursor_end() {
		this.isMouseSelectionActive = false;
		this.mouseSelectionMoveX = null;
		this.mouseSelectionMoveY = null;
	}
	
	get_cursor_position_from_absolute_position(layer, x, y) {
		let line = -1;
		let character = -1;

		if (this.lineRenderInfo) {
			const textDirection = layer.params.text_direction;
			const wrapDirection = layer.params.wrap_direction;
			const isHorizontalTextDirection = ['ltr', 'rtl'].includes(textDirection);
			const isNegativeTextDirection = ['rtl', 'btt'].includes(textDirection);

			let characterPosition = isHorizontalTextDirection ? x : y;
			let wrapPosition = isHorizontalTextDirection ? y : x;
			
			const wrapSizes = this.lineRenderInfo.wrapSizes;
			let wrapRelativeIndex = -1;
		
			let globalWrapIndex = 0;
			for (let [lineIndex, lineInfo] of this.lineRenderInfo.lines.entries()) {
				wrapRelativeIndex = 0;
				for (let wrap of lineInfo.wraps) {
					if (wrapPosition < wrapSizes[globalWrapIndex].offset + wrapSizes[globalWrapIndex].size) {
						line = lineIndex;
						break;
					}
					globalWrapIndex++;
					wrapRelativeIndex++;
				}
				if (line > -1) {
					break;
				}
			}
			if (line === -1) {
				line = this.lineRenderInfo.lines.length - 1;
				wrapRelativeIndex = -1;
			}
			const wraps = this.lineRenderInfo.lines[line].wraps;
			if (wrapRelativeIndex === -1) {
				wrapRelativeIndex = wraps.length - 1;
			}
			let previousWrapCharacterCount = 0;
			for (let w = 0; w < wrapRelativeIndex; w++) {
				previousWrapCharacterCount += this.get_wrap_text(wraps[w]).length;
			}
			const characterCount = this.get_wrap_text(wraps[wrapRelativeIndex]).length;
			const characterOffsets = wraps[wrapRelativeIndex].characterOffsets;
			for (let characterNumber = 0; characterNumber < characterCount; characterNumber++) {
				const leftPosition = characterOffsets[characterNumber];
				const rightPosition = characterOffsets[characterNumber + 1];
				if (characterPosition <= leftPosition + ((rightPosition - leftPosition) * 0.5)) {
					character = previousWrapCharacterCount + characterNumber;
					break;
				}
				if (characterNumber === characterCount - 1 && character === -1) {
					character = previousWrapCharacterCount + characterCount;
				}
			}
			if (character === -1) {
				character = this.document.get_line_character_count(line);
			}
		}
		return { line, character };
	}

	calculate_text_placement(ctx, layer) {
		const boundary = layer.params.boundary;
		const textDirection = layer.params.text_direction;
		const wrapDirection = layer.params.wrap_direction;
		const halign = layer.params.halign;
		const valign = layer.params.valign;
		const isHorizontalTextDirection = ['ltr', 'rtl'].includes(textDirection);
		const isNegativeTextDirection = ['rtl', 'btt'].includes(textDirection);

		let totalTextDirectionSize = 0;
		let totalWrapDirectionSize = 0;
		let textDirectionMaxSize = isHorizontalTextDirection ? layer.width : layer.height;

		// Determine new lines based on text wrapping, if applicable
		let lineRenderInfo = {
			wrapSizes: [],
			lines: []
		};
		for (let line of this.document.lines) {
			let wrapAccumulativeSize = 0;
			let wrapCharacterOffsets = [0];
			let lineWraps = [];
			let currentWrapSpans = [...line];
			let s = 0;
			let fontMetrics = null;
			let character = null;
			let nextCharacter = null;
			let fontKerning = 0;
			for (s = 0; s < currentWrapSpans.length; s++) {
				const span = currentWrapSpans[s];
				const kerning = span.meta.kerning || metaDefaults.kerning;
				const family = span.meta.family || metaDefaults.family;
				const size = span.meta.size || metaDefaults.size;
				fontMetrics = this.get_span_font_metrics(span, !fontLoadMap.get(family));
				if (isHorizontalTextDirection) {
					ctx.font =
						' ' + (span.meta.italic ? 'italic' : '') +
						' ' + (span.meta.bold ? 'bold' : '') +
						' ' + size + 'px' +
						' ' + family;
				}
				for (let c = 0; c < span.text.length; c++) {
					character = span.text[c];
					if (layer.params.kerning === 'metrics') {
						nextCharacter = span.text[c + 1];
						if (!nextCharacter && c === span.text.length - 1 && currentWrapSpans[s + 1]) {
							const nextSpan = currentWrapSpans[s + 1];
							if (family === (nextSpan.meta.family || metaDefaults.family) && size === (nextSpan.meta.size || metaDefaults.size)) {
								nextCharacter = nextSpan.text[0];
							}
						}
						fontKerning = isHorizontalTextDirection && nextCharacter ? fontMetrics.get_kerning_offset(character + nextCharacter) : 0;
					}
					const characterSize = isHorizontalTextDirection ? ctx.measureText(character).width : fontMetrics.height;
					wrapAccumulativeSize += characterSize + fontKerning + kerning;
					if (boundary !== 'dynamic' && wrapAccumulativeSize > textDirectionMaxSize && ![' ', '-'].includes(character)) {
						// Find last span with space
						let dividerPosition = -1;
						let bs = s;
						for (; bs >= 0; bs--) {
							const backwardsSpan = currentWrapSpans[bs];
							const backwardsSpanText = (bs === s) ? backwardsSpan.text.substring(0, c) : backwardsSpan.text;
							dividerPosition = backwardsSpanText.lastIndexOf(' ');
							const dashPosition = backwardsSpanText.lastIndexOf('-');
							if (dashPosition > dividerPosition) {
								dividerPosition = dashPosition;
							}
							if (dividerPosition > -1) {
								break;
							}
						}
						let beforeSpans = [];
						let afterSpans = [];
						// Found a previous span on the current line wrap that contains a space, split the line
						if (dividerPosition > -1) {
							beforeSpans = currentWrapSpans.slice(0, bs);
							afterSpans = currentWrapSpans.slice(bs + 1);
							const beforeText = currentWrapSpans[bs].text.substring(0, dividerPosition + 1);
							const afterText = currentWrapSpans[bs].text.substring(dividerPosition + 1);
							if (beforeText.length > 0) {
								beforeSpans.push({
									text: beforeText,
									meta: currentWrapSpans[bs].meta
								});
							}
							if (afterText.length > 0) {
								afterSpans.unshift({
									text: afterText,
									meta: currentWrapSpans[bs].meta
								});
							}
						}
						// For word split only, break out.
						else if (layer.params.wrap === 'word') {
							wrapCharacterOffsets.push(wrapAccumulativeSize);
							break;
						}
						// Otherwise, split the word
						else {
							if (s === 0 && c === 0) {
								c++;
								wrapCharacterOffsets.push(wrapAccumulativeSize);
							}
							beforeSpans = currentWrapSpans.slice(0, s);
							afterSpans = currentWrapSpans.slice(s + 1);
							const beforeText = currentWrapSpans[s].text.substring(0, c);
							const afterText = currentWrapSpans[s].text.substring(c);
							if (beforeText.length > 0) {
								beforeSpans.push({
									text: beforeText,
									meta: currentWrapSpans[s].meta
								});
							}
							if (afterText.length > 0) {
								afterSpans.unshift({
									text: afterText,
									meta: currentWrapSpans[s].meta
								});
							}
						}
						let largestOffset = wrapCharacterOffsets[wrapCharacterOffsets.length-1];
						if (largestOffset > totalTextDirectionSize) {
							totalTextDirectionSize = largestOffset;
						}
						const newWrap = {
							characterOffsets: wrapCharacterOffsets,
							spans: beforeSpans
						};
						newWrap.characterOffsets = newWrap.characterOffsets.slice(0, this.get_wrap_text(newWrap).length + 1);
						lineWraps.push(newWrap);
						currentWrapSpans = afterSpans;
						wrapAccumulativeSize = 0;
						wrapCharacterOffsets = [0];
						s = -1;
						break;
					} else {
						wrapCharacterOffsets.push(wrapAccumulativeSize);
					}
				}
				if (s === -1) {
					continue;
				}
			}
			if (currentWrapSpans.length > 0) {
				let largestOffset = wrapCharacterOffsets[wrapCharacterOffsets.length-1];
				if (largestOffset > totalTextDirectionSize) {
					totalTextDirectionSize = largestOffset;
				}
				lineWraps.push({
					characterOffsets: wrapCharacterOffsets,
					spans: currentWrapSpans
				});
			}
			lineRenderInfo.lines.push({
				firstWrapIndex: 0,
				wraps: lineWraps
			});
		}

		// Adjust offsets for alignment along the text direction
		if ((isHorizontalTextDirection && halign !== 'left') || (!isHorizontalTextDirection && valign !== 'top')) {
			const maxTextDirectionSize = boundary === 'dynamic' ? totalTextDirectionSize : (isHorizontalTextDirection ? layer.width : layer.height);
			for (let line of lineRenderInfo.lines) {
				for (let wrap of line.wraps) {
					const isCentered = (isHorizontalTextDirection && halign == 'center') || (!isHorizontalTextDirection && valign === 'middle');
					const lastSpan = wrap.spans[wrap.spans.length - 1];
					const wrapSize = wrap.characterOffsets[wrap.characterOffsets.length - 1 - (lastSpan.text[lastSpan.text.length - 1] === ' ' ? 1 : 0)];
					const startOffset = (isCentered ? maxTextDirectionSize / 2 : maxTextDirectionSize) - (isCentered ? wrapSize / 2 : wrapSize);
					if (startOffset > 0) {
						for (let oi = 0; oi < wrap.characterOffsets.length; oi++) {
							wrap.characterOffsets[oi] += startOffset;
						}
					}
				}
			}
		}

		// Determine the size of each line (e.g. line height if horizontal typing direction)
		let wrapSizeAccumulator = 0;
		let wrapCounter = 0;
		for (let line of lineRenderInfo.lines) {
			line.firstWrapIndex = wrapCounter;
			for (let wrap of line.wraps) {
				let ascenderSize = 0;
				let descenderSize = 0;
				for (let span of wrap.spans) {
					let fontMetrics;
					const family = span.meta.family || metaDefaults.family;
					const leading = span.meta.leading != null ? span.meta.leading : metaDefaults.leading;
					if (isHorizontalTextDirection) {
						fontMetrics = this.get_span_font_metrics(span, !fontLoadMap.get(family));
					} else {
						ctx.font =
							' ' + (span.meta.italic ? 'italic' : '') +
							' ' + (span.meta.bold ? 'bold' : '') +
							' ' + (span.meta.size || metaDefaults.size) + 'px' +
							' ' + family;
					}
					let spanAscenderSize = isHorizontalTextDirection ? fontMetrics.baseline : ctx.measureText(character).width;
					let spanDescenderSize = isHorizontalTextDirection ? Math.abs(fontMetrics.baseline - fontMetrics.height) : ctx.measureText(character).width;
					if (leading) {
						spanAscenderSize += leading;
						if (spanAscenderSize < 0) {
							spanDescenderSize += spanAscenderSize;
							spanAscenderSize = 0;
							if (spanDescenderSize < 0) {
								spanDescenderSize = 0;
							}
						}
					}
					if (spanAscenderSize > ascenderSize) {
						ascenderSize = spanAscenderSize;
					}
					if (spanDescenderSize > descenderSize) {
						descenderSize = spanDescenderSize;
					}
				}
				let lineSize = ascenderSize + descenderSize;
				lineRenderInfo.wrapSizes.push({ size: lineSize, offset: wrapSizeAccumulator, baseline: ascenderSize });
				wrapSizeAccumulator += lineSize;
				wrapCounter++;
			}
		}
		totalWrapDirectionSize = wrapSizeAccumulator;

		this.lastCalculatedLayerWidth = layer.width;
		this.lastCalculatedLayerHeight = layer.height;
		this.textBoundaryWidth = Math.max(1, Math.round(isHorizontalTextDirection ? totalTextDirectionSize : totalWrapDirectionSize));
		this.textBoundaryHeight = Math.max(1, Math.round(isHorizontalTextDirection ? totalWrapDirectionSize : totalTextDirectionSize));
		this.lineRenderInfo = lineRenderInfo;
	}

	render(ctx, layer) {
		if (config.need_render_changed_params || this.hasValueChanged || layer.width != this.lastCalculatedLayerWidth || layer.height != this.lastCalculatedLayerHeight || !this.textBoundaryWidth || !this.textBoundaryHeight) {
			this.calculate_text_placement(ctx, layer);
		}

		this._livePointScale = null;
		if (this._pointTransforming && this.textBoundaryWidth > 0 && this.textBoundaryHeight > 0) {
			const bw = Math.max(1, this.textBoundaryWidth);
			const bh = Math.max(1, this.textBoundaryHeight);
			const sx = layer.width / bw;
			const sy = layer.height / bh;
			if (Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01) {
				this._livePointScale = { sx, sy };
			}
		}

		if (!this.lineRenderInfo) return;

		try {

			let options = options || {};
			let isSelectionEmpty = this.selection.is_empty();

			ctx.textAlign = 'left';
			ctx.textBaseline = 'alphabetic';

			const boundary = layer.params.boundary;
			let drawOffsetTop = layer.y + 1;
			let drawOffsetLeft = layer.x + 1;
			const textDirection = layer.params.text_direction;
			const wrapDirection = layer.params.wrap_direction;
			const isHorizontalTextDirection = ['ltr', 'rtl'].includes(textDirection);
			const isNegativeTextDirection = ['rtl', 'btt'].includes(textDirection);

			const wrapSizes = this.lineRenderInfo.wrapSizes;
			let lineIndex = 0;
			let wrapIndex = 0;
			const cursorLine = this.selection.isActiveSideEnd ? this.selection.end.line : this.selection.start.line;
			const cursorCharacter = this.selection.isActiveSideEnd ? this.selection.end.character : this.selection.start.character;
			if(layer.rotate){
				const alpha = (layer.rotate * Math.PI) / 180;
				ctx.save();
				// Move the canvas to the center before rotating
				ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
				ctx.rotate(alpha);
				// Move it back after it
				ctx.translate(-layer.x - layer.width / 2, -layer.y - layer.height / 2);

			}
			if (this._livePointScale) {
				const { sx, sy } = this._livePointScale;
				ctx.translate(layer.x, layer.y);
				ctx.scale(sx, sy);
				ctx.translate(-layer.x, -layer.y);
			}
			for (let line of this.lineRenderInfo.lines) {
				let lineLetterCount = 0;
				for (let [localWrapIndex, wrap] of line.wraps.entries()) {
					let cursorStartX = null;
					let cursorStartY = null;
					let cursorSize = null;
					let characterIndex = 0;
					const characterOffsets = wrap.characterOffsets;
					for (let [spanIndex, span] of wrap.spans.entries()) {
						const kerning = span.meta.kerning != null ? span.meta.kerning : metaDefaults.kerning;
						const bold = span.meta.bold != null ? span.meta.bold : metaDefaults.bold;
						const italic = span.meta.italic != null ? span.meta.italic : metaDefaults.italic;
						const underline = span.meta.underline != null ? span.meta.underline : metaDefaults.underline;
						const strikethrough = span.meta.strikethrough != null ? span.meta.strikethrough : metaDefaults.strikethrough;
						const family = span.meta.family || metaDefaults.family;

						if (fontLoadMap.get(family) !== true && config.user_fonts[family]?.source !== 'local') {
							const variants = config.user_fonts[family] ? config.user_fonts[family].variants : undefined;
							load_font_family({ family, variants }, () => {
								this.hasValueChanged = true;
								this.Base_layers.render();
							});
						}

						let fontMetrics;
						if (underline || strikethrough) {
							fontMetrics = this.get_span_font_metrics(span, !fontLoadMap.get(family));
						}

						// Set styles for drawing
						ctx.font =
							' ' + (italic ? 'italic' : '') +
							' ' + (bold ? 'bold' : '') +
							' ' + Math.round(span.meta.size || metaDefaults.size) + 'px' +
							' ' + family;
						const fill_color = span.meta.fill_color || config.COLOR || metaDefaults.fill_color;
						let fillStyle;
						if (fill_color.startsWith('#')) {
							fillStyle = fill_color;
						}
						const stroke_size = ((span.meta.stroke_size != null) ? span.meta.stroke_size : metaDefaults.stroke_size);
						let strokeStyle;
						if (stroke_size) {
							const stroke_color = span.meta.stroke_color || metaDefaults.stroke_color;
							if (stroke_color.startsWith('#')) {
								strokeStyle = stroke_color;
							}
							ctx.lineWidth = stroke_size;
						} else {
							ctx.lineWidth = 0;
						}

						
						
						// Loop through each letter in each span and draw it
						for (let c = 0; c < span.text.length; c++) {
							const letter = span.text.charAt(c);
							const lineStart = Math.round(drawOffsetTop + wrapSizes[wrapIndex].offset);
							const letterWidth = characterOffsets[characterIndex + 1] - characterOffsets[characterIndex];
							const letterHeight = Math.round(wrapSizes[wrapIndex].size);
							const textDirectionOffset = drawOffsetLeft + characterOffsets[characterIndex];
							const wrapDirectionOffset = Math.round(drawOffsetTop + wrapSizes[wrapIndex].offset + wrapSizes[wrapIndex].baseline);
							const letterDrawX = isHorizontalTextDirection ? textDirectionOffset + kerning : wrapDirectionOffset;
							const letterDrawY = isHorizontalTextDirection ? wrapDirectionOffset : textDirectionOffset + kerning;
							let isLetterSelected = false;
							if (this.selection.isVisible) {
								if (!isSelectionEmpty) {
									isLetterSelected = (
										(
											this.selection.start.line === lineIndex &&
											this.selection.start.character <= lineLetterCount &&
											(this.selection.end.line > lineIndex || this.selection.end.character > lineLetterCount)
										) ||
										(
											this.selection.end.line === lineIndex &&
											this.selection.end.character > lineLetterCount &&
											(this.selection.start.line < lineIndex || this.selection.start.character <= lineLetterCount)
										) ||
										(
											this.selection.start.line < lineIndex &&
											this.selection.end.line > lineIndex
										)
									);
								}
								if (cursorLine === lineIndex) {
									if (cursorCharacter === lineLetterCount) {
										cursorStartX = (isHorizontalTextDirection ? textDirectionOffset : lineStart) - 0.5;
										cursorStartY = (isHorizontalTextDirection ? lineStart : textDirectionOffset) - 0.5;
										cursorSize = isHorizontalTextDirection ? letterHeight : letterWidth;
									}
									else if (cursorCharacter === lineLetterCount + 1 && localWrapIndex === line.wraps.length - 1 && spanIndex === wrap.spans.length - 1 && c === span.text.length - 1) {
										cursorStartX = (isHorizontalTextDirection ? textDirectionOffset + letterWidth : lineStart) - 0.5;
										cursorStartY = (isHorizontalTextDirection ? lineStart : textDirectionOffset + letterHeight) - 0.5;
										cursorSize = isHorizontalTextDirection ? letterHeight : letterWidth;
									}
								}
							}
							if (isLetterSelected && (!this.Base_layers || ctx !== this.Base_layers.ctx_preview)) {
								const letterStartX = isHorizontalTextDirection ? textDirectionOffset : lineStart;
								const letterStartY = isHorizontalTextDirection ? lineStart : textDirectionOffset;
								const letterSizeX = isHorizontalTextDirection ? letterWidth : letterHeight;
								const letterSizeY = isHorizontalTextDirection ? letterHeight : letterWidth;
								// Solid highlight (no per-glyph stroke that splits letters)
								ctx.fillStyle = this.selectionBackgroundColor + '55';
								ctx.fillRect(letterStartX, letterStartY, letterSizeX, letterSizeY);
							}
							ctx.fillStyle = fillStyle;
							ctx.strokeStyle = strokeStyle;
							ctx.fillText(letter, letterDrawX, letterDrawY);
							if (stroke_size) {
								ctx.lineWidth = stroke_size;
								ctx.strokeText(letter, letterDrawX, letterDrawY);
							}
							if (strikethrough) {
								ctx.fillStyle = fillStyle;
								ctx.lineWidth = Math.max(1, fontMetrics.height / 20);
								ctx.fillRect(letterDrawX - 0.25 - kerning, letterDrawY - (fontMetrics.height * .28), letterWidth + 0.5, ctx.lineWidth);
							}
							if (underline) {
								ctx.fillStyle = fillStyle;
								ctx.lineWidth = Math.max(1, fontMetrics.height / 20);
								ctx.fillRect(letterDrawX - 0.25 - kerning, letterDrawY + (ctx.lineWidth), letterWidth + 0.5, ctx.lineWidth);
							}
							characterIndex++;
							lineLetterCount++;
						}

						

						if (span.text.length === 0) {
							if (cursorLine === lineIndex && cursorCharacter === lineLetterCount) {
								const lineStart = Math.round(drawOffsetTop + wrapSizes[wrapIndex].offset);
								const textDirectionOffset = drawOffsetLeft + characterOffsets[0] + (lineIndex === 0 ? (2) : 0);
								const letterWidth = 3;
								const letterHeight = Math.round(wrapSizes[wrapIndex].size);
								cursorStartX = (isHorizontalTextDirection ? textDirectionOffset : lineStart) - 0.5;
								cursorStartY = (isHorizontalTextDirection ? lineStart : textDirectionOffset) - 0.5;
								cursorSize = isHorizontalTextDirection ? letterHeight : letterWidth;
							}
						}
					}

					// Draw caret (black I-beam)
					if (this.selection.isCursorVisible && cursorStartX != null && (!this.Base_layers || ctx !== this.Base_layers.ctx_preview)) {
						ctx.lineCap = 'butt';
						ctx.strokeStyle = '#000000';
						ctx.lineWidth = 1;
						ctx.beginPath();
						ctx.moveTo(cursorStartX, cursorStartY + 1);
						ctx.lineTo(cursorStartX, cursorStartY + cursorSize - 1);
						ctx.stroke();
					}
					wrapIndex++;
				}
				lineIndex++;
			}
			if(layer.rotate){
				ctx.restore();
			}
		} catch (error) {
			console.warn(error);
		}

		this.hasValueChanged = false;
	}
}

class Google_fonts_search_class {
	constructor() {
		this.POP = new Dialog_class();
		this.GUI_tools = new GUI_tools_class();
		this.popup = null;
		this.fontsPerPage = 8;
		this.dialogContentNode = null;
		this.fontListNode = null;
		this.fontList = [];
		this.fontListFiltered = [];
		this.googleFontList = [];
		this.localFontList = [];
		this.selectedFonts = {};
		this.searchTimeoutHandle = null;
	}

	render_font_list(page) {
		page = page || 1;
		const pageCount = Math.ceil(this.fontListFiltered.length / 8);
		const startIndex = (page - 1) * this.fontsPerPage;
		let html = '<div class="selection_card_list">';
		for (let i = startIndex; i < startIndex + this.fontsPerPage; i++) {
			const font = this.fontListFiltered[i];
			if (!font) break;
			const isSelected = !!this.selectedFonts[font.family];
			load_font_family({ family: font.family, variants: font.variants, source: font.source });
			html += `
				<div class="selection_card">
					<input type="checkbox" id="google_font_selection_${font.family}" value="${font.family}" ${isSelected ? 'checked="checked"' : ''}>
					<label for="google_font_selection_${font.family}"">
						<div class="font_preview" style="font-family: '${font.family}'">
							The quick brown fox jumps over the lazy dog.
						</div>
						<div class="text_muted">
							${font.family}
						</div>
					</label>
				</div>
			`;
		}
		html += `
				</div>
				<div class="pagination">
					${page > 1 ? '<button title="Previous Page" data-page="' + (page - 1) + '">&laquo;</button>' : ''}
					${page - 2 > 0 ? '<button title="Page ' + (page - 2) + '" data-page="' + (page - 2) + '">' + (page - 2) + '</button>' : ''}
					${page - 1 > 0 ? '<button title="Page ' + (page - 1) + '" data-page="' + (page - 1) + '">' + (page - 1) + '</button>' : ''}
					<button title="Page ${page}" aria-pressed="true" data-page="${page}">${page}</button>
					${page + 1 <= pageCount ? '<button title="Page ' + (page + 1) + '" data-page="' + (page + 1) + '">' + (page + 1) + '</button>' : ''}
					${page + 2 <= pageCount ? '<button title="Page ' + (page + 2) + '" data-page="' + (page + 2) + '">' + (page + 2) + '</button>' : ''}
					${page < pageCount ? '<button title="Next Page" data-page="' + (page + 1) + '">&raquo;</button>' : ''}
				</div>
			</div>
		`;
		this.fontListNode.innerHTML = html;

		// Attempt to remove vertical scroll by decreasing page size.
		if (this.fontsPerPage > 3 && this.dialogContentNode.scrollHeight > this.dialogContentNode.clientHeight) {
			this.fontsPerPage--;
			this.render_font_list(page);
			return;
		}

		// Handle checkbox
		this.fontListNode.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
			checkbox.addEventListener('change', (e) => {
				if (checkbox.checked) {
					this.selectedFonts[checkbox.value] = this.fontListFiltered
						.slice(startIndex, startIndex + this.fontsPerPage)
						.filter((font) => { return font.family === checkbox.value; })[0];
				} else {
					delete this.selectedFonts[checkbox.value];
				}
			});
		});

		// Handle pagination
		this.fontListNode.querySelector('.pagination').addEventListener('click', (e) => {
			const page = parseInt(e.target.getAttribute('data-page'), 10);
			this.render_font_list(page);
		});
	}

	show() {
		this.POP.show({
			title: 'Search for Font',
			params: [
				{ name: "query", title: "Search:", value: '', prevent_submission: true }
			],
			on_load: (params, popup) => {
				this.popup = popup;
				var node = document.createElement("div");
				this.dialogContentNode = popup.el.querySelector('.dialog_content');
				this.dialogContentNode.appendChild(node);
				this.fontListNode = node;				
				const localFontsButton = document.createElement('button');
				localFontsButton.type = 'button';
				localFontsButton.textContent = 'Use System Fonts';
				localFontsButton.title = 'Allow access to fonts installed on this computer';
				this.dialogContentNode.insertBefore(localFontsButton, node);
				localFontsButton.addEventListener('click', async () => {
					if (typeof window.queryLocalFonts !== 'function') {
						alertify.error('System font access is not supported by this browser.');
						return;
					}
					localFontsButton.disabled = true;
					localFontsButton.textContent = 'Loading System Fonts...';
					try {
						const localFonts = await window.queryLocalFonts();
						this.localFontList = localFonts.map((font) => {
							localFontDataMap.set(font.family, font);
							return { family: font.family, source: 'local' };
						});
						const localFamilies = new Set(this.localFontList.map((font) => font.family));
						this.fontList = this.localFontList.concat(this.googleFontList.filter((font) => !localFamilies.has(font.family)));
						this.fontListFiltered = this.fontList;
						this.render_font_list();
					} catch (error) {
						alertify.error('System font access was not granted.');
					} finally {
						localFontsButton.disabled = false;
						localFontsButton.textContent = 'Refresh System Fonts';
					}
				});

				const queryInput = popup.el.querySelector('#pop_data_query');
				queryInput.addEventListener('input', (e) => {
					const query = (e.target.value || '').toLowerCase();
					if (!query) {
						this.fontListFiltered = this.fontList;
						this.render_font_list();
					} else {
					clearTimeout(this.searchTimeoutHandle);
						this.searchTimeoutHandle = setTimeout(() => {
							this.fontListFiltered = [];
							for (let i = 0; i < this.fontList.length; i++) {
								const fontFamily = this.fontList[i].family.toLowerCase();
								if (fontFamily.includes(query)) {
									this.fontListFiltered.push(this.fontList[i]);
								}
							}
							this.render_font_list();
						}, 350);
					}
				});

				const useFontList = (items) => {
					this.googleFontList = items;
					this.fontList = this.localFontList.concat(items);
					this.fontListFiltered = this.fontList;
					this.render_font_list();
				};
				const configuredFonts = (config.FONTS || [])
					.filter((family) => !['Arial', 'Courier', 'Impact', 'Helvetica', 'Monospace', 'Tahoma', 'Times New Roman', 'Verdana'].includes(family))
					.map((family) => ({ family }));
				const apiKey = config.google_webfonts_key;
				if (!apiKey) {
					useFontList(configuredFonts);
					return;
				}
				$.getJSON(`https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`, (data) => {
					useFontList(data.items);
				}).fail(function () {
					alertify.error('Error loading the list of fonts from Google.');
					useFontList(configuredFonts);
				});
			},
			on_finish: () => {
				this.popup = null;
				this.POP = null;
				if (Object.keys(this.selectedFonts).length > 0) {
					let firstFont = null;
					for (let font in this.selectedFonts) {
						if (!firstFont) {
							firstFont = font;
						}
						const selectedFont = this.selectedFonts[font];
						config.user_fonts[font] = selectedFont.source === 'local'
							? { family: selectedFont.family, source: 'local' }
							: selectedFont;
					}
					app.GUI.GUI_tools.action_data().attributes.font.value = firstFont;
					app.GUI.GUI_tools.show_action_attributes();
					try {
						const changeEvent = new Event('change');
						document.querySelector('#action_attributes select#font').dispatchEvent(changeEvent);
					} catch (error) {
						console.warn('Application markup may have changed, ', error);
					}
				}
			}
		});
	}
}


class Text_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.GUI_tools = new GUI_tools_class();
		this.Helper = new Helper_class();
		this.ctx = ctx;
		this.name = 'text';
		this.layer = {};
		this.creating = false;
		this.selecting = false;
		this.resizing = false;
		this.focused = false;
		this.focusedValue = null;
		this.focusedWidth = null;
		this.focusedHeight = null;
		this.typing_commit_timer = null;
		this.create_box_threshold = 4; // px drag before point text becomes paragraph/box
		this.mousedownX = 0;
		this.mousedownY = 0;
		this.mousedownBounds = {};
		this.is_fonts_loaded = false;
		this._ignore_textarea_blur = false;
		this._params_ui_active = false;
		this._preserve_selection = null;
		this.preload_fonts();
		if (ctx) {
			this.selection = {
				x: null,
				y: null,
				width: null,
				height: null,
			};
			var sel_config = {
				enable_background: false,
				// Point text default: no wrap-box chrome. Paragraph enables these in render().
				enable_borders: false,
				enable_controls: false,
				enable_rotation: false,
				enable_move: false,
				keep_ratio: false,
				data_function: () => {
					return this.selection;
				},
			};
			this._selection_config = sel_config;
			this.Base_selection = new Base_selection_class(ctx, sel_config, this.name);

			// Need a textarea in order to listen for keyboard inputs in an accessible, multi-platform independent way
			this.textarea = document.createElement('textarea');
			this.textarea.id = 'text_tool_keyboard_input';
			this.textarea.setAttribute('autocorrect', 'off');
			this.textarea.setAttribute('autocapitalize', 'off');
			this.textarea.setAttribute('autocomplete', 'off');
			this.textarea.setAttribute('spellcheck', 'false');
			this.textarea.style = `position: fixed; top: -100px; left: -100px; padding: 0; width: 10px; height: 10px; background: transparent; border: none; outline: none; color: transparent; opacity: 0.01; pointer-events: none;`;
			document.body.appendChild(this.textarea);

			// Keep editing selection/focus while using the options bar (PS-like).
			const markParamsUi = (active) => { this._params_ui_active = !!active; };
			document.addEventListener('pointerdown', (ev) => {
				if (ev.target && ev.target.closest && ev.target.closest('#action_attributes')) {
					markParamsUi(true);
					this._ignore_textarea_blur = true;
				}
			}, true);
			document.addEventListener('pointerup', (ev) => {
				if (this._params_ui_active) {
					if (ev.target && ev.target.closest && ev.target.closest('.ui_number_input input')) {
						this._params_ui_active = false;
						this._ignore_textarea_blur = false;
						return;
					}
					setTimeout(() => {
						markParamsUi(false);
						this._ignore_textarea_blur = false;
						this.focus_textarea();
					}, 0);
				}
			}, true);

			this.textarea.addEventListener('focus', () => {
				this.focused = true;
				let currentLayer = (config.layer && config.layer.type === 'text') ? config.layer : this.layer;
				let editor = this.get_editor(currentLayer);
				if (editor && currentLayer) {
					this.focusedValue = JSON.stringify(editor.document.lines);
					this.focusedWidth = currentLayer.width;
					this.focusedHeight = currentLayer.height;
				}
			}, true);

			this.textarea.addEventListener('blur', (e) => {
				const keepFocusSelector = '#main_wrapper, #action_attributes, #main_tools, .ui_swatches, .sp-container, .ui_color_picker_gradient, .ui_number_input, .ui_range';
				const related = e.relatedTarget;
				if (related && related.closest && related.closest('.ui_number_input input')) {
					return;
				}
				if (related && related.closest && related.closest(keepFocusSelector)) {
					this.focus_textarea();
					return;
				}
				if (this._ignore_textarea_blur || this._params_ui_active) {
					this.focus_textarea();
					return;
				}
				setTimeout(() => {
					if (this._ignore_textarea_blur || this._params_ui_active) {
						this.focus_textarea();
						return;
					}
					const active = document.activeElement;
					if (active && active.closest && active.closest(keepFocusSelector)) {
						this.focus_textarea();
						return;
					}
					if (config.TOOL && config.TOOL.name === 'text' && this.textarea && document.activeElement === this.textarea) {
						return;
					}
					this.focused = false;
					this.commit_text_changes();
					this.focusedValue = null;
					this.focusedWidth = null;
					this.focusedHeight = null;
					this.Base_layers.render();
				}, 0);
			}, true);

			let isComposing = false;
			let beforeImeText = "";
			this.textarea.addEventListener('compositionstart', () => {
				beforeImeText = "";
					isComposing = true;
					if (config.layer) {
						const editor = this.get_editor(config.layer);
						beforeImeText = editor.get_complete_text();
					}
			});

			this.textarea.addEventListener('compositionend', (e) => {
				const editor = this.get_editor(config.layer);
				editor.set_IME_position(e.target.value);
				beforeImeText = "";
				isComposing = false;
				e.target.value = '';
			});

			this.textarea.addEventListener('input', (e) => {
				const inputValue = e.target.value;
				if(isComposing){
					const editor = this.get_editor(config.layer);
					editor.replace_entire_IME_text(beforeImeText, inputValue);
					this.Base_layers.render();
					this.extend_fixed_bounds(config.layer, editor);
				}
				else if (config.layer && config.layer.type === 'text') {
					const editor = this.get_editor(config.layer);
					if (!editor) return;
					editor.insert_text_at_current_position(inputValue);
					e.target.value = '';
					this.Base_layers.render();
					this.extend_fixed_bounds(config.layer, editor);
				}
				// Debounce auto-commit while typing
				if (this.typing_commit_timer) {
					clearTimeout(this.typing_commit_timer);
				}
				this.typing_commit_timer = setTimeout(() => {
					this.commit_text_changes();
				}, 600);
			}, true);

			this.textarea.addEventListener('keydown', (e) => {
				if (config.layer) {
					// Undo / Redo shortcuts while focused in textarea
					if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
						e.preventDefault();
						e.stopImmediatePropagation();
						(async () => {
							if (e.shiftKey) {
								await app.State.redo();
							} else {
								await this.commit_text_changes();
								await app.State.undo();
							}
						})();
						return;
					}
					if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
						e.preventDefault();
						e.stopImmediatePropagation();
						(async () => {
							await app.State.redo();
						})();
						return;
					}
					let handled = true;
					const editor = this.get_editor(config.layer);
					switch (e.key) {
						case 'Escape':
							e.preventDefault();
							e.stopImmediatePropagation();
							(async () => {
								await this.commit_text_changes();
								this.focused = false;
								this.selecting = false;
								this.creating = false;
								if (this.textarea) this.textarea.blur();
								const ed = this.get_editor(config.layer);
								if (ed && ed.selection) {
									// Collapse selection to caret at end
									const line = ed.selection.end.line;
									const ch = ed.selection.end.character;
									ed.selection.set_position(line, ch, false);
								}
								this.Base_layers.render();
								// Photoshop-like: leave Type tool for Move/select
								if (app.GUI && app.GUI.GUI_tools) {
									await app.GUI.GUI_tools.activate_tool('select');
								}
							})();
							return;
						case 'Backspace':
							editor.delete_character_at_current_position(false);
							break;
						case 'Delete':
							editor.delete_character_at_current_position(true);
							break;
						case 'Home':
							editor.selection.move_line_start(e.shiftKey);
							break;
						case 'End':
							editor.selection.move_line_end(e.shiftKey);
							break;
						case 'Left': case 'ArrowLeft':
							if (!e.shiftKey && !editor.selection.is_empty()) {
								editor.selection.isActiveSideEnd = false;
								editor.selection.move_character_previous(0, false);
							} else if (e.ctrlKey) {
								editor.selection.move_word_previous(e.shiftKey);
							} else {
								editor.selection.move_character_previous(1, e.shiftKey);
							}
							break;
						case 'Right': case 'ArrowRight':
							if (!e.shiftKey && !editor.selection.is_empty()) {
								editor.selection.isActiveSideEnd = true;
								editor.selection.move_character_next(0, false);
							} else if (e.ctrlKey) {
								editor.selection.move_word_next(e.shiftKey);
							} else {
								editor.selection.move_character_next(1, e.shiftKey);
							}
							break;
						case 'Up': case 'ArrowUp':
							editor.selection.move_line_previous(1, e.shiftKey);
							break;
						case 'Down': case 'ArrowDown':
							editor.selection.move_line_next(1, e.shiftKey);
							break;
						case 'a':
							if (e.ctrlKey) {
								editor.selection.set_position(0, 0);
								const lastLine = editor.document.lines.length - 1;
								editor.selection.set_position(lastLine, editor.document.get_line_character_count(lastLine), true);
								break;
							}
						case 'b':
							if (e.ctrlKey) {
								e.preventDefault();
								document.querySelector('#action_attributes #bold').click();
								break;
							}
						case 'c':
							if (e.ctrlKey) {
								e.preventDefault();
								this.textarea.value = editor.selection.get_text();
								this.textarea.select();
								this.textarea.setSelectionRange(0, 99999);
								document.execCommand('copy');
								this.textarea.value = '';
								break;
							}
						case 'i':
							if (e.ctrlKey) {
								e.preventDefault();
								document.querySelector('#action_attributes #italic').click();
								break;
							}
						case 'u':
							if (e.ctrlKey) {
								e.preventDefault();
								document.querySelector('#action_attributes #underline').click();
								break;
							}
						case 'x':
							if (e.ctrlKey) {
								e.preventDefault();
								this.textarea.value = editor.selection.get_text();
								this.textarea.select();
								this.textarea.setSelectionRange(0, 99999);
								document.execCommand('copy');
								this.textarea.value = '';
								editor.delete_selection();
								break;
							}
						default:
							handled = false;
					}
					if (handled) {
						this.update_tool_attributes(config.layer, editor);
						this.Base_layers.render();
					}
					this.extend_fixed_bounds(config.layer, editor);
					return !handled;
				}
			}, true);
		}
	}

	async dragStart(event) {
		if (config.TOOL.name != this.name)
			return;
		await this.mousedown(event);
	}

	dragMove(event) {
		if (config.TOOL.name != this.name)
			return;
		this.mousemove(event);
	}

	async dragEnd(event) {
		if (config.TOOL.name != this.name)
			return;
		await this.mouseup(event);
	}

	load() {
		// Event routing is handled centrally by Base_tools_class
	}

	async commit_text_changes() {
		if (this.typing_commit_timer) {
			clearTimeout(this.typing_commit_timer);
			this.typing_commit_timer = null;
		}
		const layer = (config.layer && config.layer.type === 'text') ? config.layer : this.layer;
		if (!layer || layer.id == null || layer.type !== 'text') {
			this.focusedValue = null;
			return;
		}
		const editor = this.get_editor(layer);
		if (!editor) return;

		// Ensure dynamic/box bounds reflect latest layout before snapshotting.
		this.resize_to_dynamic_bounds(layer, editor);
		this.extend_fixed_bounds(layer, editor);

		const currentValue = JSON.stringify(editor.document.lines);
		const currentWidth = layer.width;
		const currentHeight = layer.height;
		const dataChanged = this.focusedValue != null && this.focusedValue !== currentValue;
		const sizeChanged = (
			(this.focusedWidth != null && this.focusedWidth !== currentWidth) ||
			(this.focusedHeight != null && this.focusedHeight !== currentHeight)
		);
		if (dataChanged || sizeChanged) {
			const oldValue = this.focusedValue != null ? this.focusedValue : currentValue;
			const oldWidth = this.focusedWidth != null ? this.focusedWidth : currentWidth;
			const oldHeight = this.focusedHeight != null ? this.focusedHeight : currentHeight;

			// Temporarily revert so action records the pre-edit state as old_settings
			layer.data = JSON.parse(oldValue);
			layer.width = oldWidth;
			layer.height = oldHeight;

			await app.State.do_action(
				new app.Actions.Update_layer_action(layer.id, {
					data: JSON.parse(currentValue),
					width: currentWidth,
					height: currentHeight
				})
			);

			this.focusedValue = currentValue;
			this.focusedWidth = currentWidth;
			this.focusedHeight = currentHeight;
		}
	}

	focus_textarea() {
		if (!this.textarea) return;
		this.focused = true;
		try {
			this.textarea.focus({ preventScroll: true });
		} catch (e) {
			this.textarea.focus();
		}
		setTimeout(() => {
			const activeNumberInput = document.activeElement && document.activeElement.closest
				? document.activeElement.closest('.ui_number_input input')
				: null;
			if (activeNumberInput) return;
			if (this.textarea && (this.focused || (config.TOOL && config.TOOL.name === 'text'))) {
				this.focused = true;
				try {
					this.textarea.focus({ preventScroll: true });
				} catch (e) {
					this.textarea.focus();
				}
				if (config.layer && config.layer.type === 'text') {
					this.Base_layers.render();
				}
			}
		}, 0);
	}

	async mousedown(e) {
		if (e && e.target && e.target.closest && e.target.closest('#main_wrapper')) {
			if (e.preventDefault && typeof e.preventDefault === 'function') {
				e.preventDefault();
			}
		}

		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;

		this.creating = false;
		this.selecting = false;
		this.resizing = false;

		this.mousedownX = mouse.x;
		this.mousedownY = mouse.y;
		this.mousedownBounds = (config.layer && config.layer.type === 'text' && config.layer.params) ? {
			x: config.layer.x,
			y: config.layer.y,
			width: config.layer.width,
			height: config.layer.height,
			boundary: config.layer.params.boundary
		} : null;

		if (this.Base_selection.mouse_lock !== null) {
			// Only allow box-handle resize for paragraph (box) text
			if (config.layer && config.layer.type === 'text' && config.layer.params && config.layer.params.boundary === 'box') {
				this.resizing = true;
			}
			return;
		}

		const existingLayer = this.get_text_layer_at_mouse(e);
		if (existingLayer) {
			await this.commit_text_changes();
			this.selecting = true;
			this.layer = existingLayer;
			const editor = this.get_editor(this.layer);
			if (editor) {
				editor.trigger_cursor_start(this.layer, -1 + mouse.x - this.layer.x, mouse.y - this.layer.y);
				this.focusedValue = JSON.stringify(editor.document.lines);
				this.focusedWidth = this.layer.width;
				this.focusedHeight = this.layer.height;
			}
			const selectActions = [
					new app.Actions.Select_layer_action(existingLayer.id)
				];
				// Point text: caret only (no rectangular selection chrome).
				// Paragraph/box: keep a selection matching the text box.
				if (this.layer.params && this.layer.params.boundary === 'box') {
					selectActions.push(new app.Actions.Set_selection_action(this.layer.x, this.layer.y, this.layer.width, this.layer.height));
				} else {
					selectActions.push(new app.Actions.Reset_selection_action());
				}
				await app.State.do_action(
					new app.Actions.Bundle_action('select_text_layer', 'Select Text Layer', selectActions)
				);
		}
		else {
			await this.commit_text_changes();
			// Create a new text layer (point by default; drag past threshold => paragraph/box)
			this.creating = true;
			const layer = {
				type: this.name,
				params: {
					boundary: 'dynamic',
					kerning: 'metrics',
					text_direction: 'ltr',
					wrap_direction: 'ttb',
					halign: 'left',
					valign: 'top',
					wrap: 'letter'
				},
				render_function: [this.name, 'render'],
				x: mouse.x,
				y: mouse.y,
				width: 1,
				height: 1,
				rotate: 0,
				is_vector: true,
			};
			await app.State.do_action(
				new app.Actions.Bundle_action('new_text_layer', 'New Text Layer', [
					new app.Actions.Insert_layer_action(layer, false)
				])
			);
			// Never mutate non-text layers (esp. locked Background)
			if (!config.layer || config.layer.type !== 'text') {
				this.creating = false;
				return;
			}
			this.layer = config.layer;
			const editor = this.get_editor(this.layer);
			if (editor) {
				this.seed_placeholder_text(this.layer, editor, { selectAll: true });
			}
			this.focus_textarea();
		}
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		if (this.resizing) {
			if (config.layer && config.layer.type === 'text') {
				config.layer.x = this.selection.x;
				config.layer.y = this.selection.y;
				config.layer.width = this.selection.width;
				config.layer.height = this.selection.height;
				// Point (dynamic): keep dynamic — transform scales glyphs (see bake_point_text_scale).
				// Paragraph (box): only the frame changes; glyphs reflow / clip.
			}
		}
		else if (this.creating) {
			if (!config.layer || config.layer.type !== 'text' || !config.layer.params) {
				return;
			}
			const width = Math.abs(mouse.x - this.mousedownX);
			const height = Math.abs(mouse.y - this.mousedownY);
			const threshold = this.create_box_threshold || 4;
			const isBoxDrag = width >= threshold || height >= threshold;

			// Photoshop-like: click = point/dynamic text; click-drag past threshold = paragraph/box
			if (isBoxDrag) {
				config.layer.params.boundary = 'box';
				config.layer.x = Math.min(mouse.x, this.mousedownX);
				config.layer.y = Math.min(mouse.y, this.mousedownY);
				config.layer.width = Math.max(1, width);
				config.layer.height = Math.max(1, height);
			} else {
				config.layer.params.boundary = 'dynamic';
				config.layer.x = this.mousedownX;
				config.layer.y = this.mousedownY;
				config.layer.width = 1;
				config.layer.height = 1;
			}
		} else {
			const editor = this.get_editor(this.layer);
			if (editor && this.layer) {
				editor.trigger_cursor_move(this.layer, -1 + mouse.x - this.layer.x, mouse.y - this.layer.y);
			}
		}
		this.Base_layers.render();
	}

	async mouseup(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			this.resizing = false;
			this.selecting = false;
			this.creating = false;
			return;
		}
		const editor = this.get_editor(this.layer);

		if (this.resizing) {
			if (this.mousedownBounds && config.layer && config.layer.type === 'text' && config.layer.params) {
				const wasDynamic = this.mousedownBounds.boundary === 'dynamic';
				const nextX = this.selection.x;
				const nextY = this.selection.y;
				const nextW = this.selection.width;
				const nextH = this.selection.height;
				config.layer.x = this.mousedownBounds.x;
				config.layer.y = this.mousedownBounds.y;
				config.layer.width = this.mousedownBounds.width;
				config.layer.height = this.mousedownBounds.height;
				const new_params = JSON.parse(JSON.stringify(config.layer.params));
				// Never promote point→box on transform
				new_params.boundary = this.mousedownBounds.boundary;
				config.layer.params.boundary = this.mousedownBounds.boundary;
				// End live transform before history render so scale bakes instead of snapping back
				this.resizing = false;
				const update = {
					x: nextX,
					y: nextY,
					width: nextW,
					height: nextH,
					params: new_params
				};
				if (wasDynamic && this.mousedownBounds.width > 0) {
					if (!this._point_resize_snapshot) {
						this.begin_point_text_resize(config.layer);
						this._point_resize_base_width = Math.max(1, this.mousedownBounds.width);
						this._point_resize_base_height = Math.max(1, this.mousedownBounds.height);
					}
					const scaledData = this.apply_point_text_resize(config.layer, nextW, nextH);
					if (scaledData) {
						update.data = scaledData;
						this.focusedValue = JSON.stringify(scaledData);
						this.focusedWidth = nextW;
						this.focusedHeight = nextH;
					}
					this.end_point_text_resize();
				}
				await app.State.do_action(
					new app.Actions.Bundle_action('resize_text_layer', 'Resize Text Layer', [
						new app.Actions.Update_layer_action(config.layer.id, update),
						...(wasDynamic ? [] : [new app.Actions.Set_selection_action(nextX, nextY, nextW, nextH)])
					])
				);
			}
		}
		else if (this.creating) {
			let width = Math.abs(mouse.x - this.mousedownX);
			let height = Math.abs(mouse.y - this.mousedownY);
			const threshold = this.create_box_threshold || 4;
			const isBoxDrag = width >= threshold || height >= threshold;

			if (!isBoxDrag) {
				// Point text (Photoshop-like): keep dynamic bounds at click/anchor point
				width = 1;
				height = 1;
			}
			if (config.layer && config.layer.type === 'text') {
				const nextParams = JSON.parse(JSON.stringify(config.layer.params || {}));
				nextParams.boundary = isBoxDrag ? 'box' : 'dynamic';
				nextParams.wrap = isBoxDrag ? 'word' : 'letter';
				const nextX = isBoxDrag ? Math.min(mouse.x, this.mousedownX) : this.mousedownX;
				const nextY = isBoxDrag ? Math.min(mouse.y, this.mousedownY) : this.mousedownY;
				config.layer.params.boundary = nextParams.boundary;
				config.layer.params.wrap = nextParams.wrap;
				await app.State.do_action(
					new app.Actions.Bundle_action('resize_text_layer', 'Resize Text Layer', [
						new app.Actions.Update_layer_action(config.layer.id, {
							x: nextX,
							y: nextY,
							width: isBoxDrag ? Math.max(1, width) : 1,
							height: isBoxDrag ? Math.max(1, height) : 1,
							params: nextParams
						})
					]),
					{ merge_with_history: 'new_text_layer' }
				);
				const ed = this.get_editor(config.layer);
				if (ed) {
					// Ensure placeholder + full selection for both point and paragraph create
					this.seed_placeholder_text(config.layer, ed, { selectAll: true });
				}
				if (isBoxDrag) {
					await app.State.do_action(
						new app.Actions.Set_selection_action(nextX, nextY, Math.max(1, width), Math.max(1, height)),
						{ merge_with_history: 'new_text_layer' }
					);
				}
			}
			this.focus_textarea();
		}
		else if (this.selecting) {
			if (editor) {
				editor.trigger_cursor_end();
			}
			this.focus_textarea();
			
			if (editor) {
				if (editor.selection.is_empty() && editor.document.queuedMetaChanges) {
					let meta = {};
					const existingMeta = editor.document.get_meta_range(editor.selection.start.line, editor.selection.start.character, editor.selection.end.line, editor.selection.end.character);
					for (let metaKey in existingMeta) {
						meta[metaKey] = editor.document.queuedMetaChanges[metaKey] != null ? editor.document.queuedMetaChanges[metaKey] : existingMeta[metaKey][0];
					}
				} else {
					editor.document.queuedMetaChanges = null;
					this.update_tool_attributes(this.layer, editor);
				}
			}
		}

		// Resize layer based on text boundaries (text layers only).
		if (editor && this.layer && this.layer.type === 'text') {
			this.extend_fixed_bounds(this.layer, editor);
			this.resize_to_dynamic_bounds(this.layer, editor);
		}
		this.Base_layers.render();

		// Point text stays anchored at the click point (no post-create centering).
		// Centering caused visible jumps / "scaling" and could fight layout.

		this.resizing = false;
		this.selecting = false;
		this.creating = false;
	}


	preload_fonts() {
		if (this.fonts_preloaded) return;
		this.fonts_preloaded = true;
		const systemFonts = ["Arial", "Courier", "Impact", "Helvetica", "Monospace", "Tahoma", "Times New Roman", "Verdana"];
		// Prefer Roboto early — default Type face
		load_font_family({ family: 'Roboto' }, () => {
			if (this.Base_layers) this.Base_layers.render();
		});
		const googleFonts = config.FONTS ? config.FONTS.filter(f => !systemFonts.includes(f)) : [];
		if (googleFonts.length > 0) {
			try {
				WebFont.load({
					google: {
						families: googleFonts
					},
					fontactive: (family) => {
						fontLoadMap.set(family, true);
					}
				});
			} catch (e) {
				console.warn('Could not preload web fonts', e);
			}
		}
	}

	dblclick(event) {
		if (this.textarea && (document.activeElement === this.textarea || this.focused)) {
			const editor = this.get_editor(this.layer);
			if (editor && editor.selection.is_empty()) {
				const position = editor.selection.get_position();
				const wordStart = editor.document.get_word_start_position(position.line, position.character, true);
				const wordEnd = editor.document.get_word_end_position(position.line, position.character, true);
				editor.selection.set_position(wordStart.line, wordStart.character);
				editor.selection.set_position(wordEnd.line, wordEnd.character, true);
				this.update_tool_attributes(this.layer, editor);
				this.focus_textarea();
			}
		}
	}

	doubleClick(event) {
		this.dblclick(event);
	}

	snapshot_selection(editor) {
		if (!editor || !editor.selection) return null;
		return {
			startLine: editor.selection.start.line,
			startCharacter: editor.selection.start.character,
			endLine: editor.selection.end.line,
			endCharacter: editor.selection.end.character,
			isActiveSideEnd: editor.selection.isActiveSideEnd
		};
	}

	restore_selection(editor, snap) {
		if (!editor || !snap) return;
		editor.selection.set_position(snap.startLine, snap.startCharacter, false);
		editor.selection.set_position(snap.endLine, snap.endCharacter, true);
		editor.selection.isActiveSideEnd = snap.isActiveSideEnd;
	}

	/**
	 * Photoshop-like options bar behavior:
	 * - Non-empty character selection => style the selection and KEEP it
	 * - Otherwise (layer selected / collapsed caret) => style ALL text in the layer
	 */
	async apply_params_to_layer_or_selection(meta) {
		const layer = (config.layer && config.layer.type === 'text') ? config.layer : this.layer;
		if (!layer || layer.type !== 'text') return;
		const editor = this.get_editor(layer);
		if (!editor || !meta || Object.keys(meta).length === 0) return;

		this._ignore_textarea_blur = true;
		this._params_ui_active = true;
		const activeNumberInput = document.activeElement && document.activeElement.closest
			? document.activeElement.closest('.ui_number_input input')
			: null;
		const selectionSnap = this.snapshot_selection(editor);
		const hadSelection = selectionSnap && !(
			selectionSnap.startLine === selectionSnap.endLine &&
			selectionSnap.startCharacter === selectionSnap.endCharacter
		);

		const oldData = JSON.parse(JSON.stringify(editor.document.lines));
		if (hadSelection) {
			editor.document.queuedMetaChanges = null;
			editor.document.set_meta_range(
				selectionSnap.startLine,
				selectionSnap.startCharacter,
				selectionSnap.endLine,
				selectionSnap.endCharacter,
				meta
			);
		} else {
			// Style every span (including empty placeholder spans for new point text)
			for (const line of editor.document.lines) {
				for (const span of line) {
					if (!span.meta) span.meta = {};
					for (const metaKey in meta) {
						span.meta[metaKey] = meta[metaKey];
					}
				}
			}
			if (editor.document.on_change) {
				editor.document.on_change(editor.document.lines);
			}
			if (!editor.document.queuedMetaChanges) {
				editor.document.queuedMetaChanges = {};
			}
			for (let metaKey in meta) {
				editor.document.queuedMetaChanges[metaKey] = meta[metaKey];
			}
		}

		editor.hasValueChanged = true;
		this._preserve_selection = hadSelection ? selectionSnap : null;
		layer.data = oldData;
		await app.State.do_action(
			new app.Actions.Update_layer_action(layer.id, {
				data: JSON.parse(JSON.stringify(editor.document.lines))
			})
		);

		const editorAfter = this.get_editor(layer);
		if (editorAfter && hadSelection && selectionSnap) {
			this.restore_selection(editorAfter, selectionSnap);
		}
		this._preserve_selection = null;
		this.resize_to_dynamic_bounds(layer, editorAfter || editor);
		this.extend_fixed_bounds(layer, editorAfter || editor);
		this.Base_layers.render();
		if (!activeNumberInput) {
			this.focus_textarea();
		}
		setTimeout(() => {
			this._ignore_textarea_blur = false;
			this._params_ui_active = false;
			if (hadSelection && selectionSnap) {
				const ed = this.get_editor(layer);
				if (ed) this.restore_selection(ed, selectionSnap);
			}
			if (activeNumberInput && document.contains(activeNumberInput)) {
				activeNumberInput.focus();
			} else {
				this.focus_textarea();
			}
		}, 0);
	}

	on_params_update(param) {
		const value = param.value;
		const meta = {};
		let returnValue = undefined;
		switch (param.key) {
			case 'font':
				if (value.includes('...')) {
					returnValue = {
						new_values: {
							font: ''
						}
					};
					new Google_fonts_search_class().show();
				}
				else if (value) meta.family = value;
				break;
			case 'size':
				if (value) meta.size = value;
				break;
			case 'bold':
				meta.bold = value;
				break;
			case 'italic':
				meta.italic = value;
				break;
			case 'underline':
				meta.underline = value;
				break;
			case 'strikethrough':
				meta.strikethrough = value;
				break;
			case 'fill':
				if (value) {
					meta.fill_color = value;
					config.COLOR = value;
					if (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.update_toolbar_swatches) {
						app.GUI.GUI_tools.update_toolbar_swatches();
					}
					if (app.GUI && app.GUI.GUI_colors && typeof app.GUI.GUI_colors.render_selected_color === 'function') {
						try { app.GUI.GUI_colors.render_selected_color(); } catch (e) { /* ignore */ }
					}
				}
				break;
			case 'stroke':
				if (value) meta.stroke_color = value;
				break;
			case 'stroke_size':
				if (!isNaN(value)) meta.stroke_size = value;
				break;
			case 'kerning':
				if (!isNaN(value)) meta.kerning = value;
				break;
			case 'leading':
				if (!isNaN(value)) meta.leading = value;
				break;
			case 'halign': {
				const align = (value && value.value ? value.value : value) || 'Left';
				if (config.layer && config.layer.type === 'text' && config.layer.params) {
					const nextParams = JSON.parse(JSON.stringify(config.layer.params));
					nextParams.halign = String(align).toLowerCase();
					app.State.do_action(
						new app.Actions.Update_layer_action(config.layer.id, { params: nextParams })
					);
					this.Base_layers.render();
					this.focus_textarea();
				}
				return returnValue;
			}
			case 'boundary': {
				const mode = (value && value.value ? value.value : value) || 'Auto';
				const normalized = String(mode).toLowerCase();
				const boundary = (normalized === 'box' || normalized === 'paragraph') ? 'box' : 'dynamic';
				if (config.layer && config.layer.type === 'text' && config.layer.params) {
					const nextParams = JSON.parse(JSON.stringify(config.layer.params));
					nextParams.boundary = boundary;
					app.State.do_action(
						new app.Actions.Update_layer_action(config.layer.id, { params: nextParams })
					);
					this.Base_layers.render();
					this.focus_textarea();
				}
				return returnValue;
			}
		}
		if (Object.keys(meta).length) {
			this.apply_params_to_layer_or_selection(meta);
		}
		return returnValue;
	}

	update_tool_attributes(layer, editor) {
		if (layer && layer.params) {
			const meta = editor.document.get_meta_range(editor.selection.start.line, editor.selection.start.character, editor.selection.end.line, editor.selection.end.character);
			const toolAttributes = this.GUI_tools.action_data().attributes;
			toolAttributes.font.value = meta.family.length === 1 ? meta.family[0] : '';
			const sizeVal = meta.size.length === 1 ? meta.size[0] : parseFloat(null);
			if (toolAttributes.size && typeof toolAttributes.size === 'object') {
				toolAttributes.size.value = sizeVal;
			} else {
				toolAttributes.size = sizeVal;
			}
			toolAttributes.bold.value = meta.bold.includes(false) ? false : true;
			toolAttributes.italic.value = meta.italic.includes(false) ? false : true;
			toolAttributes.underline.value = meta.underline.includes(false) ? false : true;
			toolAttributes.strikethrough.value = meta.strikethrough.includes(false) ? false : true;
			toolAttributes.fill = meta.fill_color.length === 1 ? meta.fill_color[0] : (config.COLOR || '#000000');
			toolAttributes.stroke = meta.stroke_color.length === 1 ? meta.stroke_color[0] : '#000000';
			toolAttributes.stroke_size.value = meta.stroke_size.length === 1 ? meta.stroke_size[0] : parseFloat(null);
			toolAttributes.kerning.value = meta.kerning.length === 1 ? meta.kerning[0] : parseFloat(null);
			toolAttributes.leading.value = meta.leading.length === 1 ? meta.leading[0] : parseFloat(null);
			if (toolAttributes.halign) {
				const h = (layer.params.halign || 'left').toLowerCase();
				toolAttributes.halign.value = h === 'center' ? 'Center' : (h === 'right' ? 'Right' : 'Left');
			}
			if (toolAttributes.boundary) {
				toolAttributes.boundary.value = layer.params.boundary === 'box' ? 'Paragraph' : 'Point';
			}
			this.GUI_tools.show_action_attributes();
		}
	}


	_scale_text_lines(lines, scale) {
		const out = JSON.parse(JSON.stringify(lines || [[{ text: '', meta: {} }]]));
		for (const line of out) {
			for (const span of line) {
				if (!span.meta) span.meta = {};
				const size = (span.meta.size != null) ? span.meta.size : metaDefaults.size;
				span.meta.size = Math.max(1, Math.round(size * scale * 100) / 100);
				if (span.meta.stroke_size != null && span.meta.stroke_size > 0) {
					span.meta.stroke_size = Math.max(0, Math.round(span.meta.stroke_size * scale * 10) / 10);
				}
				if (span.meta.leading != null) {
					span.meta.leading = Math.max(0, Math.round(span.meta.leading * scale));
				}
			}
		}
		return out;
	}

	bake_point_text_scale(layer, scale, { commit = true } = {}) {
		if (!layer || layer.type !== 'text' || !scale || !isFinite(scale) || Math.abs(scale - 1) < 1e-6) {
			return null;
		}
		const editor = this.get_editor(layer);
		const source = (this._point_resize_snapshot)
			? this._point_resize_snapshot
			: (editor ? editor.document.lines : (layer.data || [[{ text: '', meta: {} }]]));
		const lines = this._scale_text_lines(source, scale);
		if (commit) {
			layer.data = JSON.parse(JSON.stringify(lines));
			if (editor) {
				editor.hasValueChanged = true;
				editor.set_lines(JSON.parse(JSON.stringify(lines)), true);
				editor.hasValueChanged = true;
			}
		}
		return lines;
	}

	/**
	 * Start a point-text transform: remember pre-drag fonts so scale is always
	 * relative to the drag start (not compounded each move).
	 */
	begin_point_text_resize(layer) {
		if (!layer || layer.type !== 'text') return;
		const editor = this.get_editor(layer);
		const lines = editor ? editor.document.lines : layer.data;
		this._point_resize_snapshot = JSON.parse(JSON.stringify(lines || [[{ text: '', meta: {} }]]));
		this._point_resize_base_width = Math.max(1, layer.width || 1);
		this._point_resize_base_height = Math.max(1, layer.height || 1);
		this._point_resize_layer_id = layer.id;
		this._point_resize_last_scale = 1;
	}

	/**
	 * Apply point-text scale from the drag-start snapshot to real font sizes.
	 * Uses uniform scale from width+height so handles stay proportional.
	 */
	apply_point_text_resize(layer, currentWidth, currentHeight) {
		if (!layer || layer.type !== 'text' || !this._point_resize_snapshot) return null;
		if (this._point_resize_layer_id != null && layer.id !== this._point_resize_layer_id) return null;
		const baseW = Math.max(1, this._point_resize_base_width || 1);
		const baseH = Math.max(1, this._point_resize_base_height || 1);
		const w = Math.max(1, currentWidth != null ? currentWidth : (layer.width || baseW));
		const h = Math.max(1, currentHeight != null ? currentHeight : (layer.height || baseH));
		const scale = Math.max(0.05, Math.sqrt(Math.abs((w / baseW) * (h / baseH))));
		this._point_resize_last_scale = scale;
		const lines = this.bake_point_text_scale(layer, scale, { commit: true });
		if (lines && lines[0] && lines[0][0] && lines[0][0].meta && lines[0][0].meta.size != null) {
			const size = lines[0][0].meta.size;
			try {
				for (const tool of (config.TOOLS || [])) {
					if (tool.name === 'text' && tool.attributes && tool.attributes.size) {
						if (typeof tool.attributes.size === 'object') tool.attributes.size.value = size;
						else tool.attributes.size = size;
					}
				}
			} catch (e) { /* ignore */ }
		}
		return lines;
	}

	end_point_text_resize() {
		this._point_resize_snapshot = null;
		this._point_resize_base_width = null;
		this._point_resize_base_height = null;
		this._point_resize_layer_id = null;
	}

	is_point_text_transform_active(layer) {
		// Live ctx.scale preview disabled when we bake real font sizes during drag.
		// Returning false avoids double-scaling (fonts *and* canvas scale).
		return false;
	}

	resize_to_dynamic_bounds(layer, editor) {
		// During Move-handle scaling, the drag owns width/height.
		if (this._point_resize_snapshot) return;
		if (layer && layer.type === 'text' && layer.params && layer.params.boundary === 'dynamic' && editor) {
			// Grow from the anchor (x,y); never mutate other layers.
			const new_width = Math.max(1, Math.ceil(editor.textBoundaryWidth + 1));
			const new_height = Math.max(1, Math.ceil(editor.textBoundaryHeight + 1));
			if (layer.width !== new_width) layer.width = new_width;
			if (layer.height !== new_height) layer.height = new_height;
		}
	}

	extend_fixed_bounds(layer, editor) {
		// Paragraph/box: keep the box size fixed and clip overflowing glyphs in render().
		// (Growing the box here made overflow fight the handles.)
		return;
	}

	render(ctx, layer) {
		if (!layer || layer.type !== 'text')
			return;
		const editor = this.get_editor(layer);
		if (!editor)
			return;
		if (layer.width == 0 && layer.height == 0 && !layer.data)
			return;

		const isActiveLayerAndTextTool = layer === config.layer && config.TOOL.name === 'text';
		const isBoxBoundary = layer.params && layer.params.boundary === 'box';
		const pointTransforming = this.is_point_text_transform_active(layer);
		editor.selection.set_visible(isActiveLayerAndTextTool);
		// Caret for point & paragraph while active with Type tool
		editor.selection.set_cursor_visible(isActiveLayerAndTextTool && (this.selecting || this.creating || this.focused));
		ctx.save();
		if (isBoxBoundary && layer.width > 0 && layer.height > 0) {
			// Clip overflowing paragraph text inside the box
			ctx.beginPath();
			ctx.rect(layer.x, layer.y, layer.width, layer.height);
			ctx.clip();
		}
		editor._pointTransforming = pointTransforming;
		editor.render(ctx, layer);
		editor._pointTransforming = false;
		editor._livePointScale = null;
		ctx.restore();
		// Don't snap dynamic bounds while a transform drag is controlling width/height
		if (layer === config.layer && !pointTransforming) {
			this.resize_to_dynamic_bounds(layer, editor);
		}
		if (isActiveLayerAndTextTool && !isBoxBoundary && (this.focused || this.selecting || this.creating)) {
			this.draw_point_text_chrome(ctx, layer, editor);
		}
		// Point text: no wrap-box chrome/handles. Paragraph/box: dashed box + square handles.
		if (this._selection_config) {
			const showBoxChrome = isActiveLayerAndTextTool && isBoxBoundary;
			this._selection_config.enable_borders = showBoxChrome;
			this._selection_config.enable_controls = showBoxChrome;
			this._selection_config.enable_rotation = showBoxChrome;
			this._selection_config.border_style = showBoxChrome ? 'dashed_light' : null;
			this._selection_config.handle_style = showBoxChrome ? 'bw_square' : null;
		}
		if (!this.resizing && isActiveLayerAndTextTool && isBoxBoundary) {
			this.selection.x = layer.x;
			this.selection.y = layer.y;
			this.selection.width = layer.width;
			this.selection.height = layer.height;
			this.selection.rotate = layer.rotate;
		} else {
			this.selection.x = -100000;
			this.selection.y = -100000;
			this.selection.width = 0;
			this.selection.height = 0;
		}
	}

	build_default_span_meta() {
		const params = this.getParams ? this.getParams() : {};
		const fontVal = params.font && (params.font.value || params.font);
		const sizeVal = (params.size && typeof params.size === 'object') ? params.size.value : params.size;
		// Always inherit the current foreground color for new text
		const fillVal = config.COLOR || metaDefaults.fill_color;
		return {
			family: fontVal || metaDefaults.family,
			size: (!isNaN(sizeVal) && sizeVal != null) ? sizeVal : metaDefaults.size,
			fill_color: fillVal,
		};
	}

	/**
	 * Keep Type Tool fill attribute (and options-bar swatch) in sync with foreground.
	 * @param {{rebuild?: boolean}} options - rebuild re-renders the whole attributes bar (tool activate).
	 */
	sync_fill_from_foreground(options = {}) {
		const color = config.COLOR;
		if (!color || !config.TOOL || config.TOOL.name !== 'text') return;
		try {
			const toolAttributes = this.GUI_tools && this.GUI_tools.action_data
				? this.GUI_tools.action_data().attributes
				: null;
			if (!toolAttributes) return;
			if (toolAttributes.fill === color && !options.rebuild) {
				// Still refresh the visible swatch if the widget exists
			} else {
				toolAttributes.fill = color;
			}
			if (options.rebuild && this.GUI_tools.show_action_attributes) {
				this.GUI_tools.show_action_attributes();
				return;
			}
			// Lightweight: update existing fill color input without rebuilding the bar
			const $fill = $('#action_attributes .item.fill input');
			if ($fill.length && typeof $fill.uiColorInput === 'function') {
				try {
					$fill.uiColorInput('set_value', color);
				} catch (e) {
					$fill.val(color);
				}
			}
		} catch (e) { /* ignore */ }
	}

	/**
	 * Seed "Lorem ipsum", select all, use FG color / Roboto / 38.
	 */
	seed_placeholder_text(layer, editor, { selectAll = true } = {}) {
		if (!layer || !editor) return;
		load_font_family({ family: metaDefaults.family }, () => {
			this.hasValueChanged = true;
			if (this.Base_layers) this.Base_layers.render();
		});
		const meta = this.build_default_span_meta();
		editor.document.lines = [[{ text: LOREM_IPSUM, meta }]];
		editor.hasValueChanged = true;
		layer.data = editor.document.lines;
		editor.set_lines(editor.document.lines, false);
		if (selectAll) {
			const lastLine = editor.document.lines.length - 1;
			editor.selection.set_position(0, 0, false);
			editor.selection.set_position(lastLine, editor.document.get_line_character_count(lastLine), true);
		}
		this.focusedValue = JSON.stringify(editor.document.lines);
		this.focusedWidth = layer.width;
		this.focusedHeight = layer.height;
		this.resize_to_dynamic_bounds(layer, editor);
	}

	/**
	 * Point-text chrome: black square anchor at baseline start + light underline.
	 */
	draw_point_text_chrome(ctx, layer, editor) {
		if (!layer || !editor || !layer.params || layer.params.boundary !== 'dynamic') return;
		if (!editor.lineRenderInfo || !editor.lineRenderInfo.wrapSizes || !editor.lineRenderInfo.wrapSizes.length) return;
		const wrap0 = editor.lineRenderInfo.wrapSizes[0];
		const line0 = editor.lineRenderInfo.lines && editor.lineRenderInfo.lines[0];
		const offsets = line0 && line0.wraps && line0.wraps[0] ? line0.wraps[0].characterOffsets : [0, 0];
		const textWidth = Math.max(0, (offsets[offsets.length - 1] || 0));
		const ax = layer.x + 1;
		const baselineY = layer.y + 1 + wrap0.offset + wrap0.baseline;
		const underlineY = baselineY + 2;
		// Light baseline under the text
		ctx.save();
		ctx.strokeStyle = 'rgba(0,0,0,0.2)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(ax, underlineY);
		ctx.lineTo(ax + Math.max(textWidth, 8), underlineY);
		ctx.stroke();
		// Black filled square anchor at the point
		const s = 5;
		ctx.fillStyle = '#000000';
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 1;
		ctx.fillRect(ax - s / 2, baselineY - s / 2, s, s);
		ctx.strokeRect(ax - s / 2, baselineY - s / 2, s, s);
		ctx.restore();
	}

	get_editor(layer) {

		if (!layer || layer.type !== 'text') return null;
		let editor = layerEditors.get(layer);
		if (!editor) {
			editor = new Text_editor_class();

			// Convert legacy to new format
			if (layer.params && layer.params.text) {
				const params = layer.params;
				let lines = [];
				const textLines = layer.params.text.split('\n');
				const family = params.family && params.family.value? params.family.value : params.family;
				for (const textLine of textLines) {
					lines.push([
						{
							text: textLine,
							meta: {
								family,
								size: params.size,
								bold: params.bold,
								italic: params.italic,
								fill_color: params.stroke ? '#ffffff00' : layer.color,
								stroke_color: params.stroke ? layer.color : '#ffffff00',
								stroke_size: params.stroke ? params.stroke_size : 0,
								leading: 0
							}
						}
					]);
				}
				params.boundary = 'box';
				params.kerning = 'metrics';
				params.halign = params.align ? (params.align.value ? params.align.value : params.align).toLowerCase() : 'left';
				params.valign = 'top';
				params.text_direction = 'ltr';
				params.wrap_direction = 'ttb';
				params.wrap = 'word';
				delete params.text;
				delete params.family;
				delete params.size;
				delete params.bold;
				delete params.italic;
				delete params.stroke;
				delete params.stroke_size;
				delete params.align;
				layer.data = lines;
				layer.x -= 1;

				// Change leading offset so line height matches legacy line height calculation... need to load the font first to do this.
				// This is an approximate calculation, but seems to be pretty close.
				load_font_family({ family }, () => {
					const line = layer.data[0];
					if (!line) return;
					const span = line[0];
					if (!span) return;
					const fontMetrics = editor.get_span_font_metrics(span, !fontLoadMap.get(span.meta.family || metaDefaults.family));
					const topBounds = fontMetrics.calculate_letter_bounds('M', 'top');
					span.meta.leading = (span.meta.size || metaDefaults.size) - fontMetrics.height;
					layer.y += Math.abs(span.meta.leading) - (fontMetrics.baseline - topBounds.bottom);
					editor.hasValueChanged = true;
					editor.Base_layers.render();
				});
			}

			// Create initial layer data if new layer
			if (!layer.data) {
				layer.data = [[{
					text: '',
					meta: this.build_default_span_meta()
				}]];
			}

			editor.set_lines(layer.data);
			editor.Base_layers = this.Base_layers;
			editor.layer = layer;
			layerEditors.set(layer, editor);
		}
		if (layer._needs_update_data) {
			delete layer._needs_update_data;
			const preserve = !!this._preserve_selection;
			if (layer.data) {
				editor.hasValueChanged = true;
				editor.set_lines(JSON.parse(JSON.stringify(layer.data)), preserve);
			}
			if (preserve && this._preserve_selection) {
				this.restore_selection(editor, this._preserve_selection);
			}
			if (layer === this.layer || layer === config.layer) {
				this.focusedValue = JSON.stringify(editor.document.lines);
				this.focusedWidth = layer.width;
				this.focusedHeight = layer.height;
			}
		}
		return editor;
	}

	get_text_layer_at_mouse(e) {
		const layers_sorted = this.Base_layers.get_sorted_layers();
		if (config.layer && config.layer.type === 'text') {
			layers_sorted.unshift(config.layer);
		}
		const mouse = this.get_mouse_info(e);
		const clickableMargin = 5;
		for (let layer of layers_sorted) {
			if (layer.type === 'text') {
				// TODO - account for rotation
				if (mouse.x >= layer.x - clickableMargin && mouse.x <= layer.x + layer.width + clickableMargin && mouse.y >= layer.y - clickableMargin && mouse.y <= layer.y + layer.height + clickableMargin) {
					return layer;
				}
			}
		}
		return null;
	}

}

export default Text_class;