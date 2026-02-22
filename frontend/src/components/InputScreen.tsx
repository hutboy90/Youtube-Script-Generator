import { useState } from 'react';
import './InputScreen.css';

interface InputScreenProps {
  onSubmit: (urls: string[]) => void;
}

function InputScreen({ onSubmit }: InputScreenProps) {
  const [urlInput, setUrlInput] = useState('');

  const handleSubmit = () => {
    const urls = urlInput.split(/[\s\n]+/).filter(url => url.trim().length > 0);
    if (urls.length > 0) {
      onSubmit(urls);
    }
  };

  return (
    <div className="input-screen">
      <div className="input-content">
        <h1 className="title">
          Free <span className="gradient-text">YouTube Transcript</span>
        </h1>
        <h1 className="title">Generator</h1>
        <p className="subtitle">Instantly, without uploading video files.</p>
        
        <div className="input-container">
          <textarea
            className="url-input"
            placeholder="Enter YouTube URL... https://www.youtube.com/watch?v=Mcm3CD..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            rows={3}
          />
          <button className="submit-btn" onClick={handleSubmit}>
            Get Video Transcript
          </button>
        </div>
        
        <p className="footer-text">Quick and simple. No catch.</p>
      </div>
    </div>
  );
}

export default InputScreen;

