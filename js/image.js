/**
 * ImageConverter - Image format conversion, resize, crop, rotate, flip, compress
 * Uses Canvas API for all browser-side image manipulation
 */
const ImageConverter = {
    files: [],

    /**
     * Initialize image converter - bind events
     */
    init() {
        const uploadZone = document.getElementById('imageUploadZone');
        const fileInput = document.getElementById('imageFileInput');
        const convertBtn = document.getElementById('imageConvertBtn');
        const clearBtn = document.getElementById('imageClearBtn');

        // Set up drag and drop
        Converter.setupDragDrop(uploadZone, (files) => this.addFiles(files));
        Converter.setupFileInput(fileInput, (files) => this.addFiles(files));

        // Paste support
        document.addEventListener('paste', (e) => {
            const activePage = document.querySelector('.nav-link.active');
            if (activePage && activePage.dataset.page === 'image-converter') {
                const items = Array.from(e.clipboardData.items);
                const imageFiles = items
                    .filter(item => item.type.startsWith('image/'))
                    .map(item => item.getAsFile())
                    .filter(f => f);
                if (imageFiles.length > 0) this.addFiles(imageFiles);
            }
        });

        if (convertBtn) convertBtn.addEventListener('click', () => this.convertAll());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearAll());

        // Quality slider live update
        const qualitySlider = document.getElementById('imageQuality');
        const qualityValue = document.getElementById('imageQualityValue');
        if (qualitySlider && qualityValue) {
            qualitySlider.addEventListener('input', (e) => {
                qualityValue.textContent = e.target.value + '%';
            });
        }

        // Keep aspect ratio - link width/height
        const widthInput = document.getElementById('imageWidth');
        const heightInput = document.getElementById('imageHeight');
        const keepRatio = document.getElementById('imageKeepRatio');
        let lastEdited = null;

        if (widthInput && heightInput && keepRatio) {
            widthInput.addEventListener('input', () => {
                if (keepRatio.checked && lastEdited !== 'height' && this._aspectRatio) {
                    heightInput.value = Math.round(widthInput.value / this._aspectRatio);
                }
                lastEdited = 'width';
            });
            heightInput.addEventListener('input', () => {
                if (keepRatio.checked && lastEdited !== 'width' && this._aspectRatio) {
                    widthInput.value = Math.round(heightInput.value * this._aspectRatio);
                }
                lastEdited = 'height';
            });
        }
    },

    _aspectRatio: null,

    /**
     * Add files to the converter
     * @param {File[]} files
     */
    addFiles(files) {
        const previewArea = document.getElementById('imageFilePreview');
        if (!previewArea) return;

        files.forEach(file => {
            const validation = Converter.validateFile(file, 'image');
            if (!validation.valid) {
                if (window.App) App.showToast(validation.error, 'error');
                return;
            }

            // Show HEIC warning
            const ext = Converter.getExtension(file.name);
            if (ext === 'heic') {
                if (window.App) App.showToast('HEIC format may not be supported by your browser. Attempting conversion...', 'warning');
            }

            const id = Converter.generateId();
            this.files.push({ id, file, originalName: file.name });

            previewArea.insertAdjacentHTML('beforeend', Converter.createFileCardHTML(file, id));

            // Generate thumbnail for images
            if (file.type.startsWith('image/') && ext !== 'heic') {
                Converter.generateImageThumbnail(file, `thumb-${id}`);
            }

            // Track aspect ratio from first image
            if (!this._aspectRatio && file.type.startsWith('image/')) {
                Converter.getImageDimensions(file).then(dim => {
                    this._aspectRatio = dim.width / dim.height;
                }).catch(() => {});
            }
        });
    },

    /**
     * Convert all loaded images
     */
    async convertAll() {
        if (this.files.length === 0) {
            if (window.App) App.showToast('Please add images first', 'warning');
            return;
        }

        const outputFormat = document.getElementById('imageOutputFormat')?.value || 'png';
        const quality = parseInt(document.getElementById('imageQuality')?.value || 90) / 100;
        const targetWidth = parseInt(document.getElementById('imageWidth')?.value) || 0;
        const targetHeight = parseInt(document.getElementById('imageHeight')?.value) || 0;
        const rotate = document.getElementById('imageRotate')?.value || 'none';
        const flip = document.getElementById('imageFlip')?.value || 'none';
        const outputName = document.getElementById('imageOutputName')?.value || '';

        Converter.showLoading('Converting images...');

        let successCount = 0;
        let failCount = 0;

        for (const item of this.files) {
            try {
                Converter.updateFileStatus(item.id, 'pending', 'Converting...');

                const img = await Converter.loadImageFromFile(item.file);
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Calculate dimensions
                let width = targetWidth || img.naturalWidth;
                let height = targetHeight || img.naturalHeight;

                if (targetWidth && !targetHeight) {
                    const ratio = img.naturalHeight / img.naturalWidth;
                    height = Math.round(width * ratio);
                } else if (targetHeight && !targetWidth) {
                    const ratio = img.naturalWidth / img.naturalHeight;
                    width = Math.round(height * ratio);
                }

                canvas.width = width;
                canvas.height = height;

                // Handle rotation and flip
                ctx.save();
                ctx.translate(width / 2, height / 2);

                if (rotate === '90') ctx.rotate(90 * Math.PI / 180);
                else if (rotate === '180') ctx.rotate(180 * Math.PI / 180);
                else if (rotate === '270') ctx.rotate(270 * Math.PI / 180);

                if (flip === 'horizontal') ctx.scale(-1, 1);
                else if (flip === 'vertical') ctx.scale(1, -1);

                ctx.translate(-width / 2, -height / 2);
                ctx.drawImage(img, 0, 0, width, height);
                ctx.restore();

                // Determine output MIME type
                const mimeMap = {
                    'png': 'image/png',
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                    'webp': 'image/webp'
                };
                const mimeType = mimeMap[outputFormat] || 'image/png';

                // Convert canvas to blob and download
                const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));
                if (blob) {
                    const baseName = outputName || item.originalName.replace(/\.[^.]+$/, '');
                    const filename = `${baseName}.${outputFormat}`;

                    Converter.downloadBlob(blob, filename);
                    Converter.updateFileStatus(item.id, 'success', 'Done');

                    // Record in history
                    HistoryManager.addRecord({
                        fileName: item.originalName,
                        originalFormat: Converter.getExtension(item.originalName),
                        convertedFormat: outputFormat,
                        size: blob.size,
                        status: 'success',
                        category: 'image'
                    });
                    successCount++;
                }
            } catch (err) {
                console.error('Image conversion error:', err);
                Converter.updateFileStatus(item.id, 'error', 'Failed');
                HistoryManager.addRecord({
                    fileName: item.originalName,
                    originalFormat: Converter.getExtension(item.originalName),
                    convertedFormat: outputFormat,
                    size: 0,
                    status: 'error',
                    category: 'image'
                });
                failCount++;
            }
        }

        Converter.hideLoading();

        if (successCount > 0) {
            if (window.App) App.showToast(`Successfully converted ${successCount} image(s)`, 'success');
        }
        if (failCount > 0) {
            if (window.App) App.showToast(`Failed to convert ${failCount} image(s)`, 'error');
        }

        // Update dashboard if visible
        if (window.App && App.updateDashboard) App.updateDashboard();
    },

    /**
     * Clear all files
     */
    clearAll() {
        this.files = [];
        this._aspectRatio = null;
        const previewArea = document.getElementById('imageFilePreview');
        if (previewArea) previewArea.innerHTML = '';
        const resultsArea = document.getElementById('imageResults');
        if (resultsArea) resultsArea.innerHTML = '';
    }
};
