import { bus } from '../core/event-bus.js?v=5';
import { state } from '../core/state.js?v=5';

export class OptionsBar {
  constructor() {
    this.el = document.getElementById('options-bar');
    this._renderForTool(state.get('activeTool'));

    bus.on('tool:changed', ({ current }) => this._renderForTool(current));
  }

  _renderForTool(toolId) {
    this.el.innerHTML = '';

    switch (toolId) {
      case 'move':
        this._renderMoveOptions();
        break;
      case 'crop':
        this._renderCropOptions();
        break;
      case 'transform':
        this._renderTransformOptions();
        break;
      default:
        this._renderDefault();
    }
  }

  _renderMoveOptions() {
    this._addLabel('Move Tool');
    this._addSeparator();
    this._addCheckbox('Auto-Select', 'auto-select', true);
  }

  _renderCropOptions() {
    this._addLabel('Crop Tool');
    this._addSeparator();

    this._addLabel('Aspect Ratio:');
    const select = this._addSelect('crop-aspect', [
      { value: 'free', label: 'Free' },
      { value: '1:1', label: '1:1' },
      { value: '4:3', label: '4:3' },
      { value: '16:9', label: '16:9' },
      { value: '3:2', label: '3:2' },
    ]);

    this._addSeparator();

    const applyBtn = document.createElement('button');
    applyBtn.className = 'layer-action-btn';
    applyBtn.textContent = 'Apply Crop';
    applyBtn.style.cssText = 'width: auto; padding: 2px 12px;';
    applyBtn.addEventListener('click', () => bus.emit('crop:apply'));
    this.el.appendChild(applyBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'layer-action-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'width: auto; padding: 2px 12px;';
    cancelBtn.addEventListener('click', () => bus.emit('crop:cancel'));
    this.el.appendChild(cancelBtn);
  }

  _renderTransformOptions() {
    this._addLabel('Transform');
    this._addSeparator();

    this._addLabel('X:');
    this._addNumberInput('transform-x', 0);
    this._addLabel('Y:');
    this._addNumberInput('transform-y', 0);
    this._addLabel('W:');
    this._addNumberInput('transform-w', 100);
    this._addLabel('H:');
    this._addNumberInput('transform-h', 100);

    this._addSeparator();

    const applyBtn = document.createElement('button');
    applyBtn.className = 'layer-action-btn';
    applyBtn.textContent = 'Apply';
    applyBtn.style.cssText = 'width: auto; padding: 2px 12px;';
    applyBtn.addEventListener('click', () => bus.emit('transform:apply'));
    this.el.appendChild(applyBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'layer-action-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'width: auto; padding: 2px 12px;';
    cancelBtn.addEventListener('click', () => bus.emit('transform:cancel'));
    this.el.appendChild(cancelBtn);
  }

  _renderDefault() {
    this._addLabel('PhotoChop');
  }

  _addLabel(text) {
    const label = document.createElement('span');
    label.className = 'option-label';
    label.textContent = text;
    this.el.appendChild(label);
  }

  _addSeparator() {
    const sep = document.createElement('div');
    sep.className = 'option-separator';
    this.el.appendChild(sep);
  }

  _addCheckbox(label, id, checked = false) {
    const wrapper = document.createElement('label');
    wrapper.className = 'option-checkbox';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.checked = checked;

    wrapper.appendChild(cb);
    wrapper.appendChild(document.createTextNode(label));
    this.el.appendChild(wrapper);
  }

  _addSelect(id, options) {
    const select = document.createElement('select');
    select.className = 'option-select';
    select.id = id;

    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      select.appendChild(o);
    }

    select.addEventListener('change', () => {
      bus.emit(`option:${id}:changed`, select.value);
    });

    this.el.appendChild(select);
    return select;
  }

  _addNumberInput(id, value = 0) {
    const input = document.createElement('input');
    input.className = 'option-input';
    input.type = 'number';
    input.id = id;
    input.value = value;
    input.style.width = '50px';

    input.addEventListener('change', () => {
      bus.emit(`option:${id}:changed`, parseFloat(input.value));
    });

    this.el.appendChild(input);
    return input;
  }
}
