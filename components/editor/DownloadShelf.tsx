'use client';

import { useSyncExternalStore } from 'react';
import { Download, X } from 'lucide-react';
import { downloadSnapshot, emptyDownloadSnapshot, subscribeDownloads, dismissDownload } from '@/lib/lyricforge/downloads';

export function DownloadShelf() {
  const file = useSyncExternalStore(subscribeDownloads, downloadSnapshot, emptyDownloadSnapshot);
  if (!file) return null;
  return <aside className="download-shelf" aria-label="File ready to download">
    <Download size={20}/>
    <div><strong>Your file is ready</strong><span>{file.name} · {(file.size / 1e6).toFixed(1)} MB</span></div>
    <a className="primary-button" href={file.url} download={file.name}>Save file</a>
    <button className="download-dismiss" aria-label="Dismiss download" onClick={dismissDownload}><X size={16}/></button>
  </aside>;
}
