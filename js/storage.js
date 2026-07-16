/**
 * StorageManager - LocalStorage abstraction layer
 * Handles all localStorage operations with JSON serialization
 */
const StorageManager = {
    /**
     * Get an item from localStorage
     * @param {string} key - The key to retrieve
     * @param {*} defaultValue - Default value if key doesn't exist
     * @returns {*} The parsed value or defaultValue
     */
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.error(`StorageManager.get error for key "${key}":`, e);
            return defaultValue;
        }
    },

    /**
     * Set an item in localStorage
     * @param {string} key - The key to set
     * @param {*} value - The value to store (will be JSON serialized)
     * @returns {boolean} True if successful, false otherwise
     */
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error(`StorageManager.set error for key "${key}":`, e);
            // Handle quota exceeded
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                console.warn('localStorage quota exceeded. Consider clearing old data.');
            }
            return false;
        }
    },

    /**
     * Remove an item from localStorage
     * @param {string} key - The key to remove
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error(`StorageManager.remove error for key "${key}":`, e);
        }
    },

    /**
     * Check if a key exists in localStorage
     * @param {string} key - The key to check
     * @returns {boolean}
     */
    has(key) {
        return localStorage.getItem(key) !== null;
    },

    /**
     * Clear all localStorage data
     */
    clear() {
        try {
            localStorage.clear();
        } catch (e) {
            console.error('StorageManager.clear error:', e);
        }
    },

    /**
     * Get all keys in localStorage
     * @returns {string[]} Array of keys
     */
    keys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            keys.push(localStorage.key(i));
        }
        return keys;
    },

    /**
     * Get approximate size of localStorage usage in bytes
     * @returns {number} Size in bytes
     */
    getSize() {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            total += (key.length + value.length) * 2; // UTF-16
        }
        return total;
    },

    /**
     * Format bytes to human-readable string
     * @param {number} bytes
     * @returns {string}
     */
    formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};
