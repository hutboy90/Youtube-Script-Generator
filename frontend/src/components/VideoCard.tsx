import { VideoInfo } from '../types';
import './VideoCard.css';

interface VideoCardProps {
  video: VideoInfo;
  isSelected: boolean;
  onClick: () => void;
}

function VideoCard({ video, isSelected, onClick }: VideoCardProps) {
  const thumbnailUrl = `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`;

  const classNames = [
    'video-card',
    video.status === 'completed' ? 'clickable completed' : '',
    isSelected ? 'selected' : ''
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classNames}
      onClick={onClick}
    >
      <div className="thumbnail-container">
        <img 
          src={thumbnailUrl} 
          alt={video.data?.title || 'Video thumbnail'} 
          className="thumbnail"
        />
        {video.status === 'error' && (
          <div className="error-overlay">
            <span>Error</span>
          </div>
        )}
      </div>
      
      <div className="progress-bar-container">
        <div 
          className={`progress-bar ${video.status}`}
          style={{ 
            width: `${video.progress}%`,
            backgroundColor: video.status === 'pending' ? '#666' : 
                           video.status === 'downloading' ? '#7928ca' :
                           video.status === 'completed' ? '#00c853' : '#ff5252'
          }}
        />
      </div>
      
      {video.data && (
        <div className="video-title">{video.data.title}</div>
      )}
    </div>
  );
}

export default VideoCard;

