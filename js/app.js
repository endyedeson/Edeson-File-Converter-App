/**
 * App - Main application controller
 * Handles initialization, navigation, dashboard, search, toasts, and global events
 */
const App = {
    currentPage: 'dashboard',

    /**
     * Initialize the entire application
     */
    init() {
        // Initialize all modules
        SettingsManager.init();
        HistoryManager.init();
        ImageConverter.init();
        DocumentConverter.init();
        AudioConverter.init();
        VideoConverter.init();
        PDFTools.init();

        // Bind navigation and interaction
        this.bindNavigation();
        this.bindSearch();
        this.bindMobileSidebar();
        this.bindDashboardUpload();

        // Set initial page
        this.navigateTo('dashboard');

        console.log('Edeson File Converter initialized successfully');
    },

    // ==================== NAVIGATION ====================

    /**
     * Bind sidebar navigation link clicks
     */
    bindNavigation() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.navigateTo(page);
            });
        });
    },

    /**
     * Navigate to a page/section
     * @param {string} page - Page identifier
     */
    navigateTo(page) {
        this.currentPage = page;

        // Update active nav link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.page === page);
        });

        // Show/hide sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.toggle('active', section.id === `section-${page}`);
        });

        // Close mobile sidebar if open
        this.closeMobileSidebar();

        // Page-specific updates
        if (page === 'dashboard') {
            this.updateDashboard();
        } else if (page === 'history') {
            HistoryManager.render();
        }

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // ==================== MOBILE SIDEBAR ====================

    /**
     * Bind mobile sidebar toggle
     */
    bindMobileSidebar() {
        const toggle = document.getElementById('sidebarToggle');
        const topbarToggle = document.getElementById('topbarToggle');
        const sidebar = document.getElementById('sidebar');

        const toggleSidebar = () => {
            if (sidebar) sidebar.classList.toggle('active');
            this._toggleOverlay();
        };

        if (toggle) toggle.addEventListener('click', toggleSidebar);
        if (topbarToggle) topbarToggle.addEventListener('click', toggleSidebar);

        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.id = 'sidebarOverlay';
        overlay.addEventListener('click', () => this.closeMobileSidebar());
        document.body.appendChild(overlay);
    },

    _toggleOverlay() {
        const overlay = document.getElementById('sidebarOverlay');
        const sidebar = document.getElementById('sidebar');
        if (overlay && sidebar) {
            overlay.classList.toggle('active', sidebar.classList.contains('active'));
        }
    },

    closeMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    },

    // ==================== DASHBOARD ====================

    /**
     * Bind dashboard quick upload zone
     */
    bindDashboardUpload() {
        const uploadZone = document.getElementById('dashUploadZone');
        const fileInput = document.getElementById('dashFileInput');

        Converter.setupDragDrop(uploadZone, (files) => this.handleDashboardFiles(files));
        Converter.setupFileInput(fileInput, (files) => this.handleDashboardFiles(files));
    },

    /**
     * Handle files uploaded via dashboard
     * Routes files to appropriate converter
     * @param {File[]} files
     */
    handleDashboardFiles(files) {
        if (files.length === 0) return;

        const file = files[0];
        const ext = Converter.getExtension(file.name);
        const category = HistoryManager.getCategory(ext);

        // Route to appropriate converter
        switch (category) {
            case 'image':
                this.navigateTo('image-converter');
                setTimeout(() => ImageConverter.addFiles(files), 100);
                break;
            case 'document':
                this.navigateTo('document-converter');
                setTimeout(() => DocumentConverter.addFiles(files), 100);
                break;
            case 'audio':
                this.navigateTo('audio-converter');
                setTimeout(() => AudioConverter.addFiles(files), 100);
                break;
            case 'video':
                this.navigateTo('video-converter');
                setTimeout(() => VideoConverter.addFiles(files), 100);
                break;
            case 'pdf':
                this.navigateTo('pdf-tools');
                setTimeout(() => PDFTools.addFiles(files), 100);
                break;
            default:
                this.showToast('Unsupported file format', 'error');
        }
    },

    /**
     * Update dashboard statistics
     */
    updateDashboard() {
        const stats = HistoryManager.getStats();

        this._setStatValue('statFilesConverted', stats.total);
        this._setStatValue('statTodayConversions', stats.today);
        this._setStatValue('statSuccessful', stats.successful);
        this._setStatValue('statFailed', stats.failed);
        this._setStatValue('statRecentFiles', stats.recent ? stats.recent.length : 0);
        this._setStatValue('statStorageUsed', stats.storageUsed);

        // Update recent files table
        this._renderRecentFiles(stats.recent || []);
    },

    /**
     * Set a stat card value
     * @param {string} elementId
     * @param {string|number} value
     */
    _setStatValue(elementId, value) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = value;
    },

    /**
     * Render recent files table on dashboard
     * @param {Array} records
     */
    _renderRecentFiles(records) {
        const tbody = document.getElementById('dashRecentFilesBody');
        if (!tbody) return;

        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:24px;color:var(--text-muted);">No recent conversions</td></tr>';
            return;
        }

        tbody.innerHTML = records.map(record => `
            <tr>
                <td title="${record.fileName}">${this._truncate(record.fileName, 25)}</td>
                <td><span class="badge badge-${record.category}">${record.originalFormat.toUpperCase()}</span></td>
                <td>${record.sizeFormatted || 'N/A'}</td>
                <td>${record.date}</td>
                <td><span class="status-badge status-${record.status}">${record.status === 'success' ? 'Success' : 'Failed'}</span></td>
            </tr>
        `).join('');
    },

    // ==================== SEARCH ====================

    /**
     * Bind global search functionality
     */
    bindSearch() {
        const searchInput = document.querySelector('.topbar-search input') || document.getElementById('globalSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                if (query.length > 0) {
                    this.performSearch(query);
                }
            });

            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const query = e.target.value.toLowerCase().trim();
                    if (query) {
                        this.navigateTo('history');
                        const historySearch = document.getElementById('historySearch');
                        if (historySearch) {
                            historySearch.value = query;
                            HistoryManager.render();
                        }
                    }
                }
            });
        }
    },

    /**
     * Perform a search across file types and history
     * @param {string} query
     */
    performSearch(query) {
        const converters = [
            { name: 'Image Converter', page: 'image-converter', keywords: ['image', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'photo'] },
            { name: 'Document Converter', page: 'document-converter', keywords: ['document', 'text', 'html', 'json', 'csv', 'xml', 'markdown'] },
            { name: 'Audio Converter', page: 'audio-converter', keywords: ['audio', 'music', 'mp3', 'wav', 'ogg', 'sound'] },
            { name: 'Video Converter', page: 'video-converter', keywords: ['video', 'mp4', 'webm', 'movie'] },
            { name: 'PDF Tools', page: 'pdf-tools', keywords: ['pdf', 'merge', 'split', 'rotate'] }
        ];

        const match = converters.find(c =>
            c.name.toLowerCase().includes(query) ||
            c.keywords.some(k => k.includes(query))
        );

        if (match) {
            this.navigateTo(match.page);
        }
    },

    // ==================== TOAST NOTIFICATIONS ====================

    /**
     * Show a toast notification
     * @param {string} message - Notification message
     * @param {string} type - 'success', 'error', 'warning', 'info'
     * @param {number} duration - Duration in ms (default: 4000)
     */
    showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const iconMap = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas ${iconMap[type] || iconMap.info} toast-icon"></i>
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="Close notification"><i class="fas fa-times"></i></button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            this._removeToast(toast);
        });

        container.appendChild(toast);

        setTimeout(() => this._removeToast(toast), duration);
    },

    /**
     * Remove a toast with leaving animation
     * @param {HTMLElement} toast
     */
    _removeToast(toast) {
        if (!toast || !toast.parentNode) return;
        toast.classList.add('leaving');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    },

    // ==================== UTILITIES ====================

    /**
     * Truncate string
     * @param {string} str
     * @param {number} max
     * @returns {string}
     */
    _truncate(str, max) {
        if (!str) return '';
        return str.length > max ? str.substring(0, max) + '...' : str;
    },

    /**
     * Show loading overlay
     * @param {string} text
     */
    showLoading(text = 'Processing...') {
        Converter.showLoading(text);
    },

    hideLoading() {
        Converter.hideLoading();
    }
};

// ==================== INITIALIZE ON DOM READY ====================
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
