import { PluginSettingTab, Setting, normalizePath } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import type { MuesliSettings } from './types.js';

export type { MuesliSettings };

export const DEFAULT_SETTINGS: MuesliSettings = {
  apiKey: '',
  syncDirectory: 'Besprechungen',
  personFolder: 'Personen',
  allowedFolders: [] as string[],
  earliestCreationDate: null as string | null,
  documentSyncLimit: 0,
  periodicIntervalMinutes: 0,
  skipExistingNotes: false,
  filenameTemplate: '{date} {title}',
  filenameDateFormat: 'DD.MM.YYYY',
  includeMyNotesPlaceholder: true,
  includeEnhancedNotes: true,
  includeTranscript: true,
  bodyDateFormat: 'local' as const,
  bodyTimeZone: 'local' as const,
  myName: '',
  attendeeTagTemplate: 'person/{name}',
  additionalFrontmatter: '',
};

/**
 * R29: validate a vault-relative folder path. Rejects empty, traversal
 * segments (`..`), and absolute paths. Uses Obsidian's normalizePath to
 * coerce backslashes / multiple slashes. Returns the normalized path on
 * success, or null when the input is unsafe.
 */
export function safeFolderPath(input: string): string | null {
  const raw = input.trim();
  if (!raw) return '';
  if (raw.startsWith('/') || raw.startsWith('\\')) return null;
  const normalized = normalizePath(raw);
  // Reject any segment equal to ".." after normalization
  for (const seg of normalized.split('/')) {
    if (seg === '..') return null;
  }
  return normalized;
}

/**
 * R8: API key format check. Returns null when empty or valid; an error
 * message string when the value is non-empty and doesn't match `grn_*`.
 */
export function apiKeyWarning(value: string): string | null {
  if (value === '') return null;
  if (!/^grn_[a-zA-Z0-9]+$/.test(value)) {
    return 'API key does not match expected format (grn_*). Saved anyway — but Granola will reject it.';
  }
  return null;
}

/** Clamp `periodicIntervalMinutes` to [0, 1440]; returns the clamped value. */
export function clampInterval(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1440) return 1440;
  return Math.floor(n);
}

// ─── Settings tab UI ─────────────────────────────────────────────────────────

interface MueslidianHost extends Plugin {
  settings: MuesliSettings;
  saveSettings(): Promise<void>;
  triggerSyncNow?(): Promise<void>;
  clearFilteredOutCache?(): Promise<void>;
  viewLastSyncReport?(): void;
}

export class MueslidianSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: MueslidianHost) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Auth ───────────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Authentication' });

    new Setting(containerEl)
      .setName('API key')
      .setDesc('Granola API key (grn_*). Get one in Granola → Settings → Connectors.')
      .addText(t => {
        t.inputEl.type = 'password';
        t.setValue(this.plugin.settings.apiKey).onChange(async v => {
          this.plugin.settings.apiKey = v;
          await this.plugin.saveSettings();
          this.maybeWarnApiKey(v);
        });
      });

    // ── Locations ──────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Locations' });

    new Setting(containerEl)
      .setName('Sync directory')
      .setDesc('Vault folder where Granola notes are written.')
      .addText(t =>
        t.setValue(this.plugin.settings.syncDirectory).onChange(async v => {
          const safe = safeFolderPath(v);
          if (safe === null) {
            // Reject; the input keeps showing the user's value but the saved
            // value is reverted. Inline warning logged.
            new (globalThis as { Notice?: new (m: string) => unknown }).Notice!(
              `Müslidian: unsafe path "${v}" reverted`,
            );
            return;
          }
          this.plugin.settings.syncDirectory = safe || DEFAULT_SETTINGS.syncDirectory;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Person folder')
      .setDesc('Folder scanned for Person notes. Empty disables attendee linking.')
      .addText(t =>
        t.setValue(this.plugin.settings.personFolder).onChange(async v => {
          const safe = safeFolderPath(v);
          if (safe === null) {
            new (globalThis as { Notice?: new (m: string) => unknown }).Notice!(
              `Müslidian: unsafe path "${v}" reverted`,
            );
            return;
          }
          this.plugin.settings.personFolder = safe;
          await this.plugin.saveSettings();
        }),
      );

    // ── Filtering ──────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Filtering' });

    new Setting(containerEl)
      .setName('Allowed Granola folders')
      .setDesc('One folder name per line. Empty = no filter.')
      .addTextArea(t =>
        t.setValue(this.plugin.settings.allowedFolders.join('\n')).onChange(async v => {
          this.plugin.settings.allowedFolders = v
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Earliest creation date')
      .setDesc('Notes created before this YYYY-MM-DD are not synced. Empty = no bound.')
      .addText(t =>
        t.setValue(this.plugin.settings.earliestCreationDate ?? '').onChange(async v => {
          const trimmed = v.trim();
          this.plugin.settings.earliestCreationDate = trimmed || null;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Document sync limit')
      .setDesc('0 = unlimited. Otherwise sync only the N most recent notes.')
      .addText(t =>
        t.setValue(String(this.plugin.settings.documentSyncLimit)).onChange(async v => {
          const n = parseInt(v, 10);
          this.plugin.settings.documentSyncLimit = Number.isFinite(n) && n >= 0 ? n : 0;
          await this.plugin.saveSettings();
        }),
      );

    // ── Trigger ────────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Sync triggers' });

    new Setting(containerEl)
      .setName('Periodic interval (minutes)')
      .setDesc('0 disables. Range 0–1440. Clamped silently on save.')
      .addText(t =>
        t.setValue(String(this.plugin.settings.periodicIntervalMinutes)).onChange(async v => {
          const n = parseInt(v, 10);
          this.plugin.settings.periodicIntervalMinutes = clampInterval(n);
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Skip existing notes')
      .setDesc(
        'Frozen-archive mode: existing files are never updated, only new IDs create files.',
      )
      .addToggle(t =>
        t.setValue(this.plugin.settings.skipExistingNotes).onChange(async v => {
          this.plugin.settings.skipExistingNotes = v;
          await this.plugin.saveSettings();
        }),
      );

    // ── Content toggles ────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Content' });

    new Setting(containerEl)
      .setName('Include "## My Notes" placeholder')
      .addToggle(t =>
        t.setValue(this.plugin.settings.includeMyNotesPlaceholder).onChange(async v => {
          this.plugin.settings.includeMyNotesPlaceholder = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName('Include Enhanced Notes block').addToggle(t =>
      t.setValue(this.plugin.settings.includeEnhancedNotes).onChange(async v => {
        this.plugin.settings.includeEnhancedNotes = v;
        await this.plugin.saveSettings();
      }),
    );

    new Setting(containerEl).setName('Include full transcript').addToggle(t =>
      t.setValue(this.plugin.settings.includeTranscript).onChange(async v => {
        this.plugin.settings.includeTranscript = v;
        await this.plugin.saveSettings();
      }),
    );

    // ── Filename ───────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Filename' });

    new Setting(containerEl)
      .setName('Filename template')
      .setDesc('Placeholders: {date} {created_date} {updated_date} {title} {id}')
      .addText(t =>
        t.setValue(this.plugin.settings.filenameTemplate).onChange(async v => {
          this.plugin.settings.filenameTemplate = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Date format (filenames)')
      .setDesc('Tokens: YYYY, MM, DD. e.g. DD.MM.YYYY.')
      .addText(t =>
        t.setValue(this.plugin.settings.filenameDateFormat).onChange(async v => {
          this.plugin.settings.filenameDateFormat = v || DEFAULT_SETTINGS.filenameDateFormat;
          await this.plugin.saveSettings();
        }),
      );

    // ── Person linking ─────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Person linking' });

    new Setting(containerEl)
      .setName('My name')
      .setDesc('Your name as it appears in Granola. Excluded from attendee tags.')
      .addText(t =>
        t.setValue(this.plugin.settings.myName).onChange(async v => {
          this.plugin.settings.myName = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Attendee tag template')
      .setDesc('e.g. person/{name}, people/{name}.')
      .addText(t =>
        t.setValue(this.plugin.settings.attendeeTagTemplate).onChange(async v => {
          this.plugin.settings.attendeeTagTemplate = v || DEFAULT_SETTINGS.attendeeTagTemplate;
          await this.plugin.saveSettings();
        }),
      );

    // ── Custom frontmatter ─────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Additional frontmatter (stamped on creation only)' });

    new Setting(containerEl)
      .setName('YAML key: value pairs, one per line')
      .addTextArea(t =>
        t.setValue(this.plugin.settings.additionalFrontmatter).onChange(async v => {
          this.plugin.settings.additionalFrontmatter = v;
          await this.plugin.saveSettings();
        }),
      );

    // ── Actions ────────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Actions' });

    new Setting(containerEl).setName('Sync now').addButton(b =>
      b.setButtonText('Sync now').onClick(async () => {
        await this.plugin.triggerSyncNow?.();
      }),
    );

    new Setting(containerEl)
      .setName('View last sync report')
      .setDesc('Open the report from the most recent sync.')
      .addButton(b =>
        b.setButtonText('View').onClick(() => {
          this.plugin.viewLastSyncReport?.();
        }),
      );

    new Setting(containerEl)
      .setName('Clear filtered-out cache')
      .setDesc('Forces the next sync to re-evaluate every previously-filtered note.')
      .addButton(b =>
        b.setButtonText('Clear').onClick(async () => {
          await this.plugin.clearFilteredOutCache?.();
        }),
      );
  }

  private maybeWarnApiKey(value: string): void {
    const warn = apiKeyWarning(value);
    if (warn) console.warn('Müslidian:', warn);
  }
}
