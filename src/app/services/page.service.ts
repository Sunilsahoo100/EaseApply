import { Injectable, signal } from '@angular/core';
import { getActiveTab, runInFrames, type FrameResult } from '../../shared/frame-runner';
import type { ContentAction } from '../../shared/messages';

export interface ActiveTab {
  id: number;
  url: string;
  title: string;
}

/** Tracks the tab the side panel is working on and runs content-script actions in it. */
@Injectable({ providedIn: 'root' })
export class PageService {
  readonly tab = signal<ActiveTab | null>(null);
  /** Bumped when the user switches tabs or the page navigates, so views can reset per-page state. */
  readonly pageVersion = signal(0);

  constructor() {
    void this.refresh();
    chrome.tabs.onActivated.addListener(() => void this.refresh());
    chrome.tabs.onUpdated.addListener((tabId, info) => {
      if (tabId === this.tab()?.id && info.status === 'complete') void this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    const t = await getActiveTab();
    const next = t?.id ? { id: t.id, url: t.url ?? '', title: t.title ?? '' } : null;
    const prev = this.tab();
    this.tab.set(next);
    if (prev?.id !== next?.id || prev?.url !== next?.url) this.pageVersion.update((v) => v + 1);
  }

  async run<T>(action: ContentAction, payload?: unknown, frameIds?: number[]): Promise<FrameResult<T>[]> {
    await this.refresh();
    const tab = this.tab();
    if (!tab) throw new Error('No active tab.');
    return runInFrames<T>(tab.id, action, payload, frameIds);
  }

  hostname(): string {
    try {
      return new URL(this.tab()?.url ?? '').hostname;
    } catch {
      return '';
    }
  }
}
