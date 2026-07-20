/**
 * DevStats - Hidden app statistics tracker
 * Intended for developer use only. Nearly invisible to regular users.
 * All data stored in localStorage. No backend, no external analytics.
 * Toggle developer mode with CTRL + SHIFT + D
 */
const DevStats = {
    STORAGE_KEY: 'edeson_dev_stats',
    sessionStart: Date.now(),
    devMode: false,

    init() {
        this._loadStats();
        this._trackVisit();
        this._trackConversionEvents();
        this._render();
        this._startSessionTimer();
        this._bindDevMode();
    },

    _loadStats() {
        const stored = StorageManager.get(this.STORAGE_KEY, null);
        const today = new Date().toDateString();

        if (stored) {
            this.stats = stored;
            if (this.stats.lastVisitDate !== today) {
                this.stats.todayVisitors = 0;
                this.stats.lastVisitDate = today;
            }
        } else {
            this.stats = {
                todayVisitors: 0,
                totalVisits: 0,
                filesConverted: 0,
                pdfConversions: 0,
                imageConversions: 0,
                audioConversions: 0,
                videoConversions: 0,
                successfulConversions: 0,
                failedConversions: 0,
                totalConversionTime: 0,
                conversionCount: 0,
                lastVisitDate: today,
                lastVisitTime: new Date().toLocaleString(),
                browser: this._detectBrowser(),
                os: this._detectOS()
            };
        }
    },

    _save() {
        StorageManager.set(this.STORAGE_KEY, this.stats);
    },

    _trackVisit() {
        this.stats.todayVisitors++;
        this.stats.totalVisits++;
        this.stats.lastVisitTime = new Date().toLocaleString();
        this.stats.browser = this._detectBrowser();
        this.stats.os = this._detectOS();
        this._save();
    },

    _trackConversionEvents() {
        const origAddRecord = HistoryManager.addRecord.bind(HistoryManager);
        const self = this;

        HistoryManager.addRecord = function(record) {
            const startTime = performance.now();
            const entry = origAddRecord(record);
            const elapsed = performance.now() - startTime;

            self.stats.filesConverted++;
            self.stats.totalConversionTime += elapsed;
            self.stats.conversionCount++;

            const cat = (record.category || '').toLowerCase();
            if (cat === 'pdf') self.stats.pdfConversions++;
            else if (cat === 'image') self.stats.imageConversions++;
            else if (cat === 'audio') self.stats.audioConversions++;
            else if (cat === 'video') self.stats.videoConversions++;

            if (record.status === 'success') self.stats.successfulConversions++;
            else self.stats.failedConversions++;

            self._save();
            self._render();
            return entry;
        };
    },

    _startSessionTimer() {
        setInterval(() => this._render(), 30000);
    },

    _render() {
        const el = document.getElementById('appDevStats');
        if (!el) return;

        const avgTime = this.stats.conversionCount > 0
            ? (this.stats.totalConversionTime / this.stats.conversionCount / 1000).toFixed(1)
            : '0.0';

        const sessionDuration = this._formatDuration(Date.now() - this.sessionStart);

        el.innerHTML = `
            <span class="dev-stats-line">Visitors Today: ${this.stats.todayVisitors} <span class="dev-stats-divider"></span> Total Visits: ${this.stats.totalVisits}</span>
            <span class="dev-stats-line">Files: ${this.stats.filesConverted} <span class="dev-stats-divider"></span> PDF: ${this.stats.pdfConversions} <span class="dev-stats-divider"></span> Images: ${this.stats.imageConversions} <span class="dev-stats-divider"></span> Audio: ${this.stats.audioConversions} <span class="dev-stats-divider"></span> Video: ${this.stats.videoConversions}</span>
            <span class="dev-stats-line">OK: ${this.stats.successfulConversions} <span class="dev-stats-divider"></span> Failed: ${this.stats.failedConversions} <span class="dev-stats-divider"></span> Avg Time: ${avgTime}s</span>
            <span class="dev-stats-line">${this.stats.browser} / ${this.stats.os} <span class="dev-stats-divider"></span> Last: ${this.stats.lastVisitTime} <span class="dev-stats-divider"></span> Session: ${sessionDuration}</span>
        `;
    },

    _formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    },

    _detectBrowser() {
        const ua = navigator.userAgent;
        if (ua.includes('Firefox/')) return 'Firefox';
        if (ua.includes('Edg/')) return 'Edge';
        if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
        if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome';
        if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari';
        return 'Other';
    },

    _detectOS() {
        const ua = navigator.userAgent;
        if (ua.includes('Win')) return 'Windows';
        if (ua.includes('Mac')) return 'macOS';
        if (ua.includes('Linux')) return 'Linux';
        if (ua.includes('Android')) return 'Android';
        if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
        return 'Other';
    },

    _bindDevMode() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                this.devMode = !this.devMode;
                const el = document.getElementById('appDevStats');
                if (el) {
                    el.classList.toggle('dev-mode', this.devMode);
                }
            }
        });
    }
};
