// Background service worker
// Handles: single download trigger + batch video processing
// Note: DOMParser/document are NOT available in service workers (MV3)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'triggerDownload') {
    chrome.downloads.download({
      url: request.dataUrl,
      filename: request.filename,
      saveAs: true,
    })
    .then(downloadId => sendResponse({ success: true, downloadId }))
    .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'triggerBatchFile') {
    // Download a file without saveAs prompt (for batch mode)
    chrome.downloads.download({
      url: request.dataUrl,
      filename: request.filename,
      conflictAction: 'uniquify',
    })
    .then(downloadId => sendResponse({ success: true, downloadId }))
    .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'batchProcessVideo') {
    processVideoInBackground(request)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'batchPrepareVideo') {
    prepareVideoInBackground(request)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'batchDownloadAll') {
    downloadAllFiles(request.files)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ─── Process a single video for batch download ───
async function processVideoInBackground({ videoId, videoUrl, format, folderName }) {
  let tabId = null;

  try {
    // 1. Create a hidden background tab (user stays on popup)
    const tab = await chrome.tabs.create({ url: videoUrl, active: false });
    tabId = tab.id;

    // 2. Wait for page to fully load
    await waitForTabLoad(tabId, 20000);
    // Extra wait for YouTube player to initialize in background
    await sleep(4000);

    // 3. Extract caption tracks from the page
    const captionResult = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          const player = document.querySelector('#movie_player');
          let resp = null;
          if (player && player.getPlayerResponse) resp = player.getPlayerResponse();
          if (!resp && window.ytInitialPlayerResponse) resp = window.ytInitialPlayerResponse;
          if (!resp) return { error: 'No player response' };

          const captions = resp?.captions?.playerCaptionsTracklistRenderer;
          if (!captions?.captionTracks?.length) return { error: 'No caption tracks found' };

          const tracks = captions.captionTracks.map(t => ({
            baseUrl: t.baseUrl,
            languageCode: t.languageCode,
            name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
            kind: t.kind || 'standard',
          }));

          const title = resp?.videoDetails?.title || document.title.replace(' - YouTube', '');
          return { title, tracks };
        } catch (e) {
          return { error: e.message };
        }
      },
    });

    const capData = captionResult[0]?.result;
    if (!capData || capData.error || !capData.tracks?.length) {
      throw new Error(capData?.error || 'No subtitles found for this video');
    }

    // 4. Trigger CC with retry to get PoT
    // Background tabs may need multiple attempts
    for (let attempt = 0; attempt < 3; attempt++) {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          try {
            const player = document.querySelector('#movie_player');
            if (player && player.playVideo) player.playVideo();
          } catch {}
          const btn = document.querySelector('.ytp-subtitles-button');
          if (btn) {
            if (btn.getAttribute('aria-pressed') !== 'true') btn.click();
          }
        },
      });
      await sleep(2000);

      // Check if PoT appeared
      const checkResult = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          const resources = performance.getEntriesByType('resource');
          return resources.some(r => r.name && r.name.includes('/api/timedtext') && r.name.includes('pot='));
        },
      });
      if (checkResult[0]?.result) break;
    }

    // 5. Extract PoT and fetch subtitle
    const subtitleResult = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (tracks) => {
        // Find PoT from performance entries
        let pot = null;
        let extraParams = '';
        try {
          const resources = performance.getEntriesByType('resource');
          for (let i = resources.length - 1; i >= 0; i--) {
            const r = resources[i];
            if (r.name && r.name.includes('/api/timedtext') && r.name.includes('pot=')) {
              const u = new URL(r.name);
              pot = u.searchParams.get('pot');
              const extraKeys = ['xorb', 'xobt', 'xovt', 'cbrand', 'cbr', 'cbrver',
                                 'c', 'cver', 'cplayer', 'cos', 'cosver', 'cplatform', 'potc'];
              const parts = [];
              for (const key of extraKeys) {
                const val = u.searchParams.get(key);
                if (val) parts.push(`${key}=${encodeURIComponent(val)}`);
              }
              extraParams = parts.join('&');
              break;
            }
          }
        } catch (e) {}

        // Turn CC off
        try {
          const btn = document.querySelector('.ytp-subtitles-button');
          if (btn && btn.getAttribute('aria-pressed') === 'true') btn.click();
        } catch (e) {}

        // Use first track (prefer non-asr)
        const track = tracks.find(t => t.kind !== 'asr') || tracks[0];
        let url = track.baseUrl;
        if (pot) url += '&potc=1&pot=' + encodeURIComponent(pot);
        if (extraParams) url += '&' + extraParams;

        // Try fetching subtitle content
        const formats = [
          { suffix: '&fmt=json3', type: 'json3' },
          { suffix: '', type: 'xml' },
        ];

        for (const { suffix, type } of formats) {
          try {
            const resp = await fetch(url + suffix, { credentials: 'include' });
            if (!resp.ok) continue;
            const text = await resp.text();
            if (text && text.length > 10) {
              return { content: text, format: type, trackName: track.name };
            }
          } catch (e) {}
        }

        // Fallback: use full working URL from performance entries directly
        try {
          const resources = performance.getEntriesByType('resource');
          for (let i = resources.length - 1; i >= 0; i--) {
            const r = resources[i];
            if (r.name && r.name.includes('/api/timedtext') && r.name.includes('pot=')) {
              let workingUrl = r.name;
              if (!workingUrl.includes('fmt=json3')) workingUrl += '&fmt=json3';
              const resp = await fetch(workingUrl, { credentials: 'include' });
              const text = await resp.text();
              if (text && text.length > 10) {
                return { content: text, format: 'json3', trackName: track.name };
              }
            }
          }
        } catch (e) {}

        return { error: pot ? 'PoT found but fetch empty' : 'No PoT generated (player may not have loaded)' };
      },
      args: [capData.tracks],
    });

    const subData = subtitleResult[0]?.result;
    if (!subData || subData.error) {
      throw new Error(subData?.error || 'Failed to fetch subtitle');
    }

    // 6. Parse + convert (in background, must use regex since no DOMParser)
    let segments;
    if (subData.format === 'json3') {
      segments = parseJSON3BG(subData.content);
    } else {
      segments = parseXMLBG(subData.content);
    }

    if (segments.length === 0) {
      throw new Error('No subtitle segments found');
    }

    let content;
    switch (format) {
      case 'srt': content = toSRTBG(segments); break;
      case 'vtt': content = toVTTBG(segments); break;
      default:    content = toTXTBG(segments); break;
    }

    // 7. Download the file into the folder
    const safeTitle = sanitizeFilenameBG(capData.title);
    const safeFolder = sanitizeFilenameBG(folderName);
    const filename = `${safeFolder}/${safeTitle}.${format}`;
    const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);

    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      conflictAction: 'uniquify',
    });

    // 8. Close the background tab
    await chrome.tabs.remove(tabId);
    tabId = null;

    return { success: true, title: capData.title };
  } catch (err) {
    // Clean up tab on error
    if (tabId) {
      try { await chrome.tabs.remove(tabId); } catch {}
    }
    return { success: false, error: err.message };
  }
}

// ─── Helpers ───

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function waitForTabLoad(tabId, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timeout'));
    }, timeout);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ─── Parsers (no DOMParser in service worker, use regex) ───

function parseJSON3BG(content) {
  try {
    const data = JSON.parse(content);
    const events = data.events || [];
    const segments = [];
    for (const event of events) {
      if (!event.segs) continue;
      const text = event.segs.map(s => s.utf8).join('').trim();
      if (!text || text === '\n') continue;
      segments.push({
        start: (event.tStartMs || 0) / 1000,
        end: ((event.tStartMs || 0) + (event.dDurationMs || 0)) / 1000,
        text,
      });
    }
    return segments;
  } catch { return []; }
}

function parseXMLBG(content) {
  // Regex-based XML parser for service worker (no DOMParser)
  const segments = [];
  // Match <text start="..." dur="...">...</text> or <p t="..." d="...">...</p>
  const regex = /<(?:text|p)\s+[^>]*?(?:start|t)="([^"]*)"[^>]*?(?:dur|d)="([^"]*)"[^>]*?>([\s\S]*?)<\/(?:text|p)>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const startVal = parseFloat(match[1]);
    const durVal = parseFloat(match[2]);
    let text = match[3].replace(/<[^>]+>/g, '').trim(); // strip inner tags
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (!text) continue;
    // Heuristic: if start > 1000, likely milliseconds
    const startSec = startVal > 1000 ? startVal / 1000 : startVal;
    const durSec = durVal > 1000 ? durVal / 1000 : durVal;
    segments.push({ start: startSec, end: startSec + durSec, text });
  }
  return segments;
}

function padBG(num, size) { return String(num).padStart(size, '0'); }

function formatTimeSRTBG(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60), ms = Math.round((s%1)*1000);
  return `${padBG(h,2)}:${padBG(m,2)}:${padBG(sec,2)},${padBG(ms,3)}`;
}

function formatTimeVTTBG(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60), ms = Math.round((s%1)*1000);
  return `${padBG(h,2)}:${padBG(m,2)}:${padBG(sec,2)}.${padBG(ms,3)}`;
}

function toTXTBG(segments) { return segments.map(s => s.text).join('\n'); }

function toSRTBG(segments) {
  return segments.map((s, i) => `${i+1}\n${formatTimeSRTBG(s.start)} --> ${formatTimeSRTBG(s.end)}\n${s.text}\n`).join('\n');
}

function toVTTBG(segments) {
  return 'WEBVTT\n\n' + segments.map((s, i) => `${i+1}\n${formatTimeVTTBG(s.start)} --> ${formatTimeVTTBG(s.end)}\n${s.text}\n`).join('\n');
}

function sanitizeFilenameBG(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim().substring(0, 200);
}

// ─── Prepare a single video (same as processVideoInBackground but returns content instead of downloading) ───
async function prepareVideoInBackground({ videoId, videoUrl, format }) {
  let tabId = null;

  try {
    const tab = await chrome.tabs.create({ url: videoUrl, active: false });
    tabId = tab.id;

    await waitForTabLoad(tabId, 20000);
    await sleep(4000);

    // Extract caption tracks
    const captionResult = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          const player = document.querySelector('#movie_player');
          let resp = null;
          if (player && player.getPlayerResponse) resp = player.getPlayerResponse();
          if (!resp && window.ytInitialPlayerResponse) resp = window.ytInitialPlayerResponse;
          if (!resp) return { error: 'No player response' };

          const captions = resp?.captions?.playerCaptionsTracklistRenderer;
          if (!captions?.captionTracks?.length) return { error: 'No caption tracks found' };

          const tracks = captions.captionTracks.map(t => ({
            baseUrl: t.baseUrl,
            languageCode: t.languageCode,
            name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
            kind: t.kind || 'standard',
          }));

          const title = resp?.videoDetails?.title || document.title.replace(' - YouTube', '');
          return { title, tracks };
        } catch (e) {
          return { error: e.message };
        }
      },
    });

    const capData = captionResult[0]?.result;
    if (!capData || capData.error || !capData.tracks?.length) {
      throw new Error(capData?.error || 'No subtitles found for this video');
    }

    // Trigger CC with retry to get PoT
    for (let attempt = 0; attempt < 3; attempt++) {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          try {
            const player = document.querySelector('#movie_player');
            if (player && player.playVideo) player.playVideo();
          } catch {}
          const btn = document.querySelector('.ytp-subtitles-button');
          if (btn) {
            if (btn.getAttribute('aria-pressed') !== 'true') btn.click();
          }
        },
      });
      await sleep(2000);

      const checkResult = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          const resources = performance.getEntriesByType('resource');
          return resources.some(r => r.name && r.name.includes('/api/timedtext') && r.name.includes('pot='));
        },
      });
      if (checkResult[0]?.result) break;
    }

    // Extract PoT and fetch subtitle content
    const subtitleResult = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (tracks) => {
        let pot = null;
        let extraParams = '';
        try {
          const resources = performance.getEntriesByType('resource');
          for (let i = resources.length - 1; i >= 0; i--) {
            const r = resources[i];
            if (r.name && r.name.includes('/api/timedtext') && r.name.includes('pot=')) {
              const u = new URL(r.name);
              pot = u.searchParams.get('pot');
              const extraKeys = ['xorb', 'xobt', 'xovt', 'cbrand', 'cbr', 'cbrver',
                                 'c', 'cver', 'cplayer', 'cos', 'cosver', 'cplatform', 'potc'];
              const parts = [];
              for (const key of extraKeys) {
                const val = u.searchParams.get(key);
                if (val) parts.push(`${key}=${encodeURIComponent(val)}`);
              }
              extraParams = parts.join('&');
              break;
            }
          }
        } catch (e) {}

        // Turn CC off
        try {
          const btn = document.querySelector('.ytp-subtitles-button');
          if (btn && btn.getAttribute('aria-pressed') === 'true') btn.click();
        } catch (e) {}

        const track = tracks.find(t => t.kind !== 'asr') || tracks[0];
        let url = track.baseUrl;
        if (pot) url += '&potc=1&pot=' + encodeURIComponent(pot);
        if (extraParams) url += '&' + extraParams;

        const formats = [
          { suffix: '&fmt=json3', type: 'json3' },
          { suffix: '', type: 'xml' },
        ];

        for (const { suffix, type } of formats) {
          try {
            const resp = await fetch(url + suffix, { credentials: 'include' });
            if (!resp.ok) continue;
            const text = await resp.text();
            if (text && text.length > 10) {
              return { content: text, format: type, trackName: track.name };
            }
          } catch (e) {}
        }

        // Fallback: use full working URL from performance entries
        try {
          const resources = performance.getEntriesByType('resource');
          for (let i = resources.length - 1; i >= 0; i--) {
            const r = resources[i];
            if (r.name && r.name.includes('/api/timedtext') && r.name.includes('pot=')) {
              let workingUrl = r.name;
              if (!workingUrl.includes('fmt=json3')) workingUrl += '&fmt=json3';
              const resp = await fetch(workingUrl, { credentials: 'include' });
              const text = await resp.text();
              if (text && text.length > 10) {
                return { content: text, format: 'json3', trackName: track.name };
              }
            }
          }
        } catch (e) {}

        return { error: pot ? 'PoT found but fetch empty' : 'No PoT generated' };
      },
      args: [capData.tracks],
    });

    const subData = subtitleResult[0]?.result;
    if (!subData || subData.error) {
      throw new Error(subData?.error || 'Failed to fetch subtitle');
    }

    // Parse + convert
    let segments;
    if (subData.format === 'json3') {
      segments = parseJSON3BG(subData.content);
    } else {
      segments = parseXMLBG(subData.content);
    }

    if (segments.length === 0) {
      throw new Error('No subtitle segments found');
    }

    let content;
    switch (format) {
      case 'srt': content = toSRTBG(segments); break;
      case 'vtt': content = toVTTBG(segments); break;
      default:    content = toTXTBG(segments); break;
    }

    // Close the background tab
    await chrome.tabs.remove(tabId);
    tabId = null;

    // Return content instead of downloading
    return { success: true, title: capData.title, content };
  } catch (err) {
    if (tabId) {
      try { await chrome.tabs.remove(tabId); } catch {}
    }
    return { success: false, error: err.message };
  }
}

// ─── Download all prepared files at once ───
async function downloadAllFiles(files) {
  if (!files || files.length === 0) return { success: true };

  const results = [];
  for (const file of files) {
    try {
      const downloadId = await chrome.downloads.download({
        url: file.dataUrl,
        filename: file.filename,
        conflictAction: 'uniquify',
      });
      results.push({ success: true, downloadId });
    } catch (err) {
      results.push({ success: false, error: err.message });
    }
  }

  return { success: true, results };
}
