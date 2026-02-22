const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Extract video ID from YouTube URL
function extractVideoId(url) {
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

// Get video info (thumbnail, title) using oEmbed
async function getVideoInfo(videoId) {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title,
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        author: data.author_name
      };
    }
  } catch (error) {
    console.error('Error fetching video info:', error);
  }

  return {
    title: `Video ${videoId}`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    author: 'Unknown'
  };
}

// Format timestamp from seconds to HH:MM:SS.mmm
function formatTimestamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

// Fetch transcript using Python script
function fetchTranscript(videoId) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'transcript.py');
    const python = spawn('python3', [scriptPath, videoId]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || 'Python script failed'));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (result.success) {
          resolve(result.transcript.map(item => ({
            offset: item.start,
            duration: item.duration,
            text: item.text
          })));
        } else {
          reject(new Error(result.error || 'Failed to fetch transcript'));
        }
      } catch (e) {
        reject(new Error('Failed to parse transcript result'));
      }
    });
  });
}

// API to get video info
app.get('/api/video-info/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const info = await getVideoInfo(videoId);
    res.json({ success: true, data: { videoId, ...info } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to get transcript
app.post('/api/transcript', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const videoId = extractVideoId(url);

    if (!videoId) {
      return res.status(400).json({ success: false, error: 'Invalid YouTube URL' });
    }

    // Get video info
    const videoInfo = await getVideoInfo(videoId);

    // Get transcript using custom function
    const transcriptData = await fetchTranscript(videoId);

    // Format transcript with timestamps
    const formattedTranscript = transcriptData.map(item => ({
      timestamp: formatTimestamp(item.offset),
      text: item.text,
      duration: item.duration
    }));

    res.json({
      success: true,
      data: {
        videoId,
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail,
        author: videoInfo.author,
        transcript: formattedTranscript
      }
    });

  } catch (error) {
    console.error('Error fetching transcript:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch transcript'
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

