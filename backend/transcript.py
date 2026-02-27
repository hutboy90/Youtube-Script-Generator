#!/usr/bin/env python3
import sys
import json
from youtube_transcript_api import YouTubeTranscriptApi

def get_transcript(video_id):
    try:
        api = YouTubeTranscriptApi()

        # First, list available transcripts
        transcript_list = api.list(video_id)

        # Try to get transcript in order of preference: vi, en, or any available
        transcript = None
        languages_to_try = ['vi', 'en']

        for lang in languages_to_try:
            try:
                transcript = api.fetch(video_id, languages=[lang])
                break
            except:
                continue

        # If no preferred language found, get any available transcript
        if transcript is None:
            available = list(transcript_list)
            if available:
                transcript = available[0].fetch()

        if transcript is None:
            return {"success": False, "error": "No transcript available for this video"}

        snippets = list(transcript.snippets)
        result = []

        for seg in snippets:
            result.append({
                "start": seg.start,
                "duration": seg.duration,
                "text": seg.text
            })

        return {"success": True, "transcript": result}

    except Exception as e:
        error_msg = str(e)
        # Check for IP blocking error
        if "IP" in error_msg or "blocked" in error_msg.lower() or "too many requests" in error_msg.lower():
            return {"success": False, "error": "Your IP has been blocked by YouTube. Please try again later or use a VPN to change your IP address."}
        return {"success": False, "error": error_msg}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Video ID required"}))
        sys.exit(1)
    
    video_id = sys.argv[1]
    result = get_transcript(video_id)
    print(json.dumps(result, ensure_ascii=False))

