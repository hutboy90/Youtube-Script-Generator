# YouTube Transcript Downloader

A modern web application to download transcripts/subtitles from multiple YouTube videos simultaneously. Built with React + TypeScript frontend and Python serverless backend, deployable to Vercel.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18.2-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.2-3178c6.svg)
![Python](https://img.shields.io/badge/Python-3.10+-3776ab.svg)

## ✨ Features

- 📥 **Batch Download** - Download transcripts from multiple YouTube videos at once
- 🌍 **Multi-language Support** - Automatically detects available transcript languages (Vietnamese, English, etc.)
- 📋 **Copy & Download** - Copy transcript to clipboard or download as `.txt` file
- 📦 **Bulk Export** - Download all transcripts as a ZIP archive
- 🎨 **Modern UI** - Clean, responsive interface with real-time progress indicators
- ⚡ **Fast & Reliable** - Uses YouTube's official transcript API
- 🚀 **Vercel Ready** - One-click deployment to Vercel

## 🖼️ Screenshots

| Input Screen | Transcript Viewer |
|:---:|:---:|
| Enter multiple YouTube URLs | View, copy, and download transcripts |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- npm or yarn

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/youtube-transcript-downloader.git
   cd youtube-transcript-downloader
   ```

2. **Install Python dependencies**
   ```bash
   pip install youtube-transcript-api
   ```

3. **Start the backend server**
   ```bash
   cd backend
   npm install
   node index.js
   ```

4. **Start the frontend (new terminal)**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. **Open your browser**
   ```
   http://localhost:5173
   ```

## 🌐 Deploy to Vercel

1. Push code to GitHub
2. Import project in [Vercel Dashboard](https://vercel.com/new)
3. Vercel automatically detects the configuration
4. Click **Deploy**

The project includes `vercel.json` with proper configuration for:
- Frontend static build from `/frontend`
- Python serverless API from `/api`

## 📁 Project Structure

```
youtube-transcript-downloader/
├── api/                    # Vercel Python serverless functions
│   ├── transcript.py       # Transcript API endpoint
│   └── requirements.txt    # Python dependencies
├── backend/                # Local development server
│   ├── index.js            # Express server
│   └── transcript.py       # Python transcript fetcher
├── frontend/               # React + TypeScript app
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── types.ts        # TypeScript definitions
│   │   └── App.tsx         # Main app component
│   └── vite.config.ts      # Vite configuration
├── vercel.json             # Vercel deployment config
└── package.json            # Root package.json
```

## 🛠️ Tech Stack

**Frontend:**
- React 18 with TypeScript
- Vite for fast development & building
- JSZip for ZIP file generation
- FileSaver.js for file downloads

**Backend:**
- Python with `youtube-transcript-api`
- Express.js (local development)
- Vercel Serverless Functions (production)

## 📝 Usage

1. **Enter YouTube URLs** - Paste one or multiple YouTube video URLs (separated by space or newline)
2. **Click "Get Video Transcript"** - The app fetches transcripts for all videos
3. **View Transcripts** - Click on any video thumbnail to view its transcript
4. **Copy or Download** - Use the action buttons to copy or download individual transcripts
5. **Bulk Download** - Click "Download All Scripts" to get all transcripts as a ZIP file

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api) - Python library for fetching YouTube transcripts
- [Vite](https://vitejs.dev/) - Next generation frontend tooling
- [Vercel](https://vercel.com/) - Platform for frontend frameworks and static sites

---

**⭐ If you find this project useful, please consider giving it a star!**

