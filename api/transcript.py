from http.server import BaseHTTPRequestHandler
import json
from youtube_transcript_api import YouTubeTranscriptApi
import re

def extract_video_id(url):
    """Extract video ID from YouTube URL"""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
        r'^([a-zA-Z0-9_-]{11})$'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def format_timestamp(seconds):
    """Format seconds to HH:MM:SS.mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"

def get_transcript(video_id):
    """Fetch transcript for a video using user's IP directly"""
    try:
        api = YouTubeTranscriptApi()

        # Try different languages
        transcript = None
        for lang in ['vi', 'en']:
            try:
                transcript = api.fetch(video_id, languages=[lang])
                break
            except:
                continue

        # If no preferred language, get any available
        if transcript is None:
            transcript_list = api.list(video_id)
            available = list(transcript_list)
            if available:
                transcript = available[0].fetch()

        if transcript is None:
            return {"success": False, "error": "No transcript available for this video"}

        snippets = list(transcript.snippets)
        result = []

        for seg in snippets:
            result.append({
                "timestamp": format_timestamp(seg.start),
                "text": seg.text,
                "duration": seg.duration
            })

        return {"success": True, "transcript": result}

    except Exception as e:
        error_msg = str(e)
        # Check for IP blocking error
        if "IP" in error_msg or "blocked" in error_msg.lower() or "too many requests" in error_msg.lower():
            return {"success": False, "error": "Your IP has been blocked by YouTube. Please try again later or use a VPN to change your IP address."}
        return {"success": False, "error": error_msg}

def get_video_info(video_id):
    """Get video info using oEmbed"""
    import urllib.request
    try:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read().decode())
            return {
                "title": data.get("title", f"Video {video_id}"),
                "author": data.get("author_name", "Unknown"),
                "thumbnail": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
            }
    except:
        return {
            "title": f"Video {video_id}",
            "author": "Unknown",
            "thumbnail": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
        }

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body)
            url = data.get('url', '')
            
            video_id = extract_video_id(url)
            if not video_id:
                self.send_error_response(400, "Invalid YouTube URL")
                return
            
            # Get video info
            video_info = get_video_info(video_id)
            
            # Get transcript
            transcript_result = get_transcript(video_id)
            
            if not transcript_result["success"]:
                self.send_error_response(500, transcript_result.get("error", "Failed to fetch transcript"))
                return
            
            response = {
                "success": True,
                "data": {
                    "videoId": video_id,
                    "title": video_info["title"],
                    "thumbnail": video_info["thumbnail"],
                    "author": video_info["author"],
                    "transcript": transcript_result["transcript"]
                }
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
            
        except Exception as e:
            self.send_error_response(500, str(e))
    
    def send_error_response(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"success": False, "error": message}).encode('utf-8'))

