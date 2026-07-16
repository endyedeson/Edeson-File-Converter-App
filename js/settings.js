/**
 * SettingsManager - Application settings management
 * Handles theme, quality defaults, auto-rename, and other preferences
 */
const SettingsManager = {
    STORAGE_KEY: 'edeson_settings',

    defaults: {
        theme: 'dark',
        language: 'en',
        defaultQuality: 90,
        autoRename: true,
        defaultFormat: 'png'
    },

    current: null,

    /**
     * Initialize settings from localStorage or defaults
     */
    init() {
        this.current = StorageManager.get(this.STORAGE_KEY, { ...this.defaults });
        this.applyTheme();
        this.bindUI();
    },

    /**
     * Get a setting value
     * @param {string} key
     * @returns {*}
     */
    get(key) {
        return this.current ? this.current[key] : this.defaults[key];
    },

    /**
     * Set a setting value and persist
     * @param {string} key
     * @param {*} value
     */
    set(key, value) {
        if (!this.current) this.current = { ...this.defaults };
        this.current[key] = value;
        StorageManager.set(this.STORAGE_KEY, this.current);

        if (key === 'theme') {
            this.applyTheme();
        }
    },

    /**
     * Apply the current theme to the document
     */
    applyTheme() {
        const theme = this.get('theme');
        document.documentElement.setAttribute('data-theme', theme);

        // Update theme toggle icon
        const themeBtn = document.getElementById('themeToggle');
        if (themeBtn) {
            const icon = themeBtn.querySelector('i');
            if (icon) {
                icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
            }
        }
    },

    /**
     * Toggle between dark and light themes
     */
    toggleTheme() {
        const current = this.get('theme');
        const next = current === 'dark' ? 'light' : 'dark';
        this.set('theme', next);
    },

    /**
     * Bind settings UI elements
     */
    bindUI() {
        // Theme toggle
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Settings page elements
        this._bindSettingToggle('settingAutoRename', 'autoRename');

        const qualitySlider = document.getElementById('settingDefaultQuality');
        const qualityValue = document.getElementById('settingDefaultQualityValue');
        if (qualitySlider) {
            qualitySlider.value = this.get('defaultQuality');
            if (qualityValue) qualityValue.textContent = qualitySlider.value + '%';
            qualitySlider.addEventListener('input', (e) => {
                this.set('defaultQuality', parseInt(e.target.value));
                if (qualityValue) qualityValue.textContent = e.target.value + '%';
            });
        }

        // Theme setting toggle on settings page
        const themeCheckbox = document.getElementById('settingTheme');
        if (themeCheckbox) {
            themeCheckbox.checked = this.get('theme') === 'light';
            themeCheckbox.addEventListener('change', (e) => {
                this.set('theme', e.target.checked ? 'light' : 'dark');
            });
        }

        // Clear cache
        const clearCacheBtn = document.getElementById('clearCacheBtn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear the cache?')) {
                    StorageManager.remove('edeson_downloads');
                    if (window.App) App.showToast('Cache cleared successfully', 'success');
                }
            });
        }

        // Clear history
        const clearHistoryBtn = document.getElementById('clearHistoryBtnSettings');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear all history?')) {
                    if (window.HistoryManager) HistoryManager.clearAll();
                    if (window.App) App.showToast('History cleared', 'success');
                }
            });
        }

        // Reset app
        const resetBtn = document.getElementById('resetAppBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('This will reset all settings and clear all data. Are you sure?')) {
                    StorageManager.clear();
                    this.current = { ...this.defaults };
                    this.applyTheme();
                    if (window.App) App.showToast('App has been reset', 'success');
                }
            });
        }
    },

    /**
     * Helper to bind a toggle switch to a boolean setting
     */
    _bindToggle(elementId, settingKey) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.classList.toggle('active', this.get(settingKey));
        el.addEventListener('click', () => {
            const newVal = !this.get(settingKey);
            this.set(settingKey, newVal);
            el.classList.toggle('active', newVal);
        });
    },

    /**
     * Helper to bind a checkbox/toggle to a boolean setting
     */
    _bindSettingToggle(elementId, settingKey) {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (el.classList.contains('toggle-switch')) {
            this._bindToggle(elementId, settingKey);
        } else {
            el.checked = this.get(settingKey);
            el.addEventListener('change', (e) => {
                this.set(settingKey, e.target.checked);
            });
        }
    },

    /**
     * Reset settings to defaults
     */
    reset() {
        this.current = { ...this.defaults };
        StorageManager.set(this.STORAGE_KEY, this.current);
        this.applyTheme();
    }
};
