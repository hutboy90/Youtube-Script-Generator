// Popup logic
// Uses chrome.scripting.executeScript to run code directly in YouTube tab's MAIN world
// Key insight: YouTube requires a PoT (Proof of Origin Token) for timedtext API.
// The PoT is NOT in captionTracks.baseUrl — we extract it from the player's internal state
// or from performance resource entries.

const elements = {
  stateLoading: document.getElementById('state-loading'),
  stateError: document.getElementById('state-error'),
  stateNoSubs: document.getElementById('state-no-subs'),
  stateReady: document.getElementById('state-ready'),
  errorMessage: document.getElementById('error-message'),
  noSubsTitle: document.getElementById('no-subs-title'),
  videoTitle: document.getElementById('video-title'),
  trackCount: document.getElementById('track-count'),
  languageSelect: document.getElementById('language-select'),
  downloadBtn: document.getElementById('download-btn'),
  downloadStatus: document.getElementById('download-status'),
  statusIcon: document.getElementById('status-icon'),
  statusText: document.getElementById('status-text'),
};

let captionData = null;
let currentTabId = null;
let selectedFormat = 'txt';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupTabs();
  setupFormatButtons();
  setupDownloadButton();
  await loadCaptions();
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('disabled')) return;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

function setupFormatButtons() {
  document.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFormat = btn.dataset.format;
    });
  });
}

function setupDownloadButton() {
  elements.downloadBtn.addEventListener('click', handleDownload);
}

function showState(stateId) {
  ['stateLoading', 'stateError', 'stateNoSubs', 'stateReady'].forEach(id => {
    elements[id].classList.toggle('hidden', id !== stateId);
  });
}

async function executeInTab(tabId, func, args = []) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func,
    args,
  });
  return results[0]?.result;
}

// ─── Load captions ───
async function loadCaptions() {
  showState('stateLoading');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) {
      showState('stateError');
      elements.errorMessage.textContent = 'Please open a YouTube video page first.';
      return;
    }

    currentTabId = tab.id;

    // Get caption tracks + PoT from YouTube page's MAIN world
    const data = await executeInTab(tab.id, () => {
      try {
        const player = document.querySelector('#movie_player');
        let resp = null;

        if (player && player.getPlayerResponse) {
          resp = player.getPlayerResponse();
        }
        if (!resp && window.ytInitialPlayerResponse) {
          resp = window.ytInitialPlayerResponse;
        }
        if (!resp) {
          return { title: document.title.replace(' - YouTube', ''), tracks: [], debug: 'No player response' };
        }

        const captions = resp?.captions?.playerCaptionsTracklistRenderer;
        if (!captions?.captionTracks?.length) {
          return { title: resp?.videoDetails?.title || document.title.replace(' - YouTube', ''), tracks: [] };
        }

        const tracks = captions.captionTracks.map(t => ({
          baseUrl: t.baseUrl,
          languageCode: t.languageCode,
          name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
          kind: t.kind || 'standard',
        }));

        const title = resp?.videoDetails?.title || document.title.replace(' - YouTube', '');

        // ─── Extract PoT (Proof of Origin Token) ───
        // Strategy 1: from performance resource entries (if CC was already loaded)
        let pot = null;
        let extraParams = '';
        try {
          const resources = performance.getEntriesByType('resource');
          for (let i = resources.length - 1; i >= 0; i--) {
            const r = resources[i];
            if (r.name && r.name.includes('/api/timedtext') && r.name.includes('pot=')) {
              const u = new URL(r.name);
              pot = u.searchParams.get('pot');
              // Also grab other extra params that YouTube adds
              const extra = ['xorb', 'xobt', 'xovt', 'cbrand', 'cbr', 'cbrver',
                             'c', 'cver', 'cplayer', 'cos', 'cosver', 'cplatform', 'potc'];
              const parts = [];
              for (const key of extra) {
                const val = u.searchParams.get(key);
                if (val) parts.push(`${key}=${encodeURIComponent(val)}`);
              }
              extraParams = parts.join('&');
              break;
            }
          }
        } catch (e) {}

        // Strategy 2: trigger CC to generate a timedtext request if no PoT found
        // We'll pass a flag so popup knows to try triggering CC
        return { title, tracks, pot, extraParams, needsTrigger: !pot };
      } catch (e) {
        return { title: '', tracks: [], debug: e.message };
      }
    });

    if (!data) {
      showState('stateError');
      elements.errorMessage.textContent = 'Failed to access YouTube page. Try reloading.';
      return;
    }

    // If no PoT found, trigger CC on/off to make YouTube fetch subtitles
    if (data.needsTrigger && data.tracks?.length > 0) {
      await executeInTab(tab.id, () => {
        const player = document.querySelector('#movie_player');
        if (player) {
          // Toggle CC on then off to trigger timedtext fetch
          const btn = document.querySelector('.ytp-subtitles-button');
          if (btn) {
            btn.click(); // turn on
            return true;
          }
        }
        return false;
      });

      // Wait for the network request to complete
      await new Promise(r => setTimeout(r, 1500));

      // Now extract PoT from the resource entries
      const potData = await executeInTab(tab.id, () => {
        let pot = null;
        let extraParams = '';
        try {
          const resources = performance.getEntriesByType('resource');
          for (let i = resources.length - 1; i >= 0; i--) {
            const r = resources[i];
            if (r.name && r.name.includes('/api/timedtext') && r.name.includes('pot=')) {
              const u = new URL(r.name);
              pot = u.searchParams.get('pot');
              const extra = ['xorb', 'xobt', 'xovt', 'cbrand', 'cbr', 'cbrver',
                             'c', 'cver', 'cplayer', 'cos', 'cosver', 'cplatform', 'potc'];
              const parts = [];
              for (const key of extra) {
                const val = u.searchParams.get(key);
                if (val) parts.push(`${key}=${encodeURIComponent(val)}`);
              }
              extraParams = parts.join('&');
              break;
            }
          }
        } catch (e) {}

        // Turn CC back off
        try {
          const btn = document.querySelector('.ytp-subtitles-button');
          if (btn && btn.getAttribute('aria-pressed') === 'true') {
            btn.click();
          }
        } catch (e) {}

        return { pot, extraParams };
      });

      if (potData?.pot) {
        data.pot = potData.pot;
        data.extraParams = potData.extraParams;
        data.needsTrigger = false;
      }
    }

    captionData = data;

    if (!captionData.tracks || captionData.tracks.length === 0) {
      showState('stateNoSubs');
      elements.noSubsTitle.textContent = captionData.title || 'Unknown video';
      return;
    }

    elements.videoTitle.textContent = captionData.title;
    const potStatus = captionData.pot ? ' \u2713' : ' (activating CC...)';
    elements.trackCount.textContent = `${captionData.tracks.length} subtitle track(s) available${potStatus}`;

    elements.languageSelect.innerHTML = '';
    captionData.tracks.forEach((track, index) => {
      const option = document.createElement('option');
      option.value = index;
      const alreadyLabeled = track.name.toLowerCase().includes('auto');
      const autoLabel = (track.kind === 'asr' && !alreadyLabeled) ? ' (auto-generated)' : '';
      option.textContent = `${track.name}${autoLabel}`;
      elements.languageSelect.appendChild(option);
    });

    showState('stateReady');
  } catch (err) {
    showState('stateError');
    elements.errorMessage.textContent = err.message || 'An unexpected error occurred.';
  }
}

// ─── Download handler ───
async function handleDownload() {
  if (!captionData || !currentTabId) return;

  const trackIndex = parseInt(elements.languageSelect.value);
  const track = captionData.tracks[trackIndex];

  elements.downloadBtn.disabled = true;
  elements.downloadBtn.textContent = 'Downloading...';
  hideStatus();

  try {
    // Build the full URL with PoT and extra params
    let fullUrl = track.baseUrl;
    if (captionData.pot) {
      fullUrl += '&potc=1&pot=' + encodeURIComponent(captionData.pot);
    }
    if (captionData.extraParams) {
      fullUrl += '&' + captionData.extraParams;
    }

    // Fetch subtitle in YouTube page's MAIN world
    const fetchResult = await executeInTab(currentTabId, async (url) => {
      const formats = [
        { suffix: '&fmt=json3', type: 'json3' },
        { suffix: '', type: 'xml' },
        { suffix: '&fmt=srv3', type: 'srv3' },
      ];
      const errors = [];

      for (const { suffix, type } of formats) {
        try {
          const resp = await fetch(url + suffix, { credentials: 'include' });
          if (!resp.ok) {
            errors.push(`${type}: HTTP ${resp.status}`);
            continue;
          }
          const text = await resp.text();
          if (text && text.length > 10) {
            return { content: text, format: type };
          }
          errors.push(`${type}: empty (${text.length} bytes)`);
        } catch (e) {
          errors.push(`${type}: ${e.message}`);
        }
      }

      // Last resort: try to find the full working URL from performance entries
      try {
        const resources = performance.getEntriesByType('resource');
        for (let i = resources.length - 1; i >= 0; i--) {
          const r = resources[i];
          if (r.name && r.name.includes('/api/timedtext') && r.name.includes('pot=')) {
            // Found a working timedtext URL - fetch it directly with json3
            let workingUrl = r.name;
            // Replace fmt if needed
            if (!workingUrl.includes('fmt=json3')) {
              workingUrl += '&fmt=json3';
            }
            const resp = await fetch(workingUrl, { credentials: 'include' });
            const text = await resp.text();
            if (text && text.length > 10) {
              return { content: text, format: 'json3', usedFallback: true };
            }
          }
        }
      } catch (e) {
        errors.push(`fallback: ${e.message}`);
      }

      return { error: errors.join('; ') };
    }, [fullUrl]);

    if (!fetchResult || fetchResult.error) {
      throw new Error(fetchResult?.error || 'Failed to fetch subtitle');
    }

    let segments;
    if (fetchResult.format === 'json3') {
      segments = parseJSON3(fetchResult.content);
    } else {
      segments = parseXML(fetchResult.content);
    }

    if (segments.length === 0) {
      throw new Error('No subtitle segments found in response');
    }

    let content, fileExt;
    switch (selectedFormat) {
      case 'srt': content = toSRT(segments); fileExt = 'srt'; break;
      case 'vtt': content = toVTT(segments); fileExt = 'vtt'; break;
      default:    content = toTXT(segments); fileExt = 'txt'; break;
    }

    const safeTitle = sanitizeFilename(captionData.title);
    const filename = `${safeTitle} [${track.name}].${fileExt}`;

    const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
    const result = await chrome.runtime.sendMessage({
      action: 'triggerDownload',
      dataUrl,
      filename,
    });

    if (result?.success) {
      showStatus('success', `Downloaded! (${segments.length} segments)`);
    } else {
      showStatus('error', result?.error || 'Download failed.');
    }
  } catch (err) {
    showStatus('error', err.message || 'Download failed.');
  } finally {
    elements.downloadBtn.disabled = false;
    elements.downloadBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Download Subtitle
    `;
  }
}

// ─── Parse JSON3 ───
function parseJSON3(content) {
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

// ─── Parse XML ───
function parseXML(content) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    let elems = doc.querySelectorAll('body > p');
    if (!elems.length) elems = doc.querySelectorAll('p');
    if (!elems.length) elems = doc.querySelectorAll('text');
    const segments = [];
    for (const el of elems) {
      const tAttr = el.getAttribute('t') || el.getAttribute('start') || '0';
      const dAttr = el.getAttribute('d') || el.getAttribute('dur') || '0';
      let text = '';
      const spans = el.querySelectorAll('s');
      if (spans.length) {
        text = Array.from(spans).map(s => s.textContent).join('');
      } else {
        text = el.textContent;
      }
      text = decodeHTMLEntities(text.trim());
      if (!text) continue;
      const startMs = parseFloat(tAttr);
      const durMs = parseFloat(dAttr);
      const startSec = el.hasAttribute('t') ? startMs / 1000 : startMs;
      const durSec = el.hasAttribute('d') ? durMs / 1000 : durMs;
      segments.push({ start: startSec, end: startSec + durSec, text });
    }
    return segments;
  } catch { return []; }
}

function decodeHTMLEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

function pad(num, size) { return String(num).padStart(size, '0'); }

function formatTimeSRT(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60), ms = Math.round((s%1)*1000);
  return `${pad(h,2)}:${pad(m,2)}:${pad(sec,2)},${pad(ms,3)}`;
}

function formatTimeVTT(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60), ms = Math.round((s%1)*1000);
  return `${pad(h,2)}:${pad(m,2)}:${pad(sec,2)}.${pad(ms,3)}`;
}

function toTXT(segments) { return segments.map(s => s.text).join('\n'); }

function toSRT(segments) {
  return segments.map((s, i) => `${i+1}\n${formatTimeSRT(s.start)} --> ${formatTimeSRT(s.end)}\n${s.text}\n`).join('\n');
}

function toVTT(segments) {
  return 'WEBVTT\n\n' + segments.map((s, i) => `${i+1}\n${formatTimeVTT(s.start)} --> ${formatTimeVTT(s.end)}\n${s.text}\n`).join('\n');
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim().substring(0, 200);
}

function showStatus(type, message) {
  elements.downloadStatus.classList.remove('hidden', 'success', 'error');
  elements.downloadStatus.classList.add(type);
  elements.statusIcon.textContent = type === 'success' ? '\u2713' : '\u2717';
  elements.statusText.textContent = message;
}

function hideStatus() { elements.downloadStatus.classList.add('hidden'); }
