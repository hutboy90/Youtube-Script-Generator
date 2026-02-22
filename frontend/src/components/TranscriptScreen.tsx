import { useEffect, useState, useCallback } from 'react';
import { VideoInfo } from '../types';
import VideoCard from './VideoCard';
import TranscriptViewer from './TranscriptViewer';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import './TranscriptScreen.css';

// Convert Vietnamese title to ASCII filename
function toFileName(title: string): string {
  const vietnameseMap: { [key: string]: string } = {
    'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
    'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
    'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
    'đ': 'd',
    'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
    'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
    'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
    'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
    'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
    'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
    'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
    'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
    'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
    'À': 'a', 'Á': 'a', 'Ả': 'a', 'Ã': 'a', 'Ạ': 'a',
    'Ă': 'a', 'Ằ': 'a', 'Ắ': 'a', 'Ẳ': 'a', 'Ẵ': 'a', 'Ặ': 'a',
    'Â': 'a', 'Ầ': 'a', 'Ấ': 'a', 'Ẩ': 'a', 'Ẫ': 'a', 'Ậ': 'a',
    'Đ': 'd',
    'È': 'e', 'É': 'e', 'Ẻ': 'e', 'Ẽ': 'e', 'Ẹ': 'e',
    'Ê': 'e', 'Ề': 'e', 'Ế': 'e', 'Ể': 'e', 'Ễ': 'e', 'Ệ': 'e',
    'Ì': 'i', 'Í': 'i', 'Ỉ': 'i', 'Ĩ': 'i', 'Ị': 'i',
    'Ò': 'o', 'Ó': 'o', 'Ỏ': 'o', 'Õ': 'o', 'Ọ': 'o',
    'Ô': 'o', 'Ồ': 'o', 'Ố': 'o', 'Ổ': 'o', 'Ỗ': 'o', 'Ộ': 'o',
    'Ơ': 'o', 'Ờ': 'o', 'Ớ': 'o', 'Ở': 'o', 'Ỡ': 'o', 'Ợ': 'o',
    'Ù': 'u', 'Ú': 'u', 'Ủ': 'u', 'Ũ': 'u', 'Ụ': 'u',
    'Ư': 'u', 'Ừ': 'u', 'Ứ': 'u', 'Ử': 'u', 'Ữ': 'u', 'Ự': 'u',
    'Ỳ': 'y', 'Ý': 'y', 'Ỷ': 'y', 'Ỹ': 'y', 'Ỵ': 'y',
  };

  return title
    .split('')
    .map(char => vietnameseMap[char] || char)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_') + '.txt';
}

interface TranscriptScreenProps {
  videos: VideoInfo[];
  setVideos: React.Dispatch<React.SetStateAction<VideoInfo[]>>;
  onBack: () => void;
}

function TranscriptScreen({ videos, setVideos, onBack }: TranscriptScreenProps) {
  const [selectedVideoIndex, setSelectedVideoIndex] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadTranscript = useCallback(async (index: number) => {
    const video = videos[index];
    if (video.status !== 'pending') return;

    setVideos(prev => prev.map((v, i) => 
      i === index ? { ...v, status: 'downloading', progress: 10 } : v
    ));

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setVideos(prev => prev.map((v, i) => 
          i === index && v.status === 'downloading' && v.progress < 90
            ? { ...v, progress: v.progress + 10 }
            : v
        ));
      }, 200);

      const response = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: video.url })
      });

      clearInterval(progressInterval);

      const result = await response.json();

      if (result.success) {
        setVideos(prev => prev.map((v, i) => 
          i === index ? { ...v, status: 'completed', progress: 100, data: result.data } : v
        ));
        setSelectedVideoIndex(index);
      } else {
        setVideos(prev => prev.map((v, i) => 
          i === index ? { ...v, status: 'error', error: result.error } : v
        ));
      }
    } catch (error) {
      setVideos(prev => prev.map((v, i) => 
        i === index ? { ...v, status: 'error', error: 'Network error' } : v
      ));
    }
  }, [videos, setVideos]);

  useEffect(() => {
    const pendingIndex = videos.findIndex(v => v.status === 'pending');
    const downloadingCount = videos.filter(v => v.status === 'downloading').length;
    
    if (pendingIndex !== -1 && downloadingCount === 0) {
      downloadTranscript(pendingIndex);
    }
  }, [videos, downloadTranscript]);

  const allCompleted = videos.every(v => v.status === 'completed' || v.status === 'error');
  const completedVideos = videos.filter(v => v.status === 'completed');

  const handleCopy = () => {
    const video = videos[selectedVideoIndex];
    if (video?.data) {
      const text = video.data.transcript
        .map(item => `${item.timestamp}\t${item.text}`)
        .join('\n');
      navigator.clipboard.writeText(text);
    }
  };

  const handleDownloadSingle = () => {
    const video = videos[selectedVideoIndex];
    if (video?.data) {
      const text = video.data.transcript
        .map(item => `${item.timestamp}\t${item.text}`)
        .join('\n');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      saveAs(blob, toFileName(video.data.title));
    }
  };

  const handleDownloadAll = async () => {
    if (completedVideos.length === 0) return;
    setIsDownloading(true);

    const zip = new JSZip();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const folderName = `youtube_all_scripts_${timestamp}`;
    const folder = zip.folder(folderName);

    completedVideos.forEach(video => {
      if (video.data && folder) {
        const text = video.data.transcript
          .map(item => `${item.timestamp}\t${item.text}`)
          .join('\n');
        folder.file(toFileName(video.data.title), text);
      }
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${folderName}.zip`);
    setIsDownloading(false);
  };

  const selectedVideo = videos[selectedVideoIndex];

  return (
    <div className="transcript-screen">
      <div className="left-panel">
        <button className="back-btn" onClick={onBack}>Back</button>
        <div className={`video-list ${videos.length <= 2 ? 'single-column' : ''}`}>
          {videos.map((video, index) => (
            <VideoCard
              key={video.videoId}
              video={video}
              isSelected={index === selectedVideoIndex}
              onClick={() => video.status === 'completed' && setSelectedVideoIndex(index)}
            />
          ))}
        </div>
        <div className="action-area">
          <div className="action-buttons">
            <span className="action-label">Get the transcript:</span>
            <button className="action-btn" onClick={handleCopy} disabled={!selectedVideo?.data}>
              📋 Copy
            </button>
            <button className="action-btn primary" onClick={handleDownloadSingle} disabled={!selectedVideo?.data}>
              ⬇ Download
            </button>
          </div>
          <button
            className={`download-all-btn ${allCompleted && completedVideos.length > 0 ? 'active' : ''}`}
            onClick={handleDownloadAll}
            disabled={!allCompleted || completedVideos.length === 0 || isDownloading}
          >
            ⬇ Download All Scripts
          </button>
        </div>
      </div>
      <div className="right-panel">
        <TranscriptViewer video={selectedVideo} />
      </div>
    </div>
  );
}

export default TranscriptScreen;

