/**
 * PDFTools - PDF creation, manipulation, and processing
 * Uses jsPDF for creation and pdf-lib for manipulation
 */
const PDFTools = {
    currentTool: null,
    files: [],

    /**
     * Initialize PDF tools - bind tool card clicks
     */
    init() {
        // Bind tool card clicks
        document.querySelectorAll('.pdf-tool-card').forEach(card => {
            card.addEventListener('click', () => {
                const tool = card.dataset.tool;
                this.selectTool(tool);
            });
        });

        // Bind upload zone
        const uploadZone = document.getElementById('pdfUploadZone');
        const fileInput = document.getElementById('pdfFileInput');

        Converter.setupDragDrop(uploadZone, (files) => this.addFiles(files));
        Converter.setupFileInput(fileInput, (files) => this.addFiles(files));

        // Bind process button
        const processBtn = document.getElementById('pdfProcessBtn');
        if (processBtn) processBtn.addEventListener('click', () => this.process());

        // Bind back button
        const backBtn = document.getElementById('pdfBackBtn');
        if (backBtn) backBtn.addEventListener('click', () => this.backToTools());
    },

    /**
     * Select a PDF tool
     * @param {string} tool - Tool identifier
     */
    selectTool(tool) {
        this.currentTool = tool;
        this.files = [];

        const toolArea = document.getElementById('pdfToolArea');
        const toolTitle = document.getElementById('pdfToolTitle');
        const settings = document.getElementById('pdfSettings');
        const splitSettings = document.getElementById('pdfSplitSettings');
        const rotationSettings = document.getElementById('pdfRotationSettings');
        const fileInput = document.getElementById('pdfFileInput');

        // Hide tool cards, show tool area
        document.querySelector('.tool-cards-grid').style.display = 'none';
        if (toolArea) toolArea.classList.remove('hidden');

        // Set title and configure settings
        const titles = {
            'images-to-pdf': 'Convert Images to PDF',
            'merge-pdfs': 'Merge PDF Files',
            'split-pdf': 'Split PDF Pages',
            'rotate-pdf': 'Rotate PDF Pages',
            'preview-pdf': 'Preview PDF'
        };

        if (toolTitle) toolTitle.textContent = titles[tool] || 'PDF Tool';

        // Configure file input accept
        if (fileInput) {
            if (tool === 'images-to-pdf') {
                fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
                fileInput.multiple = true;
            } else {
                fileInput.accept = '.pdf';
                fileInput.multiple = tool === 'merge-pdfs';
            }
        }

        // Show/hide relevant settings
        if (splitSettings) splitSettings.style.display = tool === 'split-pdf' ? 'flex' : 'none';
        if (rotationSettings) rotationSettings.style.display = tool === 'rotate-pdf' ? 'flex' : 'none';
    },

    /**
     * Go back to tool cards grid
     */
    backToTools() {
        this.currentTool = null;
        this.files = [];

        const toolArea = document.getElementById('pdfToolArea');
        const grid = document.querySelector('.tool-cards-grid');
        const previewArea = document.getElementById('pdfUploadZone');

        if (toolArea) toolArea.classList.add('hidden');
        if (grid) grid.style.display = '';

        // Clear file preview
        const previewFiles = document.getElementById('pdfFilePreview');
        if (previewFiles) previewFiles.innerHTML = '';
        const results = document.getElementById('pdfResults');
        if (results) results.innerHTML = '';
    },

    /**
     * Add files
     * @param {File[]} files
     */
    addFiles(files) {
        const previewArea = document.getElementById('pdfFilePreview');
        if (!previewArea) return;

        // For merge, allow multiple; otherwise single
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
                if (window.App) App.showToast(`Unsupported file type: .${ext}`, 'error');
                return;
            }

            const id = Converter.generateId();
            this.files.push({ id, file, originalName: file.name });
            previewArea.insertAdjacentHTML('beforeend', Converter.createFileCardHTML(file, id));

            // Thumbnail for images
            if (ext !== 'pdf' && file.type.startsWith('image/')) {
                Converter.generateImageThumbnail(file, `thumb-${id}`);
            }
        });
    },

    /**
     * Process the current tool with loaded files
     */
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

    /**
     * Convert images to PDF using jsPDF
     */
    async imagesToPdf() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        for (let i = 0; i < this.files.length; i++) {
            const item = this.files[i];
            const dataUrl = await Converter.readAsDataURL(item.file);
            const img = new Image();
            await new Promise((resolve) => {
                img.onload = resolve;
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

        if (window.App) App.showToast('PDF created successfully!', 'success');
    },

    /**
     * Merge multiple PDFs using pdf-lib
     */
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

        if (window.App) App.showToast('PDFs merged successfully!', 'success');
    },

    /**
     * Split a PDF into pages or extract range
     */
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
        Converter.downloadBlob(blob, `${baseName}_pages_${start}-${end}.pdf`);

        HistoryManager.addRecord({
            fileName: file.name,
            originalFormat: 'pdf',
            convertedFormat: 'pdf',
            size: blob.size,
            status: 'success',
            category: 'pdf'
        });

        if (window.App) App.showToast(`Extracted pages ${start}-${end}`, 'success');
    },

    /**
     * Rotate all pages in a PDF
     */
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
        Converter.downloadBlob(blob, `${baseName}_rotated.pdf`);

        HistoryManager.addRecord({
            fileName: file.name,
            originalFormat: 'pdf',
            convertedFormat: 'pdf',
            size: blob.size,
            status: 'success',
            category: 'pdf'
        });

        if (window.App) App.showToast('PDF rotated successfully!', 'success');
    },

    /**
     * Preview a PDF file in an iframe
     */
    async previewPdf() {
        const file = this.files[0].file;
        const url = URL.createObjectURL(file);

        const frame = document.getElementById('pdfPreviewFrame');
        if (frame) {
            frame.src = url;
            frame.classList.remove('hidden');
            frame.style.width = '100%';
            frame.style.height = '500px';
            frame.style.borderRadius = '12px';
            frame.style.marginTop = '16px';
        }

        if (window.App) App.showToast('PDF loaded for preview', 'info');
    }
};
