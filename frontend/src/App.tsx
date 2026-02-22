import { useState } from 'react';
import InputScreen from './components/InputScreen';
import TranscriptScreen from './components/TranscriptScreen';
import { VideoInfo } from './types';
import './App.css';

function App() {
  const [screen, setScreen] = useState<'input' | 'transcript'>('input');
  const [videos, setVideos] = useState<VideoInfo[]>([]);

  const extractVideoId = (url: string): string | null => {
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
  };

  const handleUrlsSubmit = (urls: string[]) => {
    const videoInfos: VideoInfo[] = urls
      .map(url => url.trim())
      .filter(url => url.length > 0)
      .map(url => {
        const videoId = extractVideoId(url);
        return {
          url,
          videoId: videoId || '',
          status: 'pending' as const,
          progress: 0
        };
      })
      .filter(video => video.videoId !== '');

    if (videoInfos.length > 0) {
      setVideos(videoInfos);
      setScreen('transcript');
    }
  };

  const handleBack = () => {
    setScreen('input');
    setVideos([]);
  };

  return (
    <div className="app">
      <header className="header">
        <span className="header-title">YouTube Transcript Generator</span>
      </header>
      
      {screen === 'input' ? (
        <InputScreen onSubmit={handleUrlsSubmit} />
      ) : (
        <TranscriptScreen videos={videos} setVideos={setVideos} onBack={handleBack} />
      )}
    </div>
  );
}

export default App;

