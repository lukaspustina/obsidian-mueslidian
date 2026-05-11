// Manual mock for the `obsidian` peer package used in Vitest.
// Provides minimal stubs for the types/values that src/* imports.
// Tests can override individual exports via `vi.mock('obsidian', () => ({ ... }))`.

import { vi } from 'vitest';

export class TFile {
  path = '';
  name = '';
  basename = '';
  extension = 'md';
}

export class TFolder {
  path = '';
  name = '';
  children: unknown[] = [];
}

export const normalizePath = (p: string): string => p;

export class Notice {
  constructor(public message: string, public timeout?: number) {}
}

/**
 * A minimal recording HTMLElement used by Modal.contentEl in tests.
 * Each create call appends an entry to `createdEls` on the modal so tests
 * can assert what was rendered without needing a real DOM.
 */
export class MockEl {
  text = '';
  children: MockEl[] = [];
  attrs: Record<string, unknown> = {};
  style: Record<string, string> = {};
  onclick: (() => void) | null = null;
  setText(s: string): void {
    this.text = s;
  }
  appendText(s: string): void {
    this.text += s;
  }
  empty(): void {
    this.children = [];
    this.text = '';
  }
  createEl(tag: string, opts?: { text?: string }): MockEl {
    const child = new MockEl();
    if (opts?.text) child.text = opts.text;
    child.attrs.tag = tag;
    this.children.push(child);
    return child;
  }
  createDiv(): MockEl {
    return this.createEl('div');
  }
}

export class Modal {
  contentEl: MockEl = new MockEl();
  constructor(public app?: unknown) {}
  open(): void {
    // Subclasses override onOpen; the real Obsidian calls it after open().
    if (typeof (this as unknown as { onOpen?: () => void }).onOpen === 'function') {
      (this as unknown as { onOpen: () => void }).onOpen();
    }
  }
  close(): void {}
}

export class Plugin {
  app: unknown;
  manifest: unknown;
  constructor(app?: unknown, manifest?: unknown) {
    this.app = app;
    this.manifest = manifest;
  }
  addCommand(_cmd: unknown): void {}
  addSettingTab(_tab: unknown): void {}
  addStatusBarItem(): { setText: (s: string) => void } {
    return { setText: () => {} };
  }
  registerInterval(_id: number): void {}
  async loadData(): Promise<unknown> {
    return null;
  }
  async saveData(_data: unknown): Promise<void> {}
  onload(): void | Promise<void> {}
  onunload(): void {}
}

export class PluginSettingTab {
  containerEl = { empty: () => {}, createDiv: () => ({}) };
  constructor(public app?: unknown, public plugin?: unknown) {}
  display(): void {}
  hide(): void {}
}

export class Setting {
  constructor(_containerEl: unknown) {}
  setName(_name: string): this {
    return this;
  }
  setDesc(_desc: string): this {
    return this;
  }
  addText(_cb: (text: unknown) => void): this {
    return this;
  }
  addToggle(_cb: (toggle: unknown) => void): this {
    return this;
  }
  addTextArea(_cb: (text: unknown) => void): this {
    return this;
  }
  addButton(_cb: (btn: unknown) => void): this {
    return this;
  }
}

export interface App {
  vault: unknown;
  metadataCache: unknown;
  plugins?: unknown;
  commands?: unknown;
}

export interface CachedMetadata {
  frontmatter?: Record<string, unknown>;
}
