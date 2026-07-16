# Edeson File Converter

A modern, responsive, professional File Converter web application built with HTML5, CSS3, and Vanilla JavaScript. All file processing happens entirely in the browser — your files never leave your device.

## Features

### Image Converter
- Convert between PNG, JPG, WEBP, GIF, BMP
- Resize, crop, rotate, flip images
- Compress with adjustable quality
- Batch convert multiple images
- Preview before download

### Document Converter
- TXT ↔ HTML conversion
- JSON ↔ CSV conversion
- Markdown ↔ HTML conversion
- XML & JSON formatter (Pretty Print / Minify)

### Audio Converter
- WAV and OGG conversion
- Trim audio with start/end markers
- Volume adjustment
- Audio preview

### Video Converter
- MP4 and WebM conversion
- Trim video
- Mute audio track
- Capture thumbnail frames
- Video preview

### PDF Tools
- Convert images to PDF (jsPDF)
- Merge multiple PDFs (pdf-lib)
- Split PDF pages
- Rotate PDF pages
- Preview PDF files

### General Features
- Drag & Drop file upload
- Paste file support
- Dark Mode / Light Mode
- Glassmorphism UI effects
- Conversion history with search & filter
- Customizable settings
- Mobile responsive design
- Keyboard navigation
- Toast notifications

## Technology Stack

- **HTML5** — Semantic markup
- **CSS3** — Custom properties, animations, glassmorphism, responsive design
- **Vanilla JavaScript (ES6+)** — No frameworks, no build tools
- **Canvas API** — Image manipulation
- **Web Audio API** — Audio processing
- **MediaRecorder API** — Video conversion
- **Local Storage** — History and settings persistence

### CDN Libraries
- [Font Awesome 6](https://fontawesome.com/) — Icons
- [Google Fonts (Poppins)](https://fonts.google.com/) — Typography
- [jsPDF](https://parall.ax/jspdf/) — PDF creation
- [pdf-lib](https://pdf-lib.js.org/) — PDF manipulation
- [JSZip](https://stuk.github.io/jszip/) — ZIP file creation
- [marked.js](https://marked.js.org/) — Markdown parsing

## Usage

1. Open `index.html` in any modern web browser
2. No server, installation, or build process required
3. Select a converter from the sidebar
4. Upload files via drag & drop, click, or paste
5. Configure conversion settings
6. Click Convert and download your files

## Browser Compatibility

Works best in modern browsers:
- Google Chrome 80+
- Mozilla Firefox 80+
- Microsoft Edge 80+
- Safari 14+

> **Note:** Some format conversions are limited by browser APIs. The app will notify you when a conversion is not possible in the browser.

## Privacy

All file processing happens locally in your browser. No files are ever uploaded to any server. Your data stays on your device.

## Developer

**ENDY EDESON**

## License

MIT License — Free to use, modify, and distribute.

## Version

1.0.0
