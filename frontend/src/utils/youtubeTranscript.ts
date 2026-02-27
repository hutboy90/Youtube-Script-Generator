// Client-side YouTube transcript fetcher
// Uses CORS proxy to fetch from YouTube directly using user's IP

const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
];

let currentProxyIndex = 0;

function getProxy(): string {
  return CORS_PROXIES[currentProxyIndex];
}

function rotateProxy(): void {
  currentProxyIndex = (currentProxyIndex + 1) % CORS_PROXIES.length;
}

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

async function fetchWithProxy(url: string): Promise<string> {
  const proxy = getProxy();
  const proxyUrl = proxy + encodeURIComponent(url);
  
  const response = await fetch(proxyUrl);
  if (!response.ok) {
    rotateProxy();
    throw new Error(`Failed to fetch: ${response.status}`);
  }
  return response.text();
}

interface CaptionTrack {
  baseUrl: string;
  name: { simpleText: string };
  languageCode: string;
}

async function getCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const html = await fetchWithProxy(videoUrl);
  
  // Extract captions data from ytInitialPlayerResponse
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
  if (!match) {
    throw new Error('Could not find player response');
  }
  
  const playerResponse = JSON.parse(match[1]);
  const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  
  if (!captions || captions.length === 0) {
    throw new Error('No captions available for this video');
  }
  
  return captions;
}

interface TranscriptSegment {
  timestamp: string;
  text: string;
  duration: number;
}

async function fetchTranscriptFromTrack(track: CaptionTrack): Promise<TranscriptSegment[]> {
  // Fetch transcript XML
  const xmlUrl = track.baseUrl;
  const xml = await fetchWithProxy(xmlUrl);
  
  // Parse XML
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const textElements = doc.querySelectorAll('text');
  
  const segments: TranscriptSegment[] = [];
  
  textElements.forEach((elem) => {
    const start = parseFloat(elem.getAttribute('start') || '0');
    const duration = parseFloat(elem.getAttribute('dur') || '0');
    const text = elem.textContent || '';
    
    // Decode HTML entities
    const decodedText = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, ' ')
      .trim();
    
    if (decodedText) {
      segments.push({
        timestamp: formatTimestamp(start),
        text: decodedText,
        duration
      });
    }
  });
  
  return segments;
}

export interface VideoData {
  videoId: string;
  title: string;
  thumbnail: string;
  author: string;
  transcript: TranscriptSegment[];
}

export async function fetchVideoTranscript(videoId: string): Promise<VideoData> {
  // Get video info from oEmbed (doesn't need CORS proxy)
  let title = `Video ${videoId}`;
  let author = 'Unknown';
  
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedResponse = await fetch(getProxy() + encodeURIComponent(oembedUrl));
    if (oembedResponse.ok) {
      const oembedData = await oembedResponse.json();
      title = oembedData.title || title;
      author = oembedData.author_name || author;
    }
  } catch {
    // Ignore oEmbed errors, use defaults
  }
  
  // Get caption tracks
  const tracks = await getCaptionTracks(videoId);
  
  // Prefer Vietnamese, then English, then first available
  const preferredLangs = ['vi', 'en'];
  let selectedTrack = tracks[0];
  
  for (const lang of preferredLangs) {
    const track = tracks.find(t => t.languageCode === lang);
    if (track) {
      selectedTrack = track;
      break;
    }
  }
  
  // Fetch transcript
  const transcript = await fetchTranscriptFromTrack(selectedTrack);
  
  return {
    videoId,
    title,
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    author,
    transcript
  };
}

