/**
 * AudioConverter - Audio format conversion using Web Audio API
 * Supports browser-native format conversions (WAV, OGG)
 * Features: trim, volume adjustment, preview
 */
const AudioConverter = {
    files: [],
    audioContext: null,

    /**
     * Initialize audio converter
     */
    init() {
        const uploadZone = document.getElementById('audioUploadZone');
        const fileInput = document.getElementById('audioFileInput');
        const convertBtn = document.getElementById('audioConvertBtn');
        const clearBtn = document.getElementById('audioClearBtn');

        Converter.setupDragDrop(uploadZone, (files) => this.addFiles(files));
        Converter.setupFileInput(fileInput, (files) => this.addFiles(files));

        if (convertBtn) convertBtn.addEventListener('click', () => this.convert());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearAll());

        // Volume slider live update
        const volumeSlider = document.getElementById('audioVolume');
        const volumeValue = document.getElementById('audioVolumeValue');
        if (volumeSlider && volumeValue) {
            volumeSlider.addEventListener('input', (e) => {
                volumeValue.textContent = e.target.value + '%';
            });
        }
    },

    /**
     * Get or create AudioContext
     */
    getAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.audioContext;
    },

    /**
     * Add audio files
     * @param {File[]} files
     */
    addFiles(files) {
        const previewArea = document.getElementById('audioFilePreview');
        if (!previewArea) return;

        if (this.files.length > 0) {
            this.files = [];
            previewArea.innerHTML = '';
        }

        const file = files[0];
        const validation = Converter.validateFile(file, 'audio');
        if (!validation.valid) {
            if (window.App) App.showToast(validation.error, 'error');
            return;
        }

        const id = Converter.generateId();
        this.files.push({ id, file, originalName: file.name });
        previewArea.insertAdjacentHTML('beforeend', Converter.createFileCardHTML(file, id));

        // Generate audio preview
        this._addAudioPreview(file, id);
    },

    /**
     * Add an audio element for preview
     */
    _addAudioPreview(file, id) {
        const thumbEl = document.getElementById(`thumb-${id}`);
        if (!thumbEl) return;

        const url = URL.createObjectURL(file);
        thumbEl.innerHTML = `<audio src="${url}" controls style="width:48px;height:48px;"></audio>`;
    },

    /**
     * Convert the loaded audio file
     */
    async convert() {
        if (this.files.length === 0) {
            if (window.App) App.showToast('Please add an audio file first', 'warning');
            return;
        }

        const outputFormat = document.getElementById('audioOutputFormat')?.value || 'wav';
        const trimStart = document.getElementById('audioTrimStart')?.value || '';
        const trimEnd = document.getElementById('audioTrimEnd')?.value || '';
        const volume = parseInt(document.getElementById('audioVolume')?.value || 100) / 100;
        const item = this.files[0];

        Converter.showLoading('Converting audio...');

        try {
            Converter.updateFileStatus(item.id, 'pending', 'Converting...');

            // Decode audio
            const arrayBuffer = await Converter.readAsArrayBuffer(item.file);
            const audioCtx = this.getAudioContext();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

            // Trim
            let startSample = 0;
            let endSample = audioBuffer.length;

            if (trimStart) {
                const parts = trimStart.split(':');
                const seconds = parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseFloat(trimStart);
                startSample = Math.floor(seconds * audioBuffer.sampleRate);
            }
            if (trimEnd) {
                const parts = trimEnd.split(':');
                const seconds = parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseFloat(trimEnd);
                endSample = Math.floor(seconds * audioBuffer.sampleRate);
            }

            startSample = Math.max(0, Math.min(startSample, audioBuffer.length));
            endSample = Math.max(startSample, Math.min(endSample, audioBuffer.length));
            const newLength = endSample - startSample;

            // Create new buffer with trimmed audio
            const newBuffer = audioCtx.createBuffer(
                audioBuffer.numberOfChannels,
                newLength,
                audioBuffer.sampleRate
            );

            for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
                const oldData = audioBuffer.getChannelData(ch);
                const newData = newBuffer.getChannelData(ch);
                for (let i = 0; i < newLength; i++) {
                    newData[i] = oldData[startSample + i] * volume;
                }
            }

            // Encode to output format
            if (outputFormat === 'wav') {
                const wavBlob = this._encodeWav(newBuffer);
                Converter.downloadBlob(wavBlob, `${item.originalName.replace(/\.[^.]+$/, '')}.wav`);
            } else if (outputFormat === 'ogg') {
                // Try to use MediaRecorder for OGG
                const oggBlob = await this._encodeOgg(newBuffer, audioCtx);
                if (oggBlob) {
                    Converter.downloadBlob(oggBlob, `${item.originalName.replace(/\.[^.]+$/, '')}.ogg`);
                } else {
                    // Fallback to WAV
                    if (window.App) App.showToast('OGG encoding not supported, falling back to WAV', 'warning');
                    const wavBlob = this._encodeWav(newBuffer);
                    Converter.downloadBlob(wavBlob, `${item.originalName.replace(/\.[^.]+$/, '')}.wav`);
                }
            }

            Converter.updateFileStatus(item.id, 'success', 'Done');

            HistoryManager.addRecord({
                fileName: item.originalName,
                originalFormat: Converter.getExtension(item.originalName),
                convertedFormat: outputFormat,
                size: 0,
                status: 'success',
                category: 'audio'
            });

            if (window.App) App.showToast('Audio converted successfully', 'success');
        } catch (err) {
            console.error('Audio conversion error:', err);
            Converter.updateFileStatus(item.id, 'error', 'Failed');
            HistoryManager.addRecord({
                fileName: item.originalName,
                originalFormat: Converter.getExtension(item.originalName),
                convertedFormat: outputFormat,
                size: 0,
                status: 'error',
                category: 'audio'
            });
            if (window.App) App.showToast('Audio conversion failed: ' + err.message, 'error');
        }

        Converter.hideLoading();
        if (window.App && App.updateDashboard) App.updateDashboard();
    },

    /**
     * Encode AudioBuffer to WAV Blob
     * @param {AudioBuffer} buffer
     * @returns {Blob}
     */
    _encodeWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const blockAlign = numChannels * bytesPerSample;
        const dataLength = buffer.length * blockAlign;
        const headerLength = 44;
        const totalLength = headerLength + dataLength;

        const arrayBuffer = new ArrayBuffer(totalLength);
        const view = new DataView(arrayBuffer);

        // WAV header
        this._writeString(view, 0, 'RIFF');
        view.setUint32(4, totalLength - 8, true);
        this._writeString(view, 8, 'WAVE');
        this._writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // fmt chunk size
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        this._writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);

        // Interleave channels and write samples
        let offset = 44;
        for (let i = 0; i < buffer.length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
                const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, intSample, true);
                offset += 2;
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    },

    _writeString(view, offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    },

    /**
     * Try to encode AudioBuffer to OGG using MediaRecorder
     * @param {AudioBuffer} buffer
     * @param {AudioContext} ctx
     * @returns {Promise<Blob|null>}
     */
    async _encodeOgg(buffer, ctx) {
        try {
            const offlineCtx = new OfflineAudioContext(
                buffer.numberOfChannels,
                buffer.length,
                buffer.sampleRate
            );
            const source = offlineCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(offlineCtx.destination);
            source.start(0);

            const renderedBuffer = await offlineCtx.startRendering();

            // Try to use MediaRecorder with OGG
            const stream = ctx.createMediaStreamDestination();
            const sourceNode = ctx.createBufferSource();
            sourceNode.buffer = renderedBuffer;
            sourceNode.connect(stream);
            sourceNode.start(0);

            return new Promise((resolve) => {
                const chunks = [];
                let mimeType = 'audio/webm';
                if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                    mimeType = 'audio/ogg;codecs=opus';
                } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                    mimeType = 'audio/webm;codecs=opus';
                }

                const recorder = new MediaRecorder(stream, { mimeType });
                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data);
                };
                recorder.onstop = () => {
                    resolve(new Blob(chunks, { type: mimeType }));
                };
                recorder.start();

                setTimeout(() => recorder.stop(), (buffer.duration * 1000) + 500);
            });
        } catch (e) {
            console.warn('OGG encoding failed:', e);
            return null;
        }
    },

    /**
     * Clear all files
     */
    clearAll() {
        this.files = [];
        const previewArea = document.getElementById('audioFilePreview');
        if (previewArea) previewArea.innerHTML = '';
        const resultsArea = document.getElementById('audioResults');
        if (resultsArea) resultsArea.innerHTML = '';
        const player = document.getElementById('audioPreviewPlayer');
        if (player) {
            player.src = '';
            player.style.display = 'none';
        }
    }
};
