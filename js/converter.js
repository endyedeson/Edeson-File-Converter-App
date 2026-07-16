/**
 * Converter - Base conversion utilities and shared functionality
 * Handles file validation, drag-and-drop, progress tracking, downloads, and toasts
 */
const Converter = {
    // Supported file types organized by category
    supportedTypes: {
        image: {
            extensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.ico', '.tiff', '.heic'],
            mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/x-icon', 'image/tiff']
        },
        document: {
            extensions: ['.txt', '.html', '.htm', '.md', '.json', '.csv', '.xml'],
            mimeTypes: ['text/plain', 'text/html', 'text/markdown', 'application/json', 'text/csv', 'application/xml', 'text/xml']
        },
        audio: {
            extensions: ['.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac'],
            mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/flac']
        },
        video: {
            extensions: ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
            mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
        },
        pdf: {
            extensions: ['.pdf'],
            mimeTypes: ['application/pdf']
        }
    },

    maxFileSize: 100 * 1024 * 1024, // 100MB default max

    /**
     * Validate a file against supported types for a category
     * @param {File} file
     * @param {string} category - 'image', 'document', 'audio', 'video', 'pdf'
     * @returns {{ valid: boolean, error?: string }}
     */
    validateFile(file, category) {
        if (!file) {
            return { valid: false, error: 'No file provided' };
        }

        if (file.size > this.maxFileSize) {
            return { valid: false, error: `File too large. Maximum size is ${StorageManager.formatSize(this.maxFileSize)}` };
        }

        const config = this.supportedTypes[category];
        if (!config) {
            return { valid: false, error: 'Unknown file category' };
        }

        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!config.extensions.includes(ext)) {
            return { valid: false, error: `Unsupported file type: ${ext}` };
        }

        return { valid: true };
    },

    /**
     * Get file extension without dot
     * @param {string} filename
     * @returns {string}
     */
    getExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    },

    /**
     * Get MIME type from extension
     * @param {string} ext - Extension without dot
     * @returns {string}
     */
    getMimeType(ext) {
        const mimeMap = {
            'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
            'webp': 'image/webp', 'gif': 'image/gif', 'bmp': 'image/bmp',
            'svg': 'image/svg+xml', 'ico': 'image/x-icon', 'tiff': 'image/tiff',
            'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
            'aac': 'audio/aac', 'm4a': 'audio/mp4', 'flac': 'audio/flac',
            'mp4': 'video/mp4', 'webm': 'video/webm', 'mov': 'video/quicktime',
            'avi': 'video/x-msvideo', 'mkv': 'video/x-matroska',
            'txt': 'text/plain', 'html': 'text/html', 'htm': 'text/html',
            'md': 'text/markdown', 'json': 'application/json',
            'csv': 'text/csv', 'xml': 'application/xml',
            'pdf': 'application/pdf'
        };
        return mimeMap[ext] || 'application/octet-stream';
    },

    /**
     * Read file as Data URL
     * @param {File} file
     * @returns {Promise<string>}
     */
    readAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    },

    /**
     * Read file as Text
     * @param {File} file
     * @returns {Promise<string>}
     */
    readAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    },

    /**
     * Read file as ArrayBuffer
     * @param {File} file
     * @returns {Promise<ArrayBuffer>}
     */
    readAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Download a blob as a file
     * @param {Blob} blob
     * @param {string} filename
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    },

    /**
     * Download text content as a file
     * @param {string} content
     * @param {string} filename
     * @param {string} mimeType
     */
    downloadText(content, filename, mimeType = 'text/plain') {
        const blob = new Blob([content], { type: mimeType });
        this.downloadBlob(blob, filename);
    },

    /**
     * Download a canvas as an image file
     * @param {HTMLCanvasElement} canvas
     * @param {string} filename
     * @param {string} mimeType - 'image/png', 'image/jpeg', 'image/webp'
     * @param {number} quality - 0-1 for jpeg/webp
     */
    downloadCanvas(canvas, filename, mimeType = 'image/png', quality = 0.92) {
        canvas.toBlob((blob) => {
            if (blob) {
                this.downloadBlob(blob, filename);
            }
        }, mimeType, quality);
    },

    /**
     * Set up drag and drop on an element
     * @param {HTMLElement} zone - The drop zone element
     * @param {Function} onFiles - Callback receiving File array
     */
    setupDragDrop(zone, onFiles) {
        if (!zone) return;

        ['dragenter', 'dragover'].forEach(event => {
            zone.addEventListener(event, (e) => {
                e.preventDefault();
                e.stopPropagation();
                zone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(event => {
            zone.addEventListener(event, (e) => {
                e.preventDefault();
                e.stopPropagation();
                zone.classList.remove('dragover');
            });
        });

        zone.addEventListener('drop', (e) => {
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0 && onFiles) onFiles(files);
        });

        zone.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') {
                const input = zone.querySelector('input[type="file"]');
                if (input) input.click();
            }
        });
    },

    /**
     * Set up file input change handler
     * @param {HTMLInputElement} input
     * @param {Function} onFiles - Callback receiving File array
     */
    setupFileInput(input, onFiles) {
        if (!input) return;
        input.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0 && onFiles) onFiles(files);
            input.value = ''; // Reset so same file can be selected again
        });
    },

    /**
     * Generate a file preview card HTML
     * @param {File} file
     * @param {string} id - Unique identifier
     * @returns {string} HTML string
     */
    createFileCardHTML(file, id) {
        const ext = this.getExtension(file.name);
        const category = HistoryManager.getCategory(ext);
        const iconMap = {
            image: 'fa-file-image',
            document: 'fa-file-alt',
            audio: 'fa-file-audio',
            video: 'fa-file-video',
            pdf: 'fa-file-pdf',
            other: 'fa-file'
        };
        const icon = iconMap[category] || 'fa-file';

        return `
            <div class="file-card" data-id="${id}" data-file-name="${file.name}">
                <div class="file-thumbnail" id="thumb-${id}">
                    <i class="fas ${icon}" style="font-size:1.5rem;color:var(--secondary);padding:12px;"></i>
                </div>
                <div class="file-info">
                    <div class="file-name" title="${file.name}">${file.name}</div>
                    <div class="file-meta">${ext.toUpperCase()} &bull; ${StorageManager.formatSize(file.size)}</div>
                    <div class="file-meta">${file.type || 'Unknown type'}</div>
                </div>
                <span class="file-status status-pending" id="status-${id}">Ready</span>
                <button class="file-remove" onclick="this.closest('.file-card').remove()" title="Remove">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    },

    /**
     * Generate image thumbnail
     * @param {File} file
     * @param {string} containerId - Element ID for the thumbnail container
     */
    generateImageThumbnail(file, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            container.innerHTML = `<img src="${e.target.result}" alt="Thumbnail" style="width:48px;height:48px;object-fit:cover;border-radius:8px;">`;
        };
        reader.readAsDataURL(file);
    },

    /**
     * Show loading overlay
     * @param {string} text
     */
    showLoading(text = 'Processing...') {
        const overlay = document.getElementById('loadingOverlay');
        const textEl = document.getElementById('loadingText');
        if (overlay) overlay.classList.add('active');
        if (textEl) textEl.textContent = text;
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.remove('active');
    },

    /**
     * Update file card status
     * @param {string} id
     * @param {string} status - 'pending', 'success', 'error'
     * @param {string} text
     */
    updateFileStatus(id, status, text) {
        const el = document.getElementById(`status-${id}`);
        if (el) {
            el.className = `file-status status-${status}`;
            el.textContent = text;
        }
    },

    /**
     * Generate unique ID
     * @returns {string}
     */
    generateId() {
        return 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    },

    /**
     * Get image dimensions from a file
     * @param {File} file
     * @returns {Promise<{width: number, height: number}>}
     */
    getImageDimensions(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
                URL.revokeObjectURL(img.src);
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = URL.createObjectURL(file);
        });
    },

    /**
     * Load an image from a file into an HTMLImageElement
     * @param {File} file
     * @returns {Promise<HTMLImageElement>}
     */
    loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                resolve(img);
                URL.revokeObjectURL(img.src);
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = URL.createObjectURL(file);
        });
    }
};
