/**
 * DocumentConverter - Text-based document format conversion
 * Supports TXT, HTML, Markdown, JSON, CSV, XML conversions
 */
const DocumentConverter = {
    files: [],

    /**
     * Initialize document converter
     */
    init() {
        const uploadZone = document.getElementById('docUploadZone');
        const fileInput = document.getElementById('docFileInput');
        const convertBtn = document.getElementById('docConvertBtn');
        const clearBtn = document.getElementById('docClearBtn');

        Converter.setupDragDrop(uploadZone, (files) => this.addFiles(files));
        Converter.setupFileInput(fileInput, (files) => this.addFiles(files));

        // Paste support for text files
        document.addEventListener('paste', (e) => {
            const activePage = document.querySelector('.nav-link.active');
            if (activePage && activePage.dataset.page === 'document-converter') {
                const items = Array.from(e.clipboardData.items);
                const textFiles = items
                    .filter(item => item.type.startsWith('text/'))
                    .map(item => item.getAsFile())
                    .filter(f => f);
                if (textFiles.length > 0) this.addFiles(textFiles);
            }
        });

        if (convertBtn) convertBtn.addEventListener('click', () => this.convert());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearAll());
    },

    /**
     * Add files to the converter
     * @param {File[]} files
     */
    addFiles(files) {
        const previewArea = document.getElementById('docFilePreview');
        if (!previewArea) return;

        // Only accept the latest file (single file for document conversion)
        if (this.files.length > 0) {
            this.files = [];
            previewArea.innerHTML = '';
        }

        const file = files[0];
        const validation = Converter.validateFile(file, 'document');
        if (!validation.valid) {
            if (window.App) App.showToast(validation.error, 'error');
            return;
        }

        const id = Converter.generateId();
        this.files.push({ id, file, originalName: file.name });
        previewArea.insertAdjacentHTML('beforeend', Converter.createFileCardHTML(file, id));
    },

    /**
     * Convert the loaded document
     */
    async convert() {
        if (this.files.length === 0) {
            if (window.App) App.showToast('Please add a document first', 'warning');
            return;
        }

        const conversionType = document.getElementById('docConversionType')?.value || 'txt-to-html';
        const outputName = document.getElementById('docOutputName')?.value || '';
        const item = this.files[0];

        Converter.showLoading('Converting document...');

        try {
            Converter.updateFileStatus(item.id, 'pending', 'Converting...');
            const content = await Converter.readAsText(item.file);
            const ext = Converter.getExtension(item.originalName);

            let result = '';
            let outputExt = 'txt';
            let outputMime = 'text/plain';

            switch (conversionType) {
                case 'txt-to-html':
                    result = this.txtToHtml(content);
                    outputExt = 'html';
                    outputMime = 'text/html';
                    break;
                case 'html-to-txt':
                    result = this.htmlToTxt(content);
                    outputExt = 'txt';
                    outputMime = 'text/plain';
                    break;
                case 'json-to-csv':
                    result = this.jsonToCsv(content);
                    outputExt = 'csv';
                    outputMime = 'text/csv';
                    break;
                case 'csv-to-json':
                    result = this.csvToJson(content);
                    outputExt = 'json';
                    outputMime = 'application/json';
                    break;
                case 'md-to-html':
                    result = this.mdToHtml(content);
                    outputExt = 'html';
                    outputMime = 'text/html';
                    break;
                case 'html-to-md':
                    result = this.htmlToMd(content);
                    outputExt = 'md';
                    outputMime = 'text/markdown';
                    break;
                case 'xml-pretty':
                    result = this.xmlPrettyPrint(content);
                    outputExt = 'xml';
                    outputMime = 'application/xml';
                    break;
                case 'xml-minify':
                    result = this.xmlMinify(content);
                    outputExt = 'xml';
                    outputMime = 'application/xml';
                    break;
                case 'json-pretty':
                    result = this.jsonPrettyPrint(content);
                    outputExt = 'json';
                    outputMime = 'application/json';
                    break;
                case 'json-minify':
                    result = this.jsonMinify(content);
                    outputExt = 'json';
                    outputMime = 'application/json';
                    break;
                default:
                    throw new Error('Unknown conversion type');
            }

            const baseName = outputName || item.originalName.replace(/\.[^.]+$/, '');
            const filename = `${baseName}.${outputExt}`;

            Converter.downloadText(result, filename, outputMime);
            Converter.updateFileStatus(item.id, 'success', 'Done');

            HistoryManager.addRecord({
                fileName: item.originalName,
                originalFormat: ext,
                convertedFormat: outputExt,
                size: new Blob([result]).size,
                status: 'success',
                category: 'document'
            });

            // Show result preview
            this.showResult(result, outputExt);

            if (window.App) App.showToast('Document converted successfully', 'success');
        } catch (err) {
            console.error('Document conversion error:', err);
            Converter.updateFileStatus(item.id, 'error', 'Failed');
            HistoryManager.addRecord({
                fileName: item.originalName,
                originalFormat: Converter.getExtension(item.originalName),
                convertedFormat: '?',
                size: 0,
                status: 'error',
                category: 'document'
            });
            if (window.App) App.showToast('Conversion failed: ' + err.message, 'error');
        }

        Converter.hideLoading();
        if (window.App && App.updateDashboard) App.updateDashboard();
    },

    // === Conversion Functions ===

    txtToHtml(text) {
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>\n');
        return `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>Converted Document</title>\n<style>body{font-family:sans-serif;padding:20px;line-height:1.6;}</style>\n</head>\n<body>\n${escaped}\n</body>\n</html>`;
    },

    htmlToTxt(html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent || temp.innerText || '';
    },

    jsonToCsv(jsonStr) {
        const data = JSON.parse(jsonStr);
        const arr = Array.isArray(data) ? data : [data];
        if (arr.length === 0) return '';

        const headers = Object.keys(arr[0]);
        const csvRows = [headers.join(',')];

        arr.forEach(row => {
            const values = headers.map(h => {
                let val = row[h] === undefined || row[h] === null ? '' : String(row[h]);
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    val = '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            });
            csvRows.push(values.join(','));
        });

        return csvRows.join('\n');
    },

    csvToJson(csvStr) {
        const lines = csvStr.trim().split('\n');
        if (lines.length < 2) return JSON.stringify([], null, 2);

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const result = [];

        for (let i = 1; i < lines.length; i++) {
            const values = this._parseCsvLine(lines[i]);
            const obj = {};
            headers.forEach((h, idx) => {
                obj[h] = values[idx] !== undefined ? values[idx] : '';
            });
            result.push(obj);
        }

        return JSON.stringify(result, null, 2);
    },

    _parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (i + 1 < line.length && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    current += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += ch;
                }
            }
        }
        result.push(current.trim());
        return result;
    },

    mdToHtml(md) {
        if (typeof marked !== 'undefined' && marked.parse) {
            return `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>Converted Markdown</title>\n<style>body{font-family:sans-serif;padding:20px;line-height:1.6;max-width:800px;margin:0 auto;}pre{background:#f4f4f4;padding:12px;border-radius:8px;overflow-x:auto;}code{background:#f4f4f4;padding:2px 6px;border-radius:4px;}</style>\n</head>\n<body>\n${marked.parse(md)}\n</body>\n</html>`;
        }
        // Fallback simple markdown conversion
        let html = md
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>\n');
        return `<html><body>${html}</body></html>`;
    },

    htmlToMd(html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        // Basic HTML to Markdown
        let md = temp.innerHTML
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
            .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&nbsp;/g, ' ')
            .trim();
        return md;
    },

    xmlPrettyPrint(xml) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, 'application/xml');
            const errorNode = doc.querySelector('parsererror');
            if (errorNode) throw new Error('Invalid XML');
            return this._formatXml(doc.documentElement, 0);
        } catch (e) {
            // If parsing fails, do basic indentation
            return xml.replace(/>\s*</g, '>\n<').replace(/(<[^/][^>]*>)([^<]+)/g, '$1\n  $2');
        }
    },

    _formatXml(node, level) {
        const indent = '  '.repeat(level);
        let result = '';

        if (node.childNodes.length === 1 && node.childNodes[0].nodeType === 3) {
            result += `${indent}<${node.tagName}>${node.textContent.trim()}</${node.tagName}>`;
            return result;
        }

        result += `${indent}<${node.tagName}`;
        if (node.attributes) {
            for (const attr of node.attributes) {
                result += ` ${attr.name}="${attr.value}"`;
            }
        }
        result += '>\n';

        for (const child of node.childNodes) {
            if (child.nodeType === 1) {
                result += this._formatXml(child, level + 1) + '\n';
            } else if (child.nodeType === 3 && child.textContent.trim()) {
                result += `${'  '.repeat(level + 1)}${child.textContent.trim()}\n`;
            }
        }

        result += `${indent}</${node.tagName}>`;
        return result;
    },

    xmlMinify(xml) {
        return xml.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
    },

    jsonPrettyPrint(jsonStr) {
        const data = JSON.parse(jsonStr);
        return JSON.stringify(data, null, 2);
    },

    jsonMinify(jsonStr) {
        const data = JSON.parse(jsonStr);
        return JSON.stringify(data);
    },

    /**
     * Show conversion result preview
     */
    showResult(content, ext) {
        const resultsArea = document.getElementById('docResults');
        if (!resultsArea) return;

        const preview = content.length > 500 ? content.substring(0, 500) + '...' : content;

        resultsArea.innerHTML = `
            <h3>Conversion Result</h3>
            <div class="result-card">
                <div class="result-info" style="width:100%;">
                    <pre style="background:var(--bg-secondary);padding:16px;border-radius:8px;overflow-x:auto;max-height:300px;font-size:0.8rem;line-height:1.5;">${this._escapeHtml(preview)}</pre>
                    <p style="margin-top:8px;font-size:0.8rem;color:var(--text-muted);">Output: .${ext} &bull; ${content.length} characters</p>
                </div>
            </div>
        `;
    },

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Clear all files
     */
    clearAll() {
        this.files = [];
        const previewArea = document.getElementById('docFilePreview');
        if (previewArea) previewArea.innerHTML = '';
        const resultsArea = document.getElementById('docResults');
        if (resultsArea) resultsArea.innerHTML = '';
    }
};
