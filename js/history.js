/**
 * HistoryManager - Conversion history tracking and display
 * Stores all conversion records in localStorage
 */
const HistoryManager = {
    STORAGE_KEY: 'edeson_history',
    records: [],

    /**
     * Initialize history from localStorage
     */
    init() {
        this.records = StorageManager.get(this.STORAGE_KEY, []);
        this.bindUI();
    },

    /**
     * Add a new conversion record
     * @param {Object} record - { fileName, originalFormat, convertedFormat, size, status, category }
     * @returns {Object} The created record with id, date, time
     */
    addRecord(record) {
        const now = new Date();
        const entry = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            date: now.toLocaleDateString(),
            time: now.toLocaleTimeString(),
            timestamp: now.getTime(),
            fileName: record.fileName || 'Unknown',
            originalFormat: record.originalFormat || '',
            convertedFormat: record.convertedFormat || '',
            size: record.size || 0,
            sizeFormatted: record.sizeFormatted || StorageManager.formatSize(record.size || 0),
            status: record.status || 'success', // success, error
            category: record.category || 'other' // image, document, audio, video, pdf, other
        };

        this.records.unshift(entry); // Add to beginning

        // Keep only last 500 records to prevent storage overflow
        if (this.records.length > 500) {
            this.records = this.records.slice(0, 500);
        }

        this.save();
        return entry;
    },

    /**
     * Remove a record by id
     * @param {string} id
     */
    removeRecord(id) {
        this.records = this.records.filter(r => r.id !== id);
        this.save();
    },

    /**
     * Clear all history
     */
    clearAll() {
        this.records = [];
        this.save();
        this.render();
    },

    /**
     * Save records to localStorage
     */
    save() {
        StorageManager.set(this.STORAGE_KEY, this.records);
    },

    /**
     * Search records
     * @param {string} query
     * @param {string} filter - category filter: 'all', 'image', 'document', 'audio', 'video', 'pdf'
     * @returns {Object[]}
     */
    search(query = '', filter = 'all') {
        let results = [...this.records];

        if (filter && filter !== 'all') {
            results = results.filter(r => r.category === filter);
        }

        if (query) {
            const q = query.toLowerCase();
            results = results.filter(r =>
                r.fileName.toLowerCase().includes(q) ||
                r.originalFormat.toLowerCase().includes(q) ||
                r.convertedFormat.toLowerCase().includes(q)
            );
        }

        return results;
    },

    /**
     * Get stats for dashboard
     * @returns {Object}
     */
    getStats() {
        const today = new Date().toLocaleDateString();
        return {
            total: this.records.length,
            today: this.records.filter(r => r.date === today).length,
            successful: this.records.filter(r => r.status === 'success').length,
            failed: this.records.filter(r => r.status === 'error').length,
            recent: this.records.slice(0, 5),
            storageUsed: StorageManager.formatSize(StorageManager.getSize())
        };
    },

    /**
     * Get category from file extension
     * @param {string} extension
     * @returns {string}
     */
    getCategory(extension) {
        const ext = extension.toLowerCase().replace('.', '');
        const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'tiff', 'heic'];
        const docExts = ['txt', 'html', 'htm', 'md', 'json', 'csv', 'xml'];
        const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'];
        const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
        const pdfExts = ['pdf'];

        if (imageExts.includes(ext)) return 'image';
        if (docExts.includes(ext)) return 'document';
        if (audioExts.includes(ext)) return 'audio';
        if (videoExts.includes(ext)) return 'video';
        if (pdfExts.includes(ext)) return 'pdf';
        return 'other';
    },

    /**
     * Bind UI events
     */
    bindUI() {
        const searchInput = document.getElementById('historySearch');
        const filterSelect = document.getElementById('historyFilter');
        const clearBtn = document.getElementById('clearHistoryBtn');

        if (searchInput) {
            searchInput.addEventListener('input', () => this.render());
        }
        if (filterSelect) {
            filterSelect.addEventListener('change', () => this.render());
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm('Clear all conversion history?')) {
                    this.clearAll();
                    if (window.App) App.showToast('History cleared', 'success');
                }
            });
        }
    },

    /**
     * Render the history table
     */
    render() {
        const searchInput = document.getElementById('historySearch');
        const filterSelect = document.getElementById('historyFilter');
        const tableBody = document.getElementById('historyTableBody');
        const emptyState = document.getElementById('historyEmpty');

        const query = searchInput ? searchInput.value : '';
        const filter = filterSelect ? filterSelect.value : 'all';
        const results = this.search(query, filter);

        if (!tableBody) return;

        if (results.length === 0) {
            tableBody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        tableBody.innerHTML = results.map(record => `
            <tr data-id="${record.id}">
                <td>${record.date}</td>
                <td>${record.time}</td>
                <td title="${record.fileName}">${this._truncate(record.fileName, 30)}</td>
                <td><span class="badge badge-${record.category}">${record.originalFormat.toUpperCase()}</span></td>
                <td><span class="badge badge-${record.category}">${record.convertedFormat.toUpperCase()}</span></td>
                <td>${record.sizeFormatted}</td>
                <td><span class="status-badge status-${record.status}">${record.status === 'success' ? 'Success' : 'Failed'}</span></td>
                <td class="actions-cell">
                    <button class="btn-icon" onclick="HistoryManager.render()" title="Refresh"><i class="fas fa-sync-alt"></i></button>
                    <button class="btn-icon btn-icon-danger" onclick="HistoryManager.removeRecord('${record.id}'); HistoryManager.render();" title="Delete"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    /**
     * Truncate string to max length
     */
    _truncate(str, max) {
        return str.length > max ? str.substring(0, max) + '...' : str;
    }
};
