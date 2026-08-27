import { bus } from './core/event-bus.js?v=5';
import { state } from './core/state.js?v=5';
import { CanvasRenderer } from './core/canvas-renderer.js?v=5';
import { FileManager } from './core/file-manager.js?v=5';
import { MenuBar } from './ui/menu.js?v=5';
import { Toolbar } from './ui/toolbar.js?v=5';
import { OptionsBar } from './ui/options-bar.js?v=5';
import { Panels } from './ui/panels.js?v=5';
import { Dialogs } from './ui/dialogs.js?v=5';
import { ToolManager } from './tools/tool-manager.js?v=5';
import { MoveTool } from './tools/move-tool.js?v=5';
import { TransformTool } from './tools/transform-tool.js?v=5';
import { CropTool } from './tools/crop-tool.js?v=5';
import { LayerManager } from './layers/layer-manager.js?v=5';

class PhotoChopApp {
  constructor() {
    this.renderer = new CanvasRenderer();
    window._renderer = this.renderer;

    this.fileManager = new FileManager();
    this.menuBar = new MenuBar();
    this.toolbar = new Toolbar();
    this.optionsBar = new OptionsBar();
    this.panels = new Panels();
    this.dialogs = new Dialogs();

    this.toolManager = new ToolManager(this.renderer);
    this.toolManager.register(new MoveTool(this.renderer));
    this.toolManager.register(new TransformTool(this.renderer));
    this.toolManager.register(new CropTool(this.renderer));

    this.layerManager = new LayerManager();

    this._setupViewControls();
    this._setupStatusBar();
    this._setupCanvasSizeHandler();
    this._showWelcome();

    bus.emit('status:update', 'PhotoChop ready');
  }

  _showWelcome() {
    const workspace = document.getElementById('workspace');
    const existing = workspace.querySelector('.workspace-empty');
    if (existing) existing.remove();

    if (!state.get('document')) {
      const empty = document.createElement('div');
      empty.className = 'workspace-empty';
      empty.innerHTML = `
        <h2>PhotoChop</h2>
        <p>Create a new document or open an image to get started</p>
        <p><kbd>Ctrl+N</kbd> New &nbsp; <kbd>Ctrl+O</kbd> Open &nbsp; <kbd>Ctrl+S</kbd> Save</p>
      `;
      workspace.appendChild(empty);

      bus.once('document:created', () => empty.remove());
      bus.once('document:loaded', () => empty.remove());
    }
  }

  _setupViewControls() {
    bus.on('view:zoom-in', () => {
      const zoom = Math.min(10, state.get('zoom') + 0.25);
      state.set('zoom', zoom);
      bus.emit('view:changed');
    });

    bus.on('view:zoom-out', () => {
      const zoom = Math.max(0.1, state.get('zoom') - 0.25);
      state.set('zoom', zoom);
      bus.emit('view:changed');
    });

    bus.on('view:fit', () => {
      state.set('zoom', 1);
      state.set('panX', 0);
      state.set('panY', 0);
      bus.emit('view:changed');
    });

    bus.on('view:actual', () => {
      state.set('zoom', 1);
      state.set('panX', 0);
      state.set('panY', 0);
      bus.emit('view:changed');
    });

    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;

    const workspace = document.getElementById('workspace');

    workspace.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isPanning = true;
        panStartX = e.clientX - state.get('panX');
        panStartY = e.clientY - state.get('panY');
        e.preventDefault();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (isPanning) {
        state.set('panX', e.clientX - panStartX);
        state.set('panY', e.clientY - panStartY);
        bus.emit('view:changed');
      }
    });

    document.addEventListener('mouseup', () => {
      isPanning = false;
    });
  }

  _setupStatusBar() {
    const statusBar = document.getElementById('status-bar');
    statusBar.innerHTML = `
      <span class="status-item" id="status-text">Ready</span>
      <span class="status-item" id="status-size"></span>
      <span class="status-item" id="status-zoom"></span>
      <span class="status-item" id="status-pos"></span>
    `;

    bus.on('status:update', (text) => {
      document.getElementById('status-text').textContent = text;
    });

    bus.on('document:created', () => this._updateStatusSize());
    bus.on('document:loaded', () => this._updateStatusSize());
    bus.on('document:resized', () => this._updateStatusSize());
    bus.on('view:changed', () => this._updateStatusZoom());

    const mainCanvas = this.renderer.mainCanvas;
    mainCanvas.addEventListener('mousemove', (e) => {
      const pos = this.renderer.screenToCanvas(e.clientX, e.clientY);
      document.getElementById('status-pos').textContent =
        `X: ${Math.round(pos.x)} Y: ${Math.round(pos.y)}`;
    });

    this._updateStatusZoom();
  }

  _updateStatusSize() {
    const doc = state.get('document');
    if (doc) {
      document.getElementById('status-size').textContent =
        `${doc.width} x ${doc.height} px`;
    }
  }

  _updateStatusZoom() {
    const zoom = Math.round(state.get('zoom') * 100);
    document.getElementById('status-zoom').textContent = `${zoom}%`;
  }

  _setupCanvasSizeHandler() {
    const container = document.getElementById('canvas-container');

    const showCanvas = (doc) => {
      container.classList.remove('hidden');
      this.renderer.setCanvasSize(doc.width, doc.height);
      this.renderer.render();
    };

    bus.on('document:resized', ({ width, height }) => {
      this.renderer.setCanvasSize(width, height);
      this.renderer.render();
    });

    bus.on('document:created', showCanvas);
    bus.on('document:loaded', showCanvas);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PhotoChopApp();
});
