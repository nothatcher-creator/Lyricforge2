'use client';

export type ReadyDownload = { url: string; name: string; size: number };
let current: ReadyDownload | null = null;
const listeners = new Set<() => void>();

export const downloadSnapshot = () => current;
export const emptyDownloadSnapshot = () => null;
export function subscribeDownloads(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function dismissDownload() {
  const previous = current;
  current = null;
  listeners.forEach(listener => listener());
  // Give a browser that has just started saving time to consume the URL.
  if (previous) setTimeout(() => URL.revokeObjectURL(previous.url), 60_000);
}

export function prepareDownload(blob: Blob, name: string) {
  dismissDownload();
  current = { url: URL.createObjectURL(blob), name, size: blob.size };
  listeners.forEach(listener => listener());
  // Keep a visible, user-activated download available when an asynchronous
  // render has outlived the browser's transient user activation.
  const anchor = document.createElement('a');
  anchor.href = current.url;
  anchor.download = name;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
