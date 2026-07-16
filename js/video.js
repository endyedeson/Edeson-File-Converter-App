/**
 * VideoConverter - Video format conversion using MediaRecorder API
 * Supports browser-compatible conversions (MP4, WebM)
 * Features: trim, mute, thumbnail capture, preview
 */
const VideoConverter = {
    files: [],

    /**
     * Initialize video converter
     */
    init() {
        const uploadZone = document.getElementById('videoUploadZone');
        const fileInput = document.getElementById('videoFileInput');
        const convertBtn = document.getElementById('videoConvertBtn');
        const clearBtn = document.getElementById('videoClearBtn');
        const thumbBtn = document.getElementById('videoCaptureThumb');

        Converter.setupDragDrop(uploadZone, (files) => this.addFiles(files));
        Converter.setupFileInput(fileInput, (files) => this.addFiles(files));

        if (convertBtn) convertBtn.addEventListener('click', () => this.convert());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearAll());
        if (thumbBtn) thumbBtn.addEventListener('click', () => this.captureThumbnail());
    },

    /**
     * Add video files
     * @param {File[]} files
     */
    addFiles(files) {
        const previewArea = document.getElementById('videoFilePreview');
        if (!previewArea) return;

        if (this.files.length > 0) {
            this.files = [];
            previewArea.innerHTML = '';
        }

        const file = files[0];
        const validation = Converter.validateFile(file, 'video');
        if (!validation.valid) {
            if (window.App) App.showToast(validation.error, 'error');
            return;
        }

        const id = Converter.generateId();
        this.files.push({ id, file, originalName: file.name });
        previewArea.insertAdjacentHTML('beforeend', Converter.createFileCardHTML(file, id));

        // Add video preview
        this._addVideoPreview(file, id);
    },

    /**
     * Add a video preview element
     */
    _addVideoPreview(file, id) {
        const thumbEl = document.getElementById(`thumb-${id}`);
        if (!thumbEl) return;

        const url = URL.createObjectURL(file);
        thumbEl.innerHTML = `<video src="${url}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;"></video>`;
    },

    /**
     * Convert the loaded video file
     * Note: Full format conversion is limited by browser APIs
     */
    async convert() {
        if (this.files.length === 0) {
            if (window.App) App.showToast('Please add a video file first', 'warning');
            return;
        }

        const outputFormat = document.getElementById('videoOutputFormat')?.value || 'webm';
        const trimStart = document.getElementById('videoTrimStart')?.value || '';
        const trimEnd = document.getElementById('videoTrimEnd')?.value || '';
        const mute = document.getElementById('videoMute')?.checked || false;
        const item = this.files[0];

        Converter.showLoading('Processing video...');

        try {
            Converter.updateFileStatus(item.id, 'pending', 'Processing...');

            const video = document.createElement('video');
            video.muted = true;
            video.preload = 'auto';

            await new Promise((resolve, reject) => {
                video.onloadedmetadata = resolve;
                video.onerror = () => reject(new Error('Failed to load video. The format may not be supported by your browser.'));
                video.src = URL.createObjectURL(item.file);
            });

            const duration = video.duration;
            let startTime = 0;
            let endTime = duration;

            if (trimStart) {
                startTime = this._parseTime(trimStart);
            }
            if (trimEnd) {
                endTime = this._parseTime(trimEnd);
            }

            startTime = Math.max(0, Math.min(startTime, duration));
            endTime = Math.max(startTime, Math.min(endTime, duration));

            // Capture frames and record
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 360;
            const ctx = canvas.getContext('2d');

            const stream = canvas.captureStream(30);

            // Add audio track if not muted
            if (!mute) {
                try {
                    const audioCtx = new AudioContext();
                    const source = audioCtx.createMediaElementSource(video);
                    const destination = audioCtx.createMediaStreamDestination();
                    source.connect(destination);
                    source.connect(audioCtx.destination);
                    stream.addTrack(destination.stream.getAudioTracks()[0]);
                } catch (e) {
                    console.warn('Could not add audio track:', e);
                }
            }

            // Determine MIME type
            let mimeType = 'video/webm;codecs=vp8';
            if (outputFormat === 'mp4') {
                if (MediaRecorder.isTypeSupported('video/mp4')) {
                    mimeType = 'video/mp4';
                } else {
                    if (window.App) App.showToast('MP4 recording not supported by your browser. Output will be WebM.', 'warning');
                    mimeType = 'video/webm;codecs=vp8';
                }
            } else {
                if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                    mimeType = 'video/webm;codecs=vp9';
                } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
                    mimeType = 'video/webm;codecs=vp8';
                }
            }

            const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
            const chunks = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            const recordedBlob = await new Promise((resolve, reject) => {
                recorder.onstop = () => {
                    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
                    resolve(new Blob(chunks, { type: mimeType }));
                };
                recorder.onerror = reject;

                recorder.start(100);

                video.currentTime = startTime;
                video.play();

                const drawFrame = () => {
                    if (video.currentTime >= endTime || video.ended) {
                        video.pause();
                        recorder.stop();
                        return;
                    }

                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    requestAnimationFrame(drawFrame);
                };

                video.onplay = () => {
                    drawFrame();
                };
            });

            URL.revokeObjectURL(video.src);

            const ext = outputFormat === 'mp4' ? 'mp4' : 'webm';
            const filename = `${item.originalName.replace(/\.[^.]+$/, '')}.${ext}`;

            Converter.downloadBlob(recordedBlob, filename);
            Converter.updateFileStatus(item.id, 'success', 'Done');

            HistoryManager.addRecord({
                fileName: item.originalName,
                originalFormat: Converter.getExtension(item.originalName),
                convertedFormat: ext,
                size: recordedBlob.size,
                status: 'success',
                category: 'video'
            });

            // Show in results area
            this._showResult(recordedBlob, ext);

            if (window.App) App.showToast('Video processed successfully', 'success');
        } catch (err) {
            console.error('Video conversion error:', err);
            Converter.updateFileStatus(item.id, 'error', 'Failed');
            HistoryManager.addRecord({
                fileName: item.originalName,
                originalFormat: Converter.getExtension(item.originalName),
                convertedFormat: outputFormat,
                size: 0,
                status: 'error',
                category: 'video'
            });
            if (window.App) App.showToast('Video conversion failed: ' + err.message, 'error');
        }

        Converter.hideLoading();
        if (window.App && App.updateDashboard) App.updateDashboard();
    },

    /**
     * Capture thumbnail from the first video frame
     */
    async captureThumbnail() {
        if (this.files.length === 0) {
            if (window.App) App.showToast('Please add a video first', 'warning');
            return;
        }

        const item = this.files[0];

        try {
            const video = document.createElement('video');
            video.preload = 'auto';
            video.muted = true;

            await new Promise((resolve, reject) => {
                video.onloadeddata = resolve;
                video.onerror = () => reject(new Error('Failed to load video'));
                video.src = URL.createObjectURL(item.file);
            });

            video.currentTime = Math.min(1, video.duration * 0.1);

            await new Promise(resolve => {
                video.onseeked = resolve;
            });

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            URL.revokeObjectURL(video.src);

            canvas.toBlob((blob) => {
                const name = item.originalName.replace(/\.[^.]+$/, '') + '_thumbnail.png';
                Converter.downloadBlob(blob, name);
                if (window.App) App.showToast('Thumbnail captured!', 'success');

                // Show in results
                const resultsArea = document.getElementById('videoResults');
                if (resultsArea) {
                    const url = URL.createObjectURL(blob);
                    resultsArea.innerHTML = `
                        <h3>Thumbnail</h3>
                        <div class="result-card">
                            <img src="${url}" alt="Thumbnail" style="max-width:320px;border-radius:8px;">
                            <div class="result-info">
                                <p><strong>${name}</strong></p>
                                <p style="font-size:0.8rem;color:var(--text-muted);">PNG Image</p>
                            </div>
                        </div>
                    `;
                }
            }, 'image/png');

        } catch (err) {
            if (window.App) App.showToast('Failed to capture thumbnail: ' + err.message, 'error');
        }
    },

    /**
     * Show conversion result
     */
    _showResult(blob, ext) {
        const resultsArea = document.getElementById('videoResults');
        if (!resultsArea) return;

        const url = URL.createObjectURL(blob);
        resultsArea.innerHTML = `
            <h3>Converted Video</h3>
            <div class="result-card">
                <video src="${url}" controls class="media-preview" style="max-width:400px;border-radius:8px;"></video>
                <div class="result-info">
                    <p><strong>Output:</strong> .${ext}</p>
                    <p style="font-size:0.8rem;color:var(--text-muted);">Size: ${StorageManager.formatSize(blob.size)}</p>
                </div>
            </div>
        `;
    },

    /**
     * Parse time string (HH:MM:SS or MM:SS or SS) to seconds
     */
    _parseTime(timeStr) {
        const parts = timeStr.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] || 0;
    },

    /**
     * Clear all files
     */
    clearAll() {
        this.files = [];
        const previewArea = document.getElementById('videoFilePreview');
        if (previewArea) previewArea.innerHTML = '';
        const resultsArea = document.getElementById('videoResults');
        if (resultsArea) resultsArea.innerHTML = '';
        const player = document.getElementById('videoPreviewPlayer');
        if (player) {
            player.src = '';
            player.style.display = 'none';
        }
    }
};
