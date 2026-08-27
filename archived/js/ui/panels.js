import { bus } from '../core/event-bus.js?v=5';
import { state } from '../core/state.js?v=5';
import { Layer } from '../layers/layer.js?v=5';

export class Panels {
  constructor() {
    this.el = document.getElementById('panels');
    this._render();
    this._setupListeners();
  }

  _render() {
    this.el.innerHTML = '';
    this._renderColorPanel();
    this._renderLayersPanel();
    this._renderPropertiesPanel();
  }

  _renderColorPanel() {
    const panel = this._createPanel('Color');
    const body = panel.querySelector('.panel-body');

    body.innerHTML = `
      <div class="color-picker-area" id="color-area">
        <canvas class="color-gradient-sv" id="color-sv"></canvas>
      </div>
      <div class="color-hue-bar" id="color-hue"></div>
      <div class="color-alpha-bar" id="color-alpha-bar">
        <canvas id="color-alpha-canvas"></canvas>
      </div>
      <div class="color-preview">
        <div class="color-swatch" id="color-fg" title="Foreground Color"></div>
        <div class="color-swatch" id="color-bg" title="Background Color"></div>
      </div>
      <div class="color-inputs">
        <div class="color-input-group">
          <label>#</label>
          <input type="text" id="color-hex" maxlength="6" value="000000">
        </div>
        <div class="color-input-group">
          <label>R</label>
          <input type="number" id="color-r" min="0" max="255" value="0">
        </div>
        <div class="color-input-group">
          <label>G</label>
          <input type="number" id="color-g" min="0" max="255" value="0">
        </div>
        <div class="color-input-group">
          <label>B</label>
          <input type="number" id="color-b" min="0" max="255" value="0">
        </div>
      </div>
    `;

    this.el.appendChild(panel);

    this._initColorPicker();
  }

  _initColorPicker() {
    const svCanvas = document.getElementById('color-sv');
    const svCtx = svCanvas.getContext('2d');
    const hueBar = document.getElementById('color-hue');
    const alphaBar = document.getElementById('color-alpha-bar');
    const alphaCanvas = document.getElementById('color-alpha-canvas');
    const alphaCtx = alphaCanvas.getContext('2d');
    const hexInput = document.getElementById('color-hex');
    const rInput = document.getElementById('color-r');
    const gInput = document.getElementById('color-g');
    const bInput = document.getElementById('color-b');
    const fgSwatch = document.getElementById('color-fg');

    let hue = 0;
    let saturation = 1;
    let value = 0;
    let alpha = 1;

    const resizeSV = () => {
      svCanvas.width = svCanvas.clientWidth;
      svCanvas.height = svCanvas.clientHeight;
      drawSV();
    };

    const drawSV = () => {
      const w = svCanvas.width;
      const h = svCanvas.height;

      const hueColor = this._hsvToRgb(hue, 1, 1);
      const hueStr = `rgb(${hueColor.r}, ${hueColor.g}, ${hueColor.b})`;

      const gradH = svCtx.createLinearGradient(0, 0, w, 0);
      gradH.addColorStop(0, '#ffffff');
      gradH.addColorStop(1, hueStr);
      svCtx.fillStyle = gradH;
      svCtx.fillRect(0, 0, w, h);

      const gradV = svCtx.createLinearGradient(0, 0, 0, h);
      gradV.addColorStop(0, 'rgba(0,0,0,0)');
      gradV.addColorStop(1, '#000000');
      svCtx.fillStyle = gradV;
      svCtx.fillRect(0, 0, w, h);
    };

    const resizeAlpha = () => {
      alphaCanvas.width = alphaBar.clientWidth;
      alphaCanvas.height = alphaBar.clientHeight;
      drawAlpha();
    };

    const drawAlpha = () => {
      const w = alphaCanvas.width;
      const h = alphaCanvas.height;

      const rgb = this._hsvToRgb(hue, saturation, value);
      const color = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

      alphaCtx.clearRect(0, 0, w, h);

      for (let x = 0; x < w; x += 8) {
        for (let y = 0; y < h; y += 8) {
          const isEven = ((x / 8 + y / 8) % 2) === 0;
          alphaCtx.fillStyle = isEven ? '#ffffff' : '#cccccc';
          alphaCtx.fillRect(x, y, 8, 8);
        }
      }

      const grad = alphaCtx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      alphaCtx.fillStyle = grad;
      alphaCtx.fillRect(0, 0, w, h);
    };

    const updateColor = () => {
      const rgb = this._hsvToRgb(hue, saturation, value);
      const hex = this._rgbToHex(rgb.r, rgb.g, rgb.b);

      fgSwatch.style.backgroundColor = `#${hex}`;
      hexInput.value = hex;
      rInput.value = rgb.r;
      gInput.value = rgb.g;
      bInput.value = rgb.b;

      state.set('foregroundColor', `#${hex}`);
      bus.emit('color:changed', { hex: `#${hex}`, rgb, alpha });
    };

    svCanvas.addEventListener('mousedown', (e) => {
      const pick = (ev) => {
        const rect = svCanvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
        saturation = x;
        value = 1 - y;
        drawAlpha();
        updateColor();
      };
      pick(e);
      const onMove = (ev) => pick(ev);
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    hueBar.addEventListener('mousedown', (e) => {
      const pick = (ev) => {
        const rect = hueBar.getBoundingClientRect();
        hue = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        drawSV();
        drawAlpha();
        updateColor();
      };
      pick(e);
      const onMove = (ev) => pick(ev);
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    alphaBar.addEventListener('mousedown', (e) => {
      const pick = (ev) => {
        const rect = alphaBar.getBoundingClientRect();
        alpha = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        updateColor();
      };
      pick(e);
      const onMove = (ev) => pick(ev);
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    hexInput.addEventListener('change', () => {
      const hex = hexInput.value.replace('#', '');
      if (hex.length === 6) {
        const rgb = this._hexToRgb(hex);
        const hsv = this._rgbToHsv(rgb.r, rgb.g, rgb.b);
        hue = hsv.h;
        saturation = hsv.s;
        value = hsv.v;
        drawSV();
        drawAlpha();
        updateColor();
      }
    });

    [rInput, gInput, bInput].forEach(input => {
      input.addEventListener('change', () => {
        const r = parseInt(rInput.value) || 0;
        const g = parseInt(gInput.value) || 0;
        const b = parseInt(bInput.value) || 0;
        const hsv = this._rgbToHsv(r, g, b);
        hue = hsv.h;
        saturation = hsv.s;
        value = hsv.v;
        drawSV();
        drawAlpha();
        updateColor();
      });
    });

    setTimeout(() => {
      resizeSV();
      resizeAlpha();
      updateColor();
    }, 100);

    new ResizeObserver(() => {
      resizeSV();
      resizeAlpha();
    }).observe(svCanvas.parentElement);
  }

  _hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  _rgbToHex(r, g, b) {
    return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  _hexToRgb(hex) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return { r, g, b };
  }

  _rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return { h, s, v };
  }

  _renderLayersPanel() {
    const panel = this._createPanel('Layers');
    const body = panel.querySelector('.panel-body');

    body.innerHTML = `
      <div class="layer-blend-mode">
        <select id="layer-blend-select">
          <option value="normal">Normal</option>
          <option value="multiply">Multiply</option>
          <option value="screen">Screen</option>
          <option value="overlay">Overlay</option>
          <option value="darken">Darken</option>
          <option value="lighten">Lighten</option>
          <option value="color-dodge">Color Dodge</option>
          <option value="color-burn">Color Burn</option>
          <option value="hard-light">Hard Light</option>
          <option value="soft-light">Soft Light</option>
          <option value="difference">Difference</option>
          <option value="exclusion">Exclusion</option>
        </select>
      </div>
      <div class="layer-opacity-slider">
        <label>Opacity:</label>
        <input type="range" id="layer-opacity-range" min="0" max="100" value="100">
        <span id="layer-opacity-val">100%</span>
      </div>
      <div class="layers-list" id="layers-list"></div>
      <div class="layer-actions">
        <button class="layer-action-btn" id="layer-add-btn" title="New Layer">+ New</button>
        <button class="layer-action-btn" id="layer-dup-btn" title="Duplicate Layer">Dup</button>
        <button class="layer-action-btn" id="layer-del-btn" title="Delete Layer">Del</button>
        <button class="layer-action-btn" id="layer-up-btn" title="Move Up">&uarr;</button>
        <button class="layer-action-btn" id="layer-down-btn" title="Move Down">&darr;</button>
      </div>
    `;

    this.el.appendChild(panel);

    document.getElementById('layer-add-btn').addEventListener('click', () => bus.emit('layer:new'));
    document.getElementById('layer-dup-btn').addEventListener('click', () => bus.emit('layer:duplicate'));
    document.getElementById('layer-del-btn').addEventListener('click', () => bus.emit('layer:delete'));
    document.getElementById('layer-up-btn').addEventListener('click', () => bus.emit('layer:move-up'));
    document.getElementById('layer-down-btn').addEventListener('click', () => bus.emit('layer:move-down'));

    document.getElementById('layer-blend-select').addEventListener('change', (e) => {
      const active = this._getActiveLayer();
      if (active) {
        active.blendMode = e.target.value;
        bus.emit('layer:blend-mode-changed', active);
      }
    });

    document.getElementById('layer-opacity-range').addEventListener('input', (e) => {
      const active = this._getActiveLayer();
      if (active) {
        active.opacity = parseInt(e.target.value);
        document.getElementById('layer-opacity-val').textContent = active.opacity + '%';
        bus.emit('layer:opacity-changed', active);
      }
    });

    this._refreshLayers();
  }

  _getActiveLayer() {
    const doc = state.get('document');
    if (!doc) return null;
    return doc.layers[doc.layers.length - 1] || null;
  }

  _refreshLayers() {
    const list = document.getElementById('layers-list');
    if (!list) return;

    const doc = state.get('document');
    if (!doc) {
      list.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 12px;">No document open</div>';
      return;
    }

    list.innerHTML = '';

    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const layer = doc.layers[i];
      const item = document.createElement('div');
      item.className = 'layer-item';
      item.dataset.index = i;

      const thumb = document.createElement('canvas');
      thumb.className = 'layer-thumbnail';
      thumb.width = 32;
      thumb.height = 32;
      const thumbCtx = thumb.getContext('2d');
      if (layer.canvas) {
        const scale = Math.min(32 / layer.canvas.width, 32 / layer.canvas.height);
        const w = layer.canvas.width * scale;
        const h = layer.canvas.height * scale;
        thumbCtx.drawImage(layer.canvas, (32 - w) / 2, (32 - h) / 2, w, h);
      }

      const vis = document.createElement('span');
      vis.className = 'layer-visibility';
      vis.textContent = layer.visible ? '\u{1F441}' : '\u{25CB}';
      vis.addEventListener('click', (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        bus.emit('layer:visibility-changed', layer);
        this._refreshLayers();
      });

      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = layer.name;
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.value = layer.name;
        name.textContent = '';
        name.appendChild(input);
        input.focus();
        input.select();
        const finish = () => {
          layer.name = input.value || layer.name;
          name.textContent = layer.name;
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (ke) => {
          if (ke.key === 'Enter') finish();
          if (ke.key === 'Escape') { input.value = layer.name; finish(); }
        });
      });

      item.appendChild(vis);
      item.appendChild(thumb);
      item.appendChild(name);

      item.addEventListener('click', () => {
        list.querySelectorAll('.layer-item').forEach(li => li.classList.remove('active'));
        item.classList.add('active');
        state.set('activeLayer', layer);

        const blendSelect = document.getElementById('layer-blend-select');
        const opacityRange = document.getElementById('layer-opacity-range');
        const opacityVal = document.getElementById('layer-opacity-val');
        if (blendSelect) blendSelect.value = layer.blendMode || 'normal';
        if (opacityRange) opacityRange.value = layer.opacity ?? 100;
        if (opacityVal) opacityVal.textContent = (layer.opacity ?? 100) + '%';
      });

      list.appendChild(item);
    }

    if (doc.layers.length > 0) {
      list.firstChild?.classList.add('active');
    }
  }

  _renderPropertiesPanel() {
    const panel = this._createPanel('Properties');
    const body = panel.querySelector('.panel-body');
    body.innerHTML = `
      <div style="color: var(--text-secondary); text-align: center; padding: 12px; font-size: 11px;">
        Select a layer to view properties
      </div>
    `;
    this.el.appendChild(panel);
  }

  _createPanel(title) {
    const panel = document.createElement('div');
    panel.className = 'panel';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `<span>${title}</span><span class="panel-toggle">&#9660;</span>`;

    const body = document.createElement('div');
    body.className = 'panel-body';

    header.addEventListener('click', () => {
      body.classList.toggle('collapsed');
      header.querySelector('.panel-toggle').classList.toggle('collapsed');
    });

    panel.appendChild(header);
    panel.appendChild(body);
    return panel;
  }

  _setupListeners() {
    bus.on('layer:added', () => this._refreshLayers());
    bus.on('layer:removed', () => this._refreshLayers());
    bus.on('layer:modified', () => this._refreshLayers());
    bus.on('layer:reordered', () => this._refreshLayers());
    bus.on('layer:visibility-changed', () => this._refreshLayers());
    bus.on('layer:opacity-changed', () => this._refreshLayers());
    bus.on('layer:blend-mode-changed', () => this._refreshLayers());
    bus.on('document:created', () => this._refreshLayers());
    bus.on('document:loaded', () => this._refreshLayers());
  }
}
