// Background service worker - minimal, handles download requests from popup
// Note: DOMParser/document are NOT available in service workers (MV3)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'triggerDownload') {
    // Receive a data URL + filename from popup and trigger chrome.downloads
    chrome.downloads.download({
      url: request.dataUrl,
      filename: request.filename,
      saveAs: true,
    })
    .then(downloadId => sendResponse({ success: true, downloadId }))
    .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
