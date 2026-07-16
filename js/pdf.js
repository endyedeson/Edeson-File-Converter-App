/**
 * PDFTools - PDF creation, manipulation, and processing
 * Uses jsPDF for creation and pdf-lib for manipulation
 * All operations run entirely in the browser
 */
const PDFTools = {
    currentTool: null,
    files: [],
    _pdfPages: [],

    init() {
        document.querySelectorAll('.pdf-tool-card').forEach(card => {
            card.addEventListener('click', () => {
                const tool = card.dataset.tool;
                this.selectTool(tool);
            });
            card.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.selectTool(card.dataset.tool);
                }
            });
        });

        const uploadZone = document.getElementById('pdfUploadZone');
        const fileInput = document.getElementById('pdfFileInput');

        Converter.setupDragDrop(uploadZone, (files) => this.addFiles(files));
        Converter.setupFileInput(fileInput, (files) => this.addFiles(files));

        const processBtn = document.getElementById('pdfProcessBtn');
        if (processBtn) processBtn.addEventListener('click', () => this.process());

        const backBtn = document.getElementById('pdfBackBtn');
        if (backBtn) backBtn.addEventListener('click', () => this.backToTools());
    },

    selectTool(tool) {
        this.currentTool = tool;
        this.files = [];
        this._pdfPages = [];

        const toolArea = document.getElementById('pdfToolArea');
        const toolTitle = document.getElementById('pdfToolTitle');
        const splitSettings = document.getElementById('pdfSplitSettings');
        const rotationSettings = document.getElementById('pdfRotationSettings');
        const fileInput = document.getElementById('pdfFileInput');
        const pdfPreview = document.getElementById('pdfPreviewFrame');
        const pdfPagesArea = document.getElementById('pdfPagesArea');

        document.querySelector('.tool-cards-grid').style.display = 'none';
        if (toolArea) toolArea.classList.remove('hidden');
        if (pdfPreview) { pdfPreview.classList.add('hidden'); pdfPreview.src = ''; }
        if (pdfPagesArea) pdfPagesArea.innerHTML = '';

        const titles = {
            'images-to-pdf': 'Convert Images to PDF',
            'merge-pdfs': 'Merge PDF Files',
            'split-pdf': 'Split PDF Pages',
            'rotate-pdf': 'Rotate PDF Pages',
            'preview-pdf': 'Preview PDF'
        };
        if (toolTitle) toolTitle.textContent = titles[tool] || 'PDF Tool';

        if (fileInput) {
            if (tool === 'images-to-pdf') {
                fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
                fileInput.multiple = true;
            } else {
                fileInput.accept = '.pdf';
                fileInput.multiple = tool === 'merge-pdfs';
            }
        }

        if (splitSettings) splitSettings.style.display = tool === 'split-pdf' ? 'flex' : 'none';
        if (rotationSettings) rotationSettings.style.display = tool === 'rotate-pdf' ? 'flex' : 'none';

        const previewHint = document.getElementById('pdfUploadHint');
        if (previewHint) {
            if (tool === 'images-to-pdf') {
                previewHint.textContent = 'Supports PNG, JPG, WEBP, GIF images';
            } else {
                previewHint.textContent = 'Supports PDF files' + (tool === 'merge-pdfs' ? ' (select multiple)' : '');
            }
        }
    },

    backToTools() {
        this.currentTool = null;
        this.files = [];
        this._pdfPages = [];

        const toolArea = document.getElementById('pdfToolArea');
        const grid = document.querySelector('.tool-cards-grid');
        const previewFiles = document.getElementById('pdfFilePreview');
        const results = document.getElementById('pdfResults');
        const pdfPreview = document.getElementById('pdfPreviewFrame');
        const pdfPagesArea = document.getElementById('pdfPagesArea');

        if (toolArea) toolArea.classList.add('hidden');
        if (grid) grid.style.display = '';
        if (previewFiles) previewFiles.innerHTML = '';
        if (results) results.innerHTML = '';
        if (pdfPreview) { pdfPreview.classList.add('hidden'); pdfPreview.src = ''; }
        if (pdfPagesArea) pdfPagesArea.innerHTML = '';
    },

    addFiles(files) {
        const previewArea = document.getElementById('pdfFilePreview');
        if (!previewArea) return;

        if (this.currentTool !== 'merge-pdfs' && this.currentTool !== 'images-to-pdf') {
            this.files = [];
            previewArea.innerHTML = '';
        }

        files.forEach(file => {
            const ext = Converter.getExtension(file.name);
            const validExts = this.currentTool === 'images-to-pdf'
                ? ['png', 'jpg', 'jpeg', 'webp', 'gif']
                : ['pdf'];

            if (!validExts.includes(ext)) {
                if (window.App) App.showToast(`Unsupported file type: .${ext}. ${this.currentTool === 'images-to-pdf' ? 'Please use PNG, JPG, WEBP, or GIF images.' : 'Please use PDF files.'}`, 'error');
                return;
            }

            const id = Converter.generateId();
            this.files.push({ id, file, originalName: file.name });
            previewArea.insertAdjacentHTML('beforeend', Converter.createFileCardHTML(file, id));

            if (ext !== 'pdf' && file.type.startsWith('image/')) {
                Converter.generateImageThumbnail(file, `thumb-${id}`);
            }
        });

        if (this.currentTool === 'preview-pdf' && this.files.length > 0) {
            this.previewPdfInline();
        }

        if ((this.currentTool === 'split-pdf' || this.currentTool === 'rotate-pdf') && this.files.length > 0) {
            this._loadPdfPages();
        }
    },

    async _loadPdfPages() {
        const pdfPagesArea = document.getElementById('pdfPagesArea');
        if (!pdfPagesArea || this.files.length === 0) return;

        try {
            const { PDFDocument } = PDFLib;
            const pdfBytes = await Converter.readAsArrayBuffer(this.files[0].file);
            const pdf = await PDFDocument.load(pdfBytes);
            const pageCount = pdf.getPageCount();

            this._pdfPages = [];
            for (let i = 0; i < pageCount; i++) {
                this._pdfPages.push({ index: i, removed: false });
            }

            this._renderPdfPages(pdfPagesArea, pageCount);
        } catch (err) {
            pdfPagesArea.innerHTML = `<p style="color:var(--error);font-size:0.85rem;">Failed to read PDF: ${err.message}</p>`;
        }
    },

    _renderPdfPages(container, pageCount) {
        let html = `<h3 style="margin-bottom:10px;font-size:0.95rem;">Pages (${pageCount} total)</h3>`;
        html += `<p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:10px;">Click "Remove" to exclude pages, or drag to reorder.</p>`;
        html += `<div class="pdf-page-list" id="pdfPageList">`;

        this._pdfPages.forEach((page, i) => {
            html += `
                <div class="pdf-page-item ${page.removed ? 'removed' : ''}" data-index="${i}" draggable="true">
                    <span class="page-handle"><i class="fas fa-grip-vertical"></i></span>
                    <span class="page-number">Page ${i + 1}</span>
                    <span class="page-info">Page ${i + 1} of ${pageCount}</span>
                    <button class="page-remove" onclick="PDFTools.togglePageRemove(${i})" title="${page.removed ? 'Restore' : 'Remove'}">
                        <i class="fas ${page.removed ? 'fa-undo' : 'fa-times'}"></i> ${page.removed ? 'Restore' : 'Remove'}
                    </button>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;

        this._setupDragReorder();
    },

    togglePageRemove(index) {
        if (this._pdfPages[index]) {
            this._pdfPages[index].removed = !this._pdfPages[index].removed;
            const container = document.getElementById('pdfPagesArea');
            if (container) this._renderPdfPages(container, this._pdfPages.length);
        }
    },

    _setupDragReorder() {
        const list = document.getElementById('pdfPageList');
        if (!list) return;

        let dragItem = null;

        list.querySelectorAll('.pdf-page-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                dragItem = item;
                item.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragend', () => {
                if (dragItem) dragItem.style.opacity = '1';
                dragItem = null;
                list.querySelectorAll('.pdf-page-item').forEach(el => el.classList.remove('dragover'));
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                item.classList.add('dragover');
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('dragover');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('dragover');
                if (dragItem && dragItem !== item) {
                    const fromIndex = parseInt(dragItem.dataset.index);
                    const toIndex = parseInt(item.dataset.index);
                    const movedPage = this._pdfPages.splice(fromIndex, 1)[0];
                    this._pdfPages.splice(toIndex, 0, movedPage);
                    const container = document.getElementById('pdfPagesArea');
                    if (container) this._renderPdfPages(container, this._pdfPages.length);
                }
            });
        });
    },

    async process() {
        if (this.files.length === 0) {
            if (window.App) App.showToast('Please add files first', 'warning');
            return;
        }

        Converter.showLoading('Processing PDF...');

        try {
            switch (this.currentTool) {
                case 'images-to-pdf':
                    await this.imagesToPdf();
                    break;
                case 'merge-pdfs':
                    await this.mergePdfs();
                    break;
                case 'split-pdf':
                    await this.splitPdf();
                    break;
                case 'rotate-pdf':
                    await this.rotatePdf();
                    break;
                case 'preview-pdf':
                    await this.previewPdf();
                    break;
            }
        } catch (err) {
            console.error('PDF processing error:', err);
            if (window.App) App.showToast('Processing failed: ' + err.message, 'error');
        }

        Converter.hideLoading();
        if (window.App && App.updateDashboard) App.updateDashboard();
    },

    async imagesToPdf() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        for (let i = 0; i < this.files.length; i++) {
            const item = this.files[i];
            const dataUrl = await Converter.readAsDataURL(item.file);
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Failed to load image: ' + item.originalName));
                img.src = dataUrl;
            });

            if (i > 0) doc.addPage();

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 10;
            const maxWidth = pageWidth - margin * 2;
            const maxHeight = pageHeight - margin * 2;

            let w = img.width;
            let h = img.height;
            const ratio = Math.min(maxWidth / w, maxHeight / h);
            w *= ratio;
            h *= ratio;

            const x = (pageWidth - w) / 2;
            const y = (pageHeight - h) / 2;

            doc.addImage(dataUrl, 'JPEG', x, y, w, h);
        }

        const filename = this.files.length === 1
            ? this.files[0].originalName.replace(/\.[^.]+$/, '') + '.pdf'
            : 'merged_images.pdf';

        doc.save(filename);

        HistoryManager.addRecord({
            fileName: filename,
            originalFormat: 'images',
            convertedFormat: 'pdf',
            size: 0,
            status: 'success',
            category: 'pdf'
        });

        this._showResult(filename);
        if (window.App) App.showToast('PDF created successfully from ' + this.files.length + ' image(s)!', 'success');
    },

    async mergePdfs() {
        if (this.files.length < 2) {
            if (window.App) App.showToast('Please add at least 2 PDF files to merge', 'warning');
            return;
        }

        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();

        for (const item of this.files) {
            const pdfBytes = await Converter.readAsArrayBuffer(item.file);
            const pdf = await PDFDocument.load(pdfBytes);
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }

        const mergedBytes = await mergedPdf.save();
        const blob = new Blob([mergedBytes], { type: 'application/pdf' });
        Converter.downloadBlob(blob, 'merged.pdf');

        HistoryManager.addRecord({
            fileName: 'merged.pdf',
            originalFormat: 'pdf',
            convertedFormat: 'pdf',
            size: blob.size,
            status: 'success',
            category: 'pdf'
        });

        this._showResult('merged.pdf', blob.size);
        if (window.App) App.showToast(this.files.length + ' PDF files merged successfully!', 'success');
    },

    async splitPdf() {
        const { PDFDocument } = PDFLib;
        const file = this.files[0].file;
        const pdfBytes = await Converter.readAsArrayBuffer(file);
        const pdf = await PDFDocument.load(pdfBytes);

        const startPage = parseInt(document.getElementById('pdfSplitStart')?.value || '1');
        const endPage = parseInt(document.getElementById('pdfSplitEnd')?.value || pdf.getPageCount());

        const start = Math.max(1, Math.min(startPage, pdf.getPageCount()));
        const end = Math.max(start, Math.min(endPage, pdf.getPageCount()));

        const newPdf = await PDFDocument.create();
        const indices = [];
        for (let i = start - 1; i < end; i++) {
            indices.push(i);
        }
        const pages = await newPdf.copyPages(pdf, indices);
        pages.forEach(page => newPdf.addPage(page));

        const newPdfBytes = await newPdf.save();
        const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const filename = `${baseName}_pages_${start}-${end}.pdf`;
        Converter.downloadBlob(blob, filename);

        HistoryManager.addRecord({
            fileName: file.name,
            originalFormat: 'pdf',
            convertedFormat: 'pdf',
            size: blob.size,
            status: 'success',
            category: 'pdf'
        });

        this._showResult(filename, blob.size);
        if (window.App) App.showToast(`Extracted pages ${start}-${end} successfully!`, 'success');
    },

    async rotatePdf() {
        const { PDFDocument } = PDFLib;
        const file = this.files[0].file;
        const pdfBytes = await Converter.readAsArrayBuffer(file);
        const pdf = await PDFDocument.load(pdfBytes);

        const degrees = parseInt(document.getElementById('pdfRotation')?.value || '90');
        const pages = pdf.getPages();
        pages.forEach(page => {
            page.setRotation(page.getRotation().angle + degrees);
        });

        const modifiedBytes = await pdf.save();
        const blob = new Blob([modifiedBytes], { type: 'application/pdf' });
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const filename = `${baseName}_rotated_${degrees}deg.pdf`;
        Converter.downloadBlob(blob, filename);

        HistoryManager.addRecord({
            fileName: file.name,
            originalFormat: 'pdf',
            convertedFormat: 'pdf',
            size: blob.size,
            status: 'success',
            category: 'pdf'
        });

        this._showResult(filename, blob.size);
        if (window.App) App.showToast(`PDF rotated by ${degrees} degrees successfully!`, 'success');
    },

    async previewPdf() {
        const file = this.files[0].file;
        const url = URL.createObjectURL(file);

        const frame = document.getElementById('pdfPreviewFrame');
        if (frame) {
            frame.src = url;
            frame.classList.remove('hidden');
            frame.style.width = '100%';
            frame.style.height = '600px';
            frame.style.borderRadius = '12px';
            frame.style.marginTop = '16px';
            frame.style.border = '1px solid var(--border)';
        }

        if (window.App) App.showToast('PDF loaded for preview', 'info');
    },

    previewPdfInline() {
        if (this.files.length === 0) return;
        const file = this.files[0].file;
        const url = URL.createObjectURL(file);

        const frame = document.getElementById('pdfPreviewFrame');
        if (frame) {
            frame.src = url;
            frame.classList.remove('hidden');
            frame.style.width = '100%';
            frame.style.height = '600px';
            frame.style.borderRadius = '12px';
            frame.style.marginTop = '16px';
            frame.style.border = '1px solid var(--border)';
        }
    },

    _showResult(name, size) {
        const resultsArea = document.getElementById('pdfResults');
        if (!resultsArea) return;

        resultsArea.innerHTML = `
            <h3>Processing Complete</h3>
            <div class="result-card">
                <div class="result-info" style="width:100%;">
                    <p><i class="fas fa-file-pdf" style="color:var(--error);font-size:1.5rem;margin-right:8px;"></i> <strong>${name}</strong></p>
                    ${size ? `<p style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">Size: ${StorageManager.formatSize(size)}</p>` : ''}
                    <p style="font-size:0.8rem;color:var(--success);margin-top:8px;"><i class="fas fa-check-circle"></i> Download started automatically</p>
                </div>
            </div>
        `;
    }
};
