import { bus } from '../core/event-bus.js?v=5';
import { state } from '../core/state.js?v=5';

const menuDef = [
  {
    label: 'File',
    items: [
      { label: 'New...', action: 'menu:new', shortcut: 'Ctrl+N' },
      { label: 'Open...', action: 'menu:open', shortcut: 'Ctrl+O' },
      { type: 'separator' },
      { label: 'Save', action: 'menu:save', shortcut: 'Ctrl+S' },
      { label: 'Save As...', action: 'menu:save-as', shortcut: 'Ctrl+Shift+S' },
      { type: 'separator' },
      { label: 'Export as PNG', action: 'menu:export-png' },
      { label: 'Export as JPEG', action: 'menu:export-jpeg' },
      { type: 'separator' },
      { label: 'Place Image...', action: 'menu:place-image' },
    ]
  },
  {
    label: 'Edit',
    items: [
      { label: 'Undo', action: 'menu:undo', shortcut: 'Ctrl+Z', disabled: true },
      { label: 'Redo', action: 'menu:redo', shortcut: 'Ctrl+Shift+Z', disabled: true },
      { type: 'separator' },
      { label: 'Copy', action: 'menu:copy', shortcut: 'Ctrl+C', disabled: true },
      { label: 'Paste', action: 'menu:paste', shortcut: 'Ctrl+V', disabled: true },
      { type: 'separator' },
      { label: 'Select All', action: 'menu:select-all', shortcut: 'Ctrl+A', disabled: true },
    ]
  },
  {
    label: 'Image',
    items: [
      { label: 'Canvas Size...', action: 'menu:canvas-size' },
      { type: 'separator' },
      { label: 'Flatten Image', action: 'menu:flatten', disabled: true },
      { label: 'Merge Visible', action: 'menu:merge-visible', disabled: true },
    ]
  },
  {
    label: 'Layer',
    items: [
      { label: 'New Layer', action: 'layer:new', shortcut: 'Ctrl+Shift+N' },
      { label: 'Duplicate Layer', action: 'layer:duplicate', disabled: true },
      { label: 'Delete Layer', action: 'layer:delete' },
      { type: 'separator' },
      { label: 'Merge Down', action: 'layer:merge-down', disabled: true },
      { label: 'Flatten', action: 'menu:flatten', disabled: true },
    ]
  },
  {
    label: 'View',
    items: [
      { label: 'Zoom In', action: 'view:zoom-in', shortcut: 'Ctrl++' },
      { label: 'Zoom Out', action: 'view:zoom-out', shortcut: 'Ctrl+-' },
      { label: 'Fit to Screen', action: 'view:fit', shortcut: 'Ctrl+0' },
      { label: 'Actual Size', action: 'view:actual', shortcut: 'Ctrl+1' },
      { type: 'separator' },
      { label: 'Toggle Grid', action: 'view:toggle-grid', shortcut: "Ctrl+'" },
    ]
  }
];

export class MenuBar {
  constructor() {
    this.el = document.getElementById('menu-bar');
    this.activeMenu = null;
    this._render();
    this._setupKeyboardShortcuts();
    this._setupGlobalClick();
  }

  _render() {
    this.el.innerHTML = '';
    for (const menu of menuDef) {
      const item = document.createElement('div');
      item.className = 'menu-item';
      item.textContent = menu.label;

      const dropdown = document.createElement('div');
      dropdown.className = 'menu-dropdown hidden';

      for (const mi of menu.items) {
        if (mi.type === 'separator') {
          const sep = document.createElement('div');
          sep.className = 'menu-separator';
          dropdown.appendChild(sep);
          continue;
        }

        const di = document.createElement('div');
        di.className = 'menu-dropdown-item' + (mi.disabled ? ' disabled' : '');
        di.innerHTML = `<span>${mi.label}</span>`;
        if (mi.shortcut) {
          di.innerHTML += `<span class="menu-shortcut">${mi.shortcut}</span>`;
        }
        di.addEventListener('click', (e) => {
          e.stopPropagation();
          this._closeAll();
          if (!mi.disabled) bus.emit(mi.action);
        });
        dropdown.appendChild(di);
      }

      item.appendChild(dropdown);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.activeMenu === item) {
          this._closeAll();
        } else {
          this._closeAll();
          dropdown.classList.remove('hidden');
          item.classList.add('active');
          this.activeMenu = item;
        }
      });

      item.addEventListener('mouseenter', () => {
        if (this.activeMenu && this.activeMenu !== item) {
          this._closeAll();
          dropdown.classList.remove('hidden');
          item.classList.add('active');
          this.activeMenu = item;
        }
      });

      this.el.appendChild(item);
    }
  }

  _closeAll() {
    this.el.querySelectorAll('.menu-dropdown').forEach(d => d.classList.add('hidden'));
    this.el.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
    this.activeMenu = null;
  }

  _setupGlobalClick() {
    document.addEventListener('click', () => this._closeAll());
  }

  _setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const key = [];
      if (e.ctrlKey || e.metaKey) key.push('Ctrl');
      if (e.shiftKey) key.push('Shift');
      if (e.altKey) key.push('Alt');

      let k = e.key;
      if (k === ' ') k = 'Space';
      else if (k.length === 1) k = k.toUpperCase();
      key.push(k);

      const shortcut = key.join('+');

      for (const menu of menuDef) {
        for (const mi of menu.items) {
          if (mi.shortcut === shortcut && !mi.disabled) {
            e.preventDefault();
            bus.emit(mi.action);
            return;
          }
        }
      }
    });
  }
}
