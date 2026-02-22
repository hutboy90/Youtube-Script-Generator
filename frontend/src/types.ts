export interface TranscriptItem {
  timestamp: string;
  text: string;
  duration: number;
}

export interface VideoTranscript {
  videoId: string;
  title: string;
  thumbnail: string;
  author: string;
  transcript: TranscriptItem[];
}

export interface VideoInfo {
  url: string;
  videoId: string;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  progress: number;
  data?: VideoTranscript;
  error?: string;
}

