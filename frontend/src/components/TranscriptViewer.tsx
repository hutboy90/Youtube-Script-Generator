import { VideoInfo } from '../types';
import './TranscriptViewer.css';

interface TranscriptViewerProps {
  video: VideoInfo | undefined;
}

function TranscriptViewer({ video }: TranscriptViewerProps) {
  if (!video) {
    return (
      <div className="transcript-viewer empty">
        <p>No video selected</p>
      </div>
    );
  }

  if (video.status === 'pending') {
    return (
      <div className="transcript-viewer empty">
        <p>Waiting to download...</p>
      </div>
    );
  }

  if (video.status === 'downloading') {
    return (
      <div className="transcript-viewer empty">
        <p>Downloading transcript...</p>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (video.status === 'error') {
    return (
      <div className="transcript-viewer empty error">
        <p>Error: {video.error}</p>
      </div>
    );
  }

  if (!video.data) {
    return (
      <div className="transcript-viewer empty">
        <p>No transcript data</p>
      </div>
    );
  }

  return (
    <div className="transcript-viewer">
      <div className="transcript-header">
        <h3>{video.data.title}</h3>
        <span className="author">{video.data.author}</span>
      </div>
      <div className="transcript-content">
        <table className="transcript-table">
          <tbody>
            {video.data.transcript.map((item, index) => (
              <tr key={index}>
                <td className="timestamp">{item.timestamp}</td>
                <td className="text">{item.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TranscriptViewer;

