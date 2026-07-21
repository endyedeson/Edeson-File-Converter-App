/**
 * PDFEditor - Full browser-based PDF editor
 * Uses PDF.js for rendering, Canvas for editing, pdf-lib for saving
 * All processing happens locally in the browser
 */
const PDFEditor = {
    pdfDoc: null,
    pdfBytes: null,
    currentPage: 0,
    totalPages: 0,
    zoom: 1.5,
    tool: 'select',
    annotations: {},
    undoStack: {},
    redoStack: {},
    selectedElement: null,
    isDrawing: false,
    drawPoints: [],
    dragState: null,
    autosaveTimer: null,

    defaultFont: 'Helvetica',
    defaultProps: {
        fontSize: 16,
        fontColor: '#000000',
        bold: false,
        italic: false,
        underline: false,
        textAlign: 'left',
        fillColor: 'rgba(255,255,255,0)',
        borderColor: '#000000',
        borderWidth: 2,
        shapeType: 'rectangle',
        brushSize: 3,
        brushColor: '#000000',
        eraserSize: 20,
        watermarkType: 'text',
        watermarkOpacity: 0.3,
        watermarkRotation: -45,
        watermarkFontSize: 48,
        watermarkColor: '#000000',
        watermarkText: 'WATERMARK',
        _watermarkImage: null,
        _watermarkDataUrl: null
    },

    init() {
        this._lastPointerPos = { x: 0, y: 0 };
        this._bindUpload();
        this._bindToolbar();
        this._bindCanvasEvents();
        this._bindPageNav();
        this._bindPageActions();
        this._bindSave();
        this._bindKeyboard();
        this._bindContainerScroll();
    },

    // ==================== UPLOAD ====================

    _bindUpload() {
        const zone = document.getElementById('editorUploadZone');
        const input = document.getElementById('editorFileInput');

        if (zone) {
            Converter.setupDragDrop(zone, (files) => {
                if (files.length > 0) this.loadPdf(files[0]);
            });
        }
        if (input) {
            Converter.setupFileInput(input, (files) => {
                if (files.length > 0) this.loadPdf(files[0]);
            });
        }
    },

    async loadPdf(file) {
        try {
            Converter.showLoading('Loading PDF...');
            this.pdfBytes = await Converter.readAsArrayBuffer(file);
            const pdfjsLib = window.pdfjsLib;
            if (pdfjsLib) {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                this.pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(this.pdfBytes) }).promise;
            }

            this.totalPages = this.pdfDoc ? this.pdfDoc.numPages : 0;
            this.currentPage = 0;
            this.annotations = {};
            this.undoStack = {};
            this.redoStack = {};
            this.selectedElement = null;
            this.pdfFileName = file.name;

            for (let i = 0; i < this.totalPages; i++) {
                this.annotations[i] = { texts: [], shapes: [], drawings: [], images: [], watermarks: [] };
                this.undoStack[i] = [];
                this.redoStack[i] = [];
            }

            document.getElementById('editorUploadArea').style.display = 'none';
            document.getElementById('editorWorkspace').style.display = '';

            await this._renderThumbnails();
            await this._renderCurrentPage();
            this._updatePageInfo();
            this._loadAutosave();
        } catch (err) {
            console.error('PDF load error:', err);
            if (window.App) App.showToast('Failed to load PDF: ' + err.message, 'error');
        }
        Converter.hideLoading();
    },

    // ==================== RENDERING ====================

    async _renderCurrentPage() {
        if (!this.pdfDoc || this.currentPage >= this.totalPages) return;

        const page = await this.pdfDoc.getPage(this.currentPage + 1);
        const viewport = page.getViewport({ scale: this.zoom });

        const canvas = document.getElementById('editorCanvas');
        const overlay = document.getElementById('editorOverlayCanvas');
        const container = document.getElementById('editorCanvasContainer');
        const textOverlay = document.getElementById('editorTextOverlay');

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        overlay.width = viewport.width;
        overlay.height = viewport.height;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        const scrollLeft = container ? container.scrollLeft || 0 : 0;
        const scrollTop = container ? container.scrollTop || 0 : 0;
        overlay.style.position = 'absolute';
        overlay.style.left = scrollLeft + 'px';
        overlay.style.top = scrollTop + 'px';
        overlay.style.width = viewport.width + 'px';
        overlay.style.height = viewport.height + 'px';
        if (textOverlay) {
            textOverlay.style.width = viewport.width + 'px';
            textOverlay.style.height = viewport.height + 'px';
            textOverlay.style.left = scrollLeft + 'px';
            textOverlay.style.top = scrollTop + 'px';
        }

        this._renderAnnotations();
        this._highlightThumbnail();
    },

    async _renderThumbnails() {
        const list = document.getElementById('editorPagesList');
        if (!list) return;
        list.innerHTML = '';

        for (let i = 0; i < this.totalPages; i++) {
            const page = await this.pdfDoc.getPage(i + 1);
            const viewport = page.getViewport({ scale: 0.2 });
            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'editor-page-thumb' + (i === this.currentPage ? ' active' : '');
            thumbDiv.dataset.page = i;

            const c = document.createElement('canvas');
            c.width = viewport.width;
            c.height = viewport.height;
            const ctx = c.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;

            const label = document.createElement('div');
            label.className = 'editor-page-thumb-label';
            label.textContent = (i + 1);

            thumbDiv.appendChild(c);
            thumbDiv.appendChild(label);
            thumbDiv.addEventListener('click', () => this.goToPage(i));
            list.appendChild(thumbDiv);
        }
    },

    _highlightThumbnail() {
        document.querySelectorAll('.editor-page-thumb').forEach((el, i) => {
            el.classList.toggle('active', i === this.currentPage);
        });
    },

    _renderAnnotations() {
        const overlay = document.getElementById('editorOverlayCanvas');
        if (!overlay) return;
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        const ann = this.annotations[this.currentPage];
        if (!ann) return;

        ann.shapes.forEach(s => this._drawShape(ctx, s));
        ann.drawings.forEach(d => this._drawFreehand(ctx, d));
        ann.images.forEach(img => this._drawImageAnnotation(ctx, img));
        ann.watermarks.forEach(w => this._drawWatermark(ctx, w));
        ann.texts.forEach(t => this._drawTextOnCanvas(ctx, t));
    },

    _drawShape(ctx, s) {
        ctx.save();
        ctx.strokeStyle = s.borderColor || '#000';
        ctx.lineWidth = s.borderWidth || 2;
        ctx.fillStyle = s.fillColor || 'rgba(255,255,255,0)';

        if (s.shapeType === 'rectangle') {
            ctx.beginPath();
            ctx.rect(s.x, s.y, s.w, s.h);
            if (s.fillColor && s.fillColor !== 'rgba(255,255,255,0)') ctx.fill();
            ctx.stroke();
        } else if (s.shapeType === 'circle') {
            ctx.beginPath();
            ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, Math.PI * 2);
            if (s.fillColor && s.fillColor !== 'rgba(255,255,255,0)') ctx.fill();
            ctx.stroke();
        } else if (s.shapeType === 'line') {
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x + s.w, s.y + s.h);
            ctx.stroke();
        } else if (s.shapeType === 'arrow') {
            const endX = s.x + s.w;
            const endY = s.y + s.h;
            const angle = Math.atan2(s.h, s.w);
            const headLen = 15;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(endX, endY);
            ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
        }
        ctx.restore();
    },

    _drawFreehand(ctx, d) {
        if (!d.points || d.points.length < 2) return;
        ctx.save();
        ctx.strokeStyle = d.eraser ? '#ffffff' : (d.color || '#000');
        ctx.lineWidth = d.eraser ? (d.size || 20) : (d.size || 3);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = d.eraser ? 'destination-out' : 'source-over';
        ctx.beginPath();
        ctx.moveTo(d.points[0].x, d.points[0].y);
        for (let i = 1; i < d.points.length; i++) {
            ctx.lineTo(d.points[i].x, d.points[i].y);
        }
        ctx.stroke();
        ctx.restore();
    },

    _drawImageAnnotation(ctx, img) {
        if (!img._htmlImg) return;
        ctx.save();
        ctx.translate(img.x + img.w / 2, img.y + img.h / 2);
        ctx.rotate((img.rotation || 0) * Math.PI / 180);
        ctx.drawImage(img._htmlImg, -img.w / 2, -img.h / 2, img.w, img.h);
        if (img === this.selectedElement) {
            ctx.strokeStyle = '#2196f3';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(-img.w / 2, -img.h / 2, img.w, img.h);
        }
        ctx.restore();
    },

    _drawTextOnCanvas(ctx, t) {
        ctx.save();
        let fontStr = '';
        if (t.italic) fontStr += 'italic ';
        if (t.bold) fontStr += 'bold ';
        fontStr += (t.fontSize || 16) + 'px ';
        fontStr += (t.font || 'Helvetica');
        ctx.font = fontStr;
        ctx.fillStyle = t.color || '#000';
        ctx.textAlign = t.align || 'left';
        ctx.textBaseline = 'top';

        const lines = (t.content || 'Text').split('\n');
        const lineHeight = (t.fontSize || 16) * 1.3;
        lines.forEach((line, i) => {
            ctx.fillText(line, t.x, t.y + i * lineHeight);
            if (t.underline) {
                const metrics = ctx.measureText(line);
                const underlineY = t.y + i * lineHeight + (t.fontSize || 16) + 2;
                ctx.beginPath();
                ctx.moveTo(t.x, underlineY);
                ctx.lineTo(t.x + metrics.width, underlineY);
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        });

        if (t === this.selectedElement) {
            const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
            const totalHeight = lines.length * lineHeight;
            ctx.strokeStyle = '#2196f3';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(t.x - 4, t.y - 4, maxWidth + 8, totalHeight + 8);
        }
        ctx.restore();
    },

    _drawWatermark(ctx, w) {
        ctx.save();
        ctx.globalAlpha = w.opacity || 0.3;
        ctx.translate(w.x, w.y);
        ctx.rotate((w.rotation || -45) * Math.PI / 180);

        if (w.type === 'text') {
            ctx.font = `${w.fontSize || 48}px ${w.font || this.defaultFont}`;
            ctx.fillStyle = w.color || '#000000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(w.content || 'WATERMARK', 0, 0);
        } else if (w.type === 'image' && w._htmlImg) {
            const wmSize = w.size || 200;
            ctx.drawImage(w._htmlImg, -wmSize / 2, -wmSize / 2, wmSize, wmSize);
        }
        ctx.restore();
    },

    // ==================== TOOLBAR ====================

    _bindToolbar() {
        document.querySelectorAll('[data-editor-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.tool = btn.dataset.editorTool;
                document.querySelectorAll('[data-editor-tool]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._updatePropertiesPanel();
                this._updateCursor();
            });
        });

        document.getElementById('editorUndo')?.addEventListener('click', () => this.undo());
        document.getElementById('editorRedo')?.addEventListener('click', () => this.redo());
        document.getElementById('editorZoomIn')?.addEventListener('click', () => this.setZoom(this.zoom + 0.25));
        document.getElementById('editorZoomOut')?.addEventListener('click', () => this.setZoom(this.zoom - 0.25));
        document.getElementById('editorZoomFit')?.addEventListener('click', () => this._zoomFit());
        document.getElementById('editorFullscreen')?.addEventListener('click', () => this._toggleFullscreen());
        document.getElementById('editorCloseBtn')?.addEventListener('click', () => this.closeEditor());
        document.getElementById('editorSidebarToggle')?.addEventListener('click', () => {
            document.getElementById('editorSidebar')?.classList.toggle('collapsed');
        });

        const imgInput = document.getElementById('editorImageInput');
        if (imgInput) {
            Converter.setupFileInput(imgInput, (files) => {
                if (files.length > 0) this._insertImage(files[0]);
            });
        }

        const sigImgInput = document.getElementById('editorSigImageInput');
        if (sigImgInput) {
            Converter.setupFileInput(sigImgInput, (files) => {
                if (files.length > 0) this._uploadSignature(files[0]);
            });
        }
    },

    _updateCursor() {
        const container = document.getElementById('editorCanvasContainer');
        if (!container) return;
        const cursors = {
            select: 'default', text: 'text', shape: 'crosshair',
            draw: 'crosshair', eraser: 'crosshair', image: 'crosshair',
            signature: 'crosshair', watermark: 'crosshair'
        };
        container.style.cursor = cursors[this.tool] || 'default';
    },

    // ==================== CANVAS EVENTS ====================

    _bindCanvasEvents() {
        const overlay = document.getElementById('editorOverlayCanvas');
        if (!overlay) return;

        overlay.addEventListener('mousedown', (e) => this._onPointerDown(e));
        overlay.addEventListener('mousemove', (e) => this._onPointerMove(e));
        overlay.addEventListener('mouseup', (e) => this._onPointerUp(e));
        overlay.addEventListener('mouseleave', (e) => this._onPointerUp(e));

        overlay.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            this._onPointerDown({ clientX: t.clientX, clientY: t.clientY, target: overlay });
        }, { passive: false });
        overlay.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            this._onPointerMove({ clientX: t.clientX, clientY: t.clientY });
        }, { passive: false });
        overlay.addEventListener('touchend', (e) => {
            this._onPointerUp({});
        });

        overlay.addEventListener('dblclick', (e) => {
            const pos = this._getCanvasCoords(e);
            if (this.tool === 'select') {
                const ann = this.annotations[this.currentPage];
                if (ann) {
                    for (let i = ann.texts.length - 1; i >= 0; i--) {
                        const t = ann.texts[i];
                        const lines = (t.content || '').split('\n');
                        const lineHeight = (t.fontSize || 16) * 1.3;
                        const maxLineW = Math.max(...lines.map(l => this._measureTextWidth(l, t)));
                        const w = maxLineW + 8;
                        if (pos.x >= t.x - 4 && pos.x <= t.x + w + 4 && pos.y >= t.y - 4 && pos.y <= t.y + lines.length * lineHeight + 4) {
                            this._startTextEdit(t);
                            return;
                        }
                    }
                }
            }
        });
    },

    _getCanvasCoords(e) {
        const overlay = document.getElementById('editorOverlayCanvas');
        const rect = overlay.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    },

    _onPointerDown(e) {
        const pos = this._getCanvasCoords(e);
        this._lastPointerPos = pos;
        this.isDrawing = true;

        if (this.tool === 'select') {
            this._handleSelectDown(pos);
        } else if (this.tool === 'text') {
            this._handleTextDown(pos);
        } else if (this.tool === 'shape') {
            this.dragState = { startX: pos.x, startY: pos.y };
        } else if (this.tool === 'draw' || this.tool === 'eraser') {
            this.drawPoints = [pos];
        } else if (this.tool === 'image') {
            document.getElementById('editorImageInput')?.click();
            this.isDrawing = false;
        } else if (this.tool === 'signature') {
            this._showSignatureDialog();
            this.isDrawing = false;
        } else if (this.tool === 'watermark') {
            this._handleWatermarkDown(pos);
        }
    },

    _onPointerMove(e) {
        if (!this.isDrawing) return;
        const pos = this._getCanvasCoords(e);
        this._lastPointerPos = pos;

        if (this.tool === 'select' && this.dragState) {
            this._handleSelectMove(pos);
        } else if (this.tool === 'shape' && this.dragState) {
            this._renderShapePreview(pos);
        } else if (this.tool === 'draw' || this.tool === 'eraser') {
            this.drawPoints.push(pos);
            this._renderDrawPreview();
        }
    },

    _onPointerUp(e) {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.tool === 'select' && this.dragState) {
            this.dragState = null;
        } else if (this.tool === 'shape' && this.dragState) {
            const pos = (e && e.clientX !== undefined) ? this._getCanvasCoords(e) : this._lastPointerPos;
            if (pos) this._finalizeShape(pos);
        } else if (this.tool === 'draw' || this.tool === 'eraser') {
            this._finalizeDrawing();
        }
    },

    // ==================== SELECT TOOL ====================

    _handleSelectDown(pos) {
        const ann = this.annotations[this.currentPage];
        if (!ann) return;

        this.selectedElement = null;

        for (let i = ann.texts.length - 1; i >= 0; i--) {
            const t = ann.texts[i];
            const lines = (t.content || '').split('\n');
            const lineHeight = (t.fontSize || 16) * 1.3;
            const maxLineW = Math.max(...lines.map(l => {
                const c = document.createElement('canvas');
                const cx = c.getContext('2d');
                let f = '';
                if (t.italic) f += 'italic ';
                if (t.bold) f += 'bold ';
                f += (t.fontSize || 16) + 'px ' + (t.font || 'Helvetica');
                cx.font = f;
                return cx.measureText(l).width;
            }));
            const w = maxLineW + 8;
            const h = lines.length * lineHeight;
            if (pos.x >= t.x - 4 && pos.x <= t.x + w + 4 && pos.y >= t.y - 4 && pos.y <= t.y + h + 4) {
                this.selectedElement = t;
                this.dragState = { type: 'text', offsetX: pos.x - t.x, offsetY: pos.y - t.y };
                this._renderAnnotations();
                return;
            }
        }

        for (let i = ann.images.length - 1; i >= 0; i--) {
            const img = ann.images[i];
            if (pos.x >= img.x && pos.x <= img.x + img.w && pos.y >= img.y && pos.y <= img.y + img.h) {
                this.selectedElement = img;
                this.dragState = { type: 'image', offsetX: pos.x - img.x, offsetY: pos.y - img.y };
                this._renderAnnotations();
                return;
            }
        }

        for (let i = ann.shapes.length - 1; i >= 0; i--) {
            const s = ann.shapes[i];
            const minX = Math.min(s.x, s.x + s.w);
            const maxX = Math.max(s.x, s.x + s.w);
            const minY = Math.min(s.y, s.y + s.h);
            const maxY = Math.max(s.y, s.y + s.h);
            if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
                this.selectedElement = s;
                this.dragState = { type: 'shape', offsetX: pos.x - s.x, offsetY: pos.y - s.y };
                this._renderAnnotations();
                return;
            }
        }

        this._renderAnnotations();
    },

    _handleSelectMove(pos) {
        if (!this.selectedElement || !this.dragState) return;
        const el = this.selectedElement;

        if (this.dragState.type === 'text') {
            el.x = pos.x - this.dragState.offsetX;
            el.y = pos.y - this.dragState.offsetY;
        } else if (this.dragState.type === 'image') {
            el.x = pos.x - this.dragState.offsetX;
            el.y = pos.y - this.dragState.offsetY;
        } else if (this.dragState.type === 'shape') {
            el.x = pos.x - this.dragState.offsetX;
            el.y = pos.y - this.dragState.offsetY;
        }
        this._renderAnnotations();
    },

    // ==================== TEXT TOOL ====================

    _handleTextDown(pos) {
        this._saveUndo();
        const text = {
            x: pos.x, y: pos.y,
            content: 'Double-click to edit',
            font: this.defaultProps.font,
            fontSize: this.defaultProps.fontSize,
            color: this.defaultProps.fontColor,
            bold: this.defaultProps.bold,
            italic: this.defaultProps.italic,
            underline: this.defaultProps.underline,
            align: this.defaultProps.textAlign
        };
        this.annotations[this.currentPage].texts.push(text);
        this.selectedElement = text;
        this._renderAnnotations();
        this._startTextEdit(text);
    },

    _startTextEdit(textEl) {
        const container = document.getElementById('editorTextOverlay');
        if (!container) return;

        const existing = container.querySelector('.editor-text-box');
        if (existing) existing.remove();

        const box = document.createElement('div');
        box.className = 'editor-text-box';
        box.contentEditable = true;
        box.textContent = textEl.content;
        box.style.left = textEl.x + 'px';
        box.style.top = textEl.y + 'px';
        box.style.fontSize = textEl.fontSize + 'px';
        box.style.fontFamily = (textEl.font || this.defaultFont) + ', sans-serif';
        box.style.color = textEl.color || '#000';
        box.style.fontWeight = textEl.bold ? 'bold' : 'normal';
        box.style.fontStyle = textEl.italic ? 'italic' : 'normal';
        box.style.textDecoration = textEl.underline ? 'underline' : 'none';
        box.style.textAlign = textEl.align || 'left';
        box.style.minWidth = '60px';
        box.style.minHeight = '24px';
        box.style.zIndex = '10';

        const commitEdit = () => {
            textEl.content = box.textContent || 'Text';
            if (box.parentNode) box.remove();
            this._renderAnnotations();
            this._autosave();
        };

        box.addEventListener('blur', commitEdit);
        box.addEventListener('input', () => {
            textEl.content = box.textContent || '';
        });
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                box.blur();
            }
        });

        container.appendChild(box);
        box.focus();

        const range = document.createRange();
        range.selectNodeContents(box);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    },

    // ==================== SHAPES ====================

    _renderShapePreview(pos) {
        const overlay = document.getElementById('editorOverlayCanvas');
        if (!overlay) return;
        const ctx = overlay.getContext('2d');
        this._renderAnnotations();

        ctx.save();
        ctx.strokeStyle = this.defaultProps.borderColor;
        ctx.lineWidth = this.defaultProps.borderWidth;
        ctx.setLineDash([5, 5]);

        const s = {
            x: this.dragState.startX, y: this.dragState.startY,
            w: pos.x - this.dragState.startX, h: pos.y - this.dragState.startY,
            shapeType: this.defaultProps.shapeType, fillColor: this.defaultProps.fillColor,
            borderColor: this.defaultProps.borderColor, borderWidth: this.defaultProps.borderWidth
        };
        this._drawShape(ctx, s);
        ctx.restore();
    },

    _finalizeShape(pos) {
        const w = pos.x - this.dragState.startX;
        const h = pos.y - this.dragState.startY;
        if (Math.abs(w) < 5 && Math.abs(h) < 5) {
            this.dragState = null;
            this._renderAnnotations();
            return;
        }
        if (w === undefined || h === undefined || isNaN(w) || isNaN(h)) {
            this.dragState = null;
            return;
        }

        this._saveUndo();
        this.annotations[this.currentPage].shapes.push({
            x: this.dragState.startX, y: this.dragState.startY,
            w, h,
            shapeType: this.defaultProps.shapeType,
            fillColor: this.defaultProps.fillColor,
            borderColor: this.defaultProps.borderColor,
            borderWidth: this.defaultProps.borderWidth
        });
        this.dragState = null;
        this._renderAnnotations();
        this._autosave();
    },

    // ==================== DRAWING ====================

    _renderDrawPreview() {
        const overlay = document.getElementById('editorOverlayCanvas');
        if (!overlay) return;
        const ctx = overlay.getContext('2d');
        this._renderAnnotations();

        ctx.save();
        ctx.strokeStyle = this.tool === 'eraser' ? '#ffffff' : this.defaultProps.brushColor;
        ctx.lineWidth = this.tool === 'eraser' ? this.defaultProps.eraserSize : this.defaultProps.brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = this.tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.beginPath();
        if (this.drawPoints.length > 0) {
            ctx.moveTo(this.drawPoints[0].x, this.drawPoints[0].y);
            for (let i = 1; i < this.drawPoints.length; i++) {
                ctx.lineTo(this.drawPoints[i].x, this.drawPoints[i].y);
            }
            ctx.stroke();
        }
        ctx.restore();
    },

    _finalizeDrawing() {
        if (this.drawPoints.length < 2) return;
        this._saveUndo();
        this.annotations[this.currentPage].drawings.push({
            points: [...this.drawPoints],
            color: this.defaultProps.brushColor,
            size: this.tool === 'eraser' ? this.defaultProps.eraserSize : this.defaultProps.brushSize,
            eraser: this.tool === 'eraser'
        });
        this.drawPoints = [];
        this._renderAnnotations();
        this._autosave();
    },

    // ==================== IMAGES ====================

    async _insertImage(file) {
        const dataUrl = await Converter.readAsDataURL(file);

        if (this.tool === 'watermark') {
            const img = new Image();
            img.onload = () => {
                this.defaultProps._watermarkImage = img;
                this.defaultProps._watermarkDataUrl = dataUrl;
                this.defaultProps.watermarkType = 'image';
                if (window.App) App.showToast('Watermark image ready. Click on the page to place it.', 'info');
            };
            img.src = dataUrl;
            return;
        }

        const img = new Image();
        img.onload = () => {
            this._saveUndo();
            const maxDim = 300;
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            if (w > maxDim || h > maxDim) {
                const scale = maxDim / Math.max(w, h);
                w *= scale;
                h *= scale;
            }
            const annImg = {
                x: 50, y: 50, w, h, rotation: 0,
                dataUrl: dataUrl,
                _htmlImg: img
            };
            this.annotations[this.currentPage].images.push(annImg);
            this.selectedElement = annImg;
            this._renderAnnotations();
            this._autosave();
        };
        img.src = dataUrl;
    },

    // ==================== SIGNATURES ====================

    _showSignatureDialog() {
        const panel = document.getElementById('editorPropsContent');
        if (!panel) return;

        panel.innerHTML = `
            <h4 style="font-size:0.85rem;margin-bottom:10px;">Create Signature</h4>
            <div class="editor-signature-pad-container">
                <canvas class="editor-signature-pad" id="sigPadCanvas" width="300" height="120"></canvas>
            </div>
            <div class="editor-prop-group">
                <label>Brush Color</label>
                <input type="color" id="sigPadColor" value="#000000">
            </div>
            <div class="editor-prop-group">
                <label>Brush Size</label>
                <input type="range" id="sigPadSize" min="1" max="10" value="2">
            </div>
            <div class="editor-signature-actions">
                <button class="btn btn-primary btn-sm" id="sigApplyBtn" style="flex:1;"><i class="fas fa-check"></i> Apply</button>
                <button class="btn btn-secondary btn-sm" id="sigClearBtn"><i class="fas fa-eraser"></i></button>
                <button class="btn btn-secondary btn-sm" id="sigUploadBtn"><i class="fas fa-upload"></i></button>
            </div>
        `;

        const padCanvas = document.getElementById('sigPadCanvas');
        const padCtx = padCanvas.getContext('2d');
        padCtx.fillStyle = '#fff';
        padCtx.fillRect(0, 0, padCanvas.width, padCanvas.height);

        let drawing = false;
        let lastX = 0, lastY = 0;

        const getPos = (e) => {
            const rect = padCanvas.getBoundingClientRect();
            const t = e.touches ? e.touches[0] : e;
            return { x: t.clientX - rect.left, y: t.clientY - rect.top };
        };

        const startDraw = (e) => {
            e.preventDefault();
            drawing = true;
            const p = getPos(e);
            lastX = p.x;
            lastY = p.y;
        };

        const doDraw = (e) => {
            if (!drawing) return;
            e.preventDefault();
            const p = getPos(e);
            padCtx.strokeStyle = document.getElementById('sigPadColor')?.value || '#000';
            padCtx.lineWidth = document.getElementById('sigPadSize')?.value || 2;
            padCtx.lineCap = 'round';
            padCtx.beginPath();
            padCtx.moveTo(lastX, lastY);
            padCtx.lineTo(p.x, p.y);
            padCtx.stroke();
            lastX = p.x;
            lastY = p.y;
        };

        const endDraw = () => { drawing = false; };

        padCanvas.addEventListener('mousedown', startDraw);
        padCanvas.addEventListener('mousemove', doDraw);
        padCanvas.addEventListener('mouseup', endDraw);
        padCanvas.addEventListener('mouseleave', endDraw);
        padCanvas.addEventListener('touchstart', startDraw, { passive: false });
        padCanvas.addEventListener('touchmove', doDraw, { passive: false });
        padCanvas.addEventListener('touchend', endDraw);

        document.getElementById('sigClearBtn')?.addEventListener('click', () => {
            padCtx.fillStyle = '#fff';
            padCtx.fillRect(0, 0, padCanvas.width, padCanvas.height);
        });

        document.getElementById('sigUploadBtn')?.addEventListener('click', () => {
            document.getElementById('editorSigImageInput')?.click();
        });

        document.getElementById('sigApplyBtn')?.addEventListener('click', () => {
            const dataUrl = padCanvas.toDataURL('image/png');
            this._placeSignature(dataUrl);
        });
    },

    _uploadSignature(file) {
        Converter.readAsDataURL(file).then(dataUrl => {
            this._placeSignature(dataUrl);
        });
    },

    _placeSignature(dataUrl) {
        const img = new Image();
        img.onload = () => {
            this._saveUndo();
            const w = 200;
            const h = (img.naturalHeight / img.naturalWidth) * w;
            const annImg = {
                x: 50, y: 50, w, h, rotation: 0,
                dataUrl: dataUrl,
                _htmlImg: img
            };
            this.annotations[this.currentPage].images.push(annImg);
            this.selectedElement = annImg;
            this._renderAnnotations();
            this._autosave();
            this.tool = 'select';
            document.querySelectorAll('[data-editor-tool]').forEach(b => b.classList.remove('active'));
            document.querySelector('[data-editor-tool="select"]')?.classList.add('active');
        };
        img.src = dataUrl;
    },

    // ==================== WATERMARK ====================

    _handleWatermarkDown(pos) {
        const wmType = this.defaultProps.watermarkType || 'text';
        if (wmType === 'image' && !this.defaultProps._watermarkImage) {
            if (window.App) App.showToast('Upload an image watermark first', 'warning');
            return;
        }
        this._saveUndo();
        const wm = {
            type: wmType,
            x: pos.x,
            y: pos.y,
            opacity: this.defaultProps.watermarkOpacity,
            rotation: this.defaultProps.watermarkRotation
        };
        if (wmType === 'text') {
            wm.content = this.defaultProps.watermarkText || 'WATERMARK';
            wm.fontSize = this.defaultProps.watermarkFontSize;
            wm.color = this.defaultProps.watermarkColor;
            wm.font = this.defaultFont;
        } else if (wmType === 'image') {
            wm._htmlImg = this.defaultProps._watermarkImage;
            wm.dataUrl = this.defaultProps._watermarkDataUrl;
            wm.size = 200;
        }
        this.annotations[this.currentPage].watermarks.push(wm);
        this._renderAnnotations();
        this._autosave();
    },

    // ==================== UNDO / REDO ====================

    _saveUndo() {
        const page = this.currentPage;
        if (!this.undoStack[page]) this.undoStack[page] = [];
        const snapshot = JSON.parse(JSON.stringify(this.annotations[page], (key, val) => {
            if (key === '_htmlImg') return undefined;
            return val;
        }));
        this.undoStack[page].push(snapshot);
        if (this.undoStack[page].length > 50) this.undoStack[page].shift();
        this.redoStack[page] = [];
    },

    undo() {
        const page = this.currentPage;
        if (!this.undoStack[page] || this.undoStack[page].length === 0) return;

        const current = JSON.parse(JSON.stringify(this.annotations[page], (key, val) => {
            if (key === '_htmlImg') return undefined;
            return val;
        }));
        this.redoStack[page].push(current);

        const prev = this.undoStack[page].pop();
        this.annotations[page] = prev;
        this._reloadImagesForPage(page).then(() => this._renderAnnotations());
        this._autosave();
    },

    redo() {
        const page = this.currentPage;
        if (!this.redoStack[page] || this.redoStack[page].length === 0) return;

        const current = JSON.parse(JSON.stringify(this.annotations[page], (key, val) => {
            if (key === '_htmlImg') return undefined;
            return val;
        }));
        this.undoStack[page].push(current);

        const next = this.redoStack[page].pop();
        this.annotations[page] = next;
        this._reloadImagesForPage(page).then(() => this._renderAnnotations());
        this._autosave();
    },

    async _reloadImagesForPage(page) {
        const ann = this.annotations[page];
        if (!ann) return;
        for (const img of ann.images) {
            if (img.dataUrl && !img._htmlImg) {
                img._htmlImg = await new Promise(resolve => {
                    const i = new Image();
                    i.onload = () => resolve(i);
                    i.src = img.dataUrl;
                });
            }
        }
    },

    // ==================== PAGE NAVIGATION ====================

    _bindPageNav() {
        document.getElementById('editorPrevPage')?.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        document.getElementById('editorNextPage')?.addEventListener('click', () => this.goToPage(this.currentPage + 1));

        document.getElementById('editorPageJump')?.addEventListener('change', (e) => {
            const page = parseInt(e.target.value) - 1;
            if (page >= 0 && page < this.totalPages) this.goToPage(page);
            else e.target.value = this.currentPage + 1;
        });
    },

    async goToPage(index) {
        if (index < 0 || index >= this.totalPages) return;
        this.currentPage = index;
        await this._renderCurrentPage();
        this._updatePageInfo();
        this._highlightThumbnail();
    },

    _updatePageInfo() {
        const info = document.getElementById('editorPageInfo');
        const jump = document.getElementById('editorPageJump');
        if (info) info.textContent = `${this.currentPage + 1} / ${this.totalPages}`;
        if (jump) { jump.value = this.currentPage + 1; jump.max = this.totalPages; }
    },

    _bindContainerScroll() {
        const container = document.getElementById('editorCanvasContainer');
        if (!container) return;
        container.addEventListener('scroll', () => {
            const scrollLeft = container.scrollLeft || 0;
            const scrollTop = container.scrollTop || 0;
            const overlay = document.getElementById('editorOverlayCanvas');
            const textOverlay = document.getElementById('editorTextOverlay');
            if (overlay) {
                overlay.style.left = scrollLeft + 'px';
                overlay.style.top = scrollTop + 'px';
            }
            if (textOverlay) {
                textOverlay.style.left = scrollLeft + 'px';
                textOverlay.style.top = scrollTop + 'px';
            }
        }, { passive: true });
    },

    // ==================== PAGE MANAGEMENT ====================

    _bindPageActions() {
        document.getElementById('editorAddBlankPage')?.addEventListener('click', () => this._addBlankPage());
        document.getElementById('editorDupPage')?.addEventListener('click', () => this._duplicatePage());
        document.getElementById('editorDeletePage')?.addEventListener('click', () => this._deletePage());
        document.getElementById('editorExtractPage')?.addEventListener('click', () => this._extractPage());
    },

    _addBlankPage() {
        this._saveUndo();
        this.totalPages++;
        const newIdx = this.totalPages - 1;
        this.annotations[newIdx] = { texts: [], shapes: [], drawings: [], images: [], watermarks: [] };
        this.undoStack[newIdx] = [];
        this.redoStack[newIdx] = [];
        this.goToPage(newIdx);
        this._renderThumbnails();
        if (window.App) App.showToast('Blank page added', 'info');
    },

    _duplicatePage() {
        this._saveUndo();
        const src = this.annotations[this.currentPage];
        const newIdx = this.totalPages;
        this.totalPages++;
        this.annotations[newIdx] = JSON.parse(JSON.stringify(src, (key, val) => {
            if (key === '_htmlImg') return undefined;
            return val;
        }));
        this.undoStack[newIdx] = [];
        this.redoStack[newIdx] = [];
        this._reloadImagesForPage(newIdx).then(() => {
            this._renderAnnotations();
            this._renderThumbnails();
        });
        if (window.App) App.showToast('Page duplicated', 'info');
    },

    _deletePage() {
        if (this.totalPages <= 1) {
            if (window.App) App.showToast('Cannot delete the only page', 'warning');
            return;
        }
        this._saveUndo();
        const idx = this.currentPage;
        for (let i = idx; i < this.totalPages - 1; i++) {
            this.annotations[i] = this.annotations[i + 1];
        }
        delete this.annotations[this.totalPages - 1];
        this.totalPages--;
        if (this.currentPage >= this.totalPages) this.currentPage = this.totalPages - 1;
        this.goToPage(this.currentPage);
        this._renderThumbnails();
        if (window.App) App.showToast('Page deleted', 'info');
    },

    async _extractPage() {
        try {
            const { PDFDocument } = PDFLib;
            const srcPdf = await PDFDocument.load(this.pdfBytes);
            const newPdf = await PDFDocument.create();
            const [page] = await newPdf.copyPages(srcPdf, [this.currentPage]);
            newPdf.addPage(page);
            const bytes = await newPdf.save();
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const baseName = (this.pdfFileName || 'document').replace(/\.[^.]+$/, '');
            Converter.downloadBlob(blob, `${baseName}_page_${this.currentPage + 1}.pdf`);
            if (window.App) App.showToast(`Page ${this.currentPage + 1} extracted`, 'success');
        } catch (err) {
            if (window.App) App.showToast('Failed to extract page: ' + err.message, 'error');
        }
    },

    // ==================== ZOOM ====================

    setZoom(z) {
        this.zoom = Math.max(0.5, Math.min(5, z));
        this._renderCurrentPage();
    },

    _zoomFit() {
        const container = document.getElementById('editorCanvasContainer');
        if (!container || !this.pdfDoc) return;
        this.pdfDoc.getPage(this.currentPage + 1).then(page => {
            const viewport = page.getViewport({ scale: 1 });
            const containerWidth = container.clientWidth - 40;
            this.zoom = containerWidth / viewport.width;
            this._renderCurrentPage();
        });
    },

    _toggleFullscreen() {
        const main = document.querySelector('.editor-main');
        if (main) {
            main.classList.toggle('editor-fullscreen');
            setTimeout(() => this._zoomFit(), 100);
        }
    },

    // ==================== PROPERTIES PANEL ====================

    _updatePropertiesPanel() {
        const panel = document.getElementById('editorPropsContent');
        if (!panel) return;

        const t = this.tool;
        let html = '';

        if (t === 'text') {
            html = `
                <div class="editor-prop-group">
                    <label>Font</label>
                    <select id="propFont">
                        <option value="Helvetica">Helvetica</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Courier">Courier</option>
                        <option value="Arial">Arial</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Verdana">Verdana</option>
                    </select>
                </div>
                <div class="editor-prop-group">
                    <label>Size: <span id="propFontSizeVal">${this.defaultProps.fontSize}</span>px</label>
                    <input type="range" id="propFontSize" min="8" max="72" value="${this.defaultProps.fontSize}">
                </div>
                <div class="editor-prop-group">
                    <label>Color</label>
                    <input type="color" id="propFontColor" value="${this.defaultProps.fontColor}">
                </div>
                <div class="editor-prop-group">
                    <label>Style</label>
                    <div class="editor-text-style-btns">
                        <button class="editor-style-btn ${this.defaultProps.bold ? 'active' : ''}" id="propBold" title="Bold"><b>B</b></button>
                        <button class="editor-style-btn ${this.defaultProps.italic ? 'active' : ''}" id="propItalic" title="Italic"><i>I</i></button>
                        <button class="editor-style-btn ${this.defaultProps.underline ? 'active' : ''}" id="propUnderline" title="Underline"><u>U</u></button>
                    </div>
                </div>
                <div class="editor-prop-group">
                    <label>Alignment</label>
                    <div class="editor-text-style-btns">
                        <button class="editor-style-btn ${this.defaultProps.textAlign === 'left' ? 'active' : ''}" data-align="left"><i class="fas fa-align-left"></i></button>
                        <button class="editor-style-btn ${this.defaultProps.textAlign === 'center' ? 'active' : ''}" data-align="center"><i class="fas fa-align-center"></i></button>
                        <button class="editor-style-btn ${this.defaultProps.textAlign === 'right' ? 'active' : ''}" data-align="right"><i class="fas fa-align-right"></i></button>
                    </div>
                </div>
                <p class="editor-props-hint" style="margin-top:12px;">Click on the page to add text. Double-click text to edit.</p>
            `;
        } else if (t === 'shape') {
            html = `
                <div class="editor-prop-group">
                    <label>Shape Type</label>
                    <select id="propShapeType">
                        <option value="rectangle" ${this.defaultProps.shapeType === 'rectangle' ? 'selected' : ''}>Rectangle</option>
                        <option value="circle" ${this.defaultProps.shapeType === 'circle' ? 'selected' : ''}>Circle / Ellipse</option>
                        <option value="line" ${this.defaultProps.shapeType === 'line' ? 'selected' : ''}>Line</option>
                        <option value="arrow" ${this.defaultProps.shapeType === 'arrow' ? 'selected' : ''}>Arrow</option>
                    </select>
                </div>
                <div class="editor-prop-group">
                    <label>Fill Color</label>
                    <input type="color" id="propFillColor" value="${this._toHex(this.defaultProps.fillColor)}">
                </div>
                <div class="editor-prop-group">
                    <label>Border Color</label>
                    <input type="color" id="propBorderColor" value="${this.defaultProps.borderColor}">
                </div>
                <div class="editor-prop-group">
                    <label>Border Width: <span id="propBorderWidthVal">${this.defaultProps.borderWidth}</span>px</label>
                    <input type="range" id="propBorderWidth" min="1" max="10" value="${this.defaultProps.borderWidth}">
                </div>
                <p class="editor-props-hint" style="margin-top:12px;">Click and drag on the page to draw a shape.</p>
            `;
        } else if (t === 'draw') {
            html = `
                <div class="editor-prop-group">
                    <label>Brush Size: <span id="propBrushSizeVal">${this.defaultProps.brushSize}</span>px</label>
                    <input type="range" id="propBrushSize" min="1" max="20" value="${this.defaultProps.brushSize}">
                </div>
                <div class="editor-prop-group">
                    <label>Brush Color</label>
                    <input type="color" id="propBrushColor" value="${this.defaultProps.brushColor}">
                </div>
                <div class="editor-prop-group">
                    <label>Quick Colors</label>
                    <div class="editor-prop-colors">
                        ${['#000000','#f44336','#2196f3','#4caf50','#ff9800','#9c27b0','#ffffff'].map(c =>
                            `<div class="editor-color-swatch" data-color="${c}" style="background:${c};border:1px solid #ccc;"></div>`
                        ).join('')}
                    </div>
                </div>
                <p class="editor-props-hint" style="margin-top:12px;">Click and drag to draw freely.</p>
            `;
        } else if (t === 'eraser') {
            html = `
                <div class="editor-prop-group">
                    <label>Eraser Size: <span id="propEraserSizeVal">${this.defaultProps.eraserSize}</span>px</label>
                    <input type="range" id="propEraserSize" min="5" max="50" value="${this.defaultProps.eraserSize}">
                </div>
                <p class="editor-props-hint" style="margin-top:12px;">Click and drag to erase drawing strokes.</p>
            `;
        } else if (t === 'watermark') {
            html = `
                <div class="editor-prop-group">
                    <label>Watermark Type</label>
                    <div style="display:flex;gap:6px;">
                        <button class="btn btn-primary btn-sm" id="propWmTextType" style="flex:1;">Text</button>
                        <button class="btn btn-secondary btn-sm" id="propWmImageType" style="flex:1;">Image</button>
                    </div>
                </div>
                <div id="propWmTextSettings">
                    <div class="editor-prop-group">
                        <label>Watermark Text</label>
                        <input type="text" id="propWatermarkText" value="WATERMARK" placeholder="Enter watermark text">
                    </div>
                    <div class="editor-prop-group">
                        <label>Font Size: <span id="propWmFontSizeVal">${this.defaultProps.watermarkFontSize}</span>px</label>
                        <input type="range" id="propWmFontSize" min="12" max="120" value="${this.defaultProps.watermarkFontSize}">
                    </div>
                    <div class="editor-prop-group">
                        <label>Color</label>
                        <input type="color" id="propWmColor" value="${this.defaultProps.watermarkColor}">
                    </div>
                </div>
                <div id="propWmImageSettings" style="display:none;">
                    <div class="editor-prop-group">
                        <button class="btn btn-secondary btn-sm" id="propWmUploadImage" style="width:100%;"><i class="fas fa-upload"></i> Upload Image</button>
                    </div>
                </div>
                <div class="editor-prop-group">
                    <label>Opacity: <span id="propWmOpacityVal">${Math.round(this.defaultProps.watermarkOpacity * 100)}%</span></label>
                    <input type="range" id="propWmOpacity" min="5" max="100" value="${Math.round(this.defaultProps.watermarkOpacity * 100)}">
                </div>
                <div class="editor-prop-group">
                    <label>Rotation: <span id="propWmRotationVal">${this.defaultProps.watermarkRotation}°</span></label>
                    <input type="range" id="propWmRotation" min="-180" max="180" value="${this.defaultProps.watermarkRotation}">
                </div>
                <p class="editor-props-hint" style="margin-top:12px;">Click on the page to place watermark.</p>
            `;
        } else if (t === 'select') {
            if (this.selectedElement) {
                html = `<p class="editor-props-hint">Element selected. Drag to move. Press Delete to remove.</p>`;
            } else {
                html = `<p class="editor-props-hint">Click on an element to select it. Drag to move.</p>`;
            }
        } else if (t === 'image') {
            html = `<p class="editor-props-hint">Click on the page to insert an image from your device.</p>`;
        } else if (t === 'signature') {
            html = `<p class="editor-props-hint">Click "Create Signature" above to draw or upload a signature.</p>`;
        }

        panel.innerHTML = html;
        this._bindPropertyEvents();
    },

    _bindPropertyEvents() {
        const bind = (id, event, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, handler);
        };

        bind('propFont', 'change', (e) => { this.defaultProps.font = e.target.value; });
        bind('propFontSize', 'input', (e) => {
            this.defaultProps.fontSize = parseInt(e.target.value);
            document.getElementById('propFontSizeVal').textContent = e.target.value;
        });
        bind('propFontColor', 'input', (e) => { this.defaultProps.fontColor = e.target.value; });

        bind('propBold', 'click', (e) => {
            this.defaultProps.bold = !this.defaultProps.bold;
            e.currentTarget.classList.toggle('active', this.defaultProps.bold);
        });
        bind('propItalic', 'click', (e) => {
            this.defaultProps.italic = !this.defaultProps.italic;
            e.currentTarget.classList.toggle('active', this.defaultProps.italic);
        });
        bind('propUnderline', 'click', (e) => {
            this.defaultProps.underline = !this.defaultProps.underline;
            e.currentTarget.classList.toggle('active', this.defaultProps.underline);
        });

        document.querySelectorAll('[data-align]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.defaultProps.textAlign = btn.dataset.align;
                document.querySelectorAll('[data-align]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        bind('propShapeType', 'change', (e) => { this.defaultProps.shapeType = e.target.value; });
        bind('propFillColor', 'input', (e) => { this.defaultProps.fillColor = e.target.value; });
        bind('propBorderColor', 'input', (e) => { this.defaultProps.borderColor = e.target.value; });
        bind('propBorderWidth', 'input', (e) => {
            this.defaultProps.borderWidth = parseInt(e.target.value);
            document.getElementById('propBorderWidthVal').textContent = e.target.value;
        });

        bind('propBrushSize', 'input', (e) => {
            this.defaultProps.brushSize = parseInt(e.target.value);
            document.getElementById('propBrushSizeVal').textContent = e.target.value;
        });
        bind('propBrushColor', 'input', (e) => { this.defaultProps.brushColor = e.target.value; });
        bind('propEraserSize', 'input', (e) => {
            this.defaultProps.eraserSize = parseInt(e.target.value);
            document.getElementById('propEraserSizeVal').textContent = e.target.value;
        });

        bind('propWatermarkText', 'input', (e) => { this.defaultProps.watermarkText = e.target.value; });
        bind('propWmFontSize', 'input', (e) => {
            this.defaultProps.watermarkFontSize = parseInt(e.target.value);
            document.getElementById('propWmFontSizeVal').textContent = e.target.value;
        });
        bind('propWmColor', 'input', (e) => { this.defaultProps.watermarkColor = e.target.value; });
        bind('propWmOpacity', 'input', (e) => {
            this.defaultProps.watermarkOpacity = parseInt(e.target.value) / 100;
            document.getElementById('propWmOpacityVal').textContent = e.target.value + '%';
        });
        bind('propWmRotation', 'input', (e) => {
            this.defaultProps.watermarkRotation = parseInt(e.target.value);
            document.getElementById('propWmRotationVal').textContent = e.target.value + '°';
        });
        bind('propWmTextType', 'click', () => {
            document.getElementById('propWmTextSettings').style.display = '';
            document.getElementById('propWmImageSettings').style.display = 'none';
            document.getElementById('propWmTextType').className = 'btn btn-primary btn-sm';
            document.getElementById('propWmImageType').className = 'btn btn-secondary btn-sm';
            this.defaultProps.watermarkType = 'text';
        });
        bind('propWmImageType', 'click', () => {
            document.getElementById('propWmTextSettings').style.display = 'none';
            document.getElementById('propWmImageSettings').style.display = '';
            document.getElementById('propWmTextType').className = 'btn btn-secondary btn-sm';
            document.getElementById('propWmImageType').className = 'btn btn-primary btn-sm';
            this.defaultProps.watermarkType = 'image';
            document.getElementById('editorImageInput')?.click();
        });
        bind('propWmUploadImage', 'click', () => {
            document.getElementById('editorImageInput')?.click();
        });

        document.querySelectorAll('.editor-color-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                this.defaultProps.brushColor = sw.dataset.color;
                const colorInput = document.getElementById('propBrushColor');
                if (colorInput) colorInput.value = sw.dataset.color;
            });
        });
    },

    _measureTextWidth(text, t) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let fontStr = '';
        if (t.italic) fontStr += 'italic ';
        if (t.bold) fontStr += 'bold ';
        fontStr += (t.fontSize || 16) + 'px ';
        fontStr += (t.font || 'Helvetica');
        ctx.font = fontStr;
        return ctx.measureText(text || '').width;
    },

    _toHex(color) {
        if (!color || color === 'rgba(255,255,255,0)') return '#ffffff';
        if (color.startsWith('#')) return color;
        const m = color.match(/\d+/g);
        if (m && m.length >= 3) {
            return '#' + m.slice(0, 3).map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
        }
        return '#ffffff';
    },

    // ==================== KEYBOARD SHORTCUTS ====================

    _bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (!document.getElementById('editorWorkspace') ||
                document.getElementById('editorWorkspace').style.display === 'none') return;

            if (e.target.contentEditable === 'true' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                this.undo();
            } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
                e.preventDefault();
                this.redo();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selectedElement) {
                    this._deleteSelected();
                }
            } else if (e.key === 'Escape') {
                this.selectedElement = null;
                this._renderAnnotations();
            }
        });
    },

    _deleteSelected() {
        if (!this.selectedElement) return;
        this._saveUndo();
        const ann = this.annotations[this.currentPage];
        const idx = ann.texts.indexOf(this.selectedElement);
        if (idx !== -1) { ann.texts.splice(idx, 1); this.selectedElement = null; this._renderAnnotations(); return; }
        const idx2 = ann.images.indexOf(this.selectedElement);
        if (idx2 !== -1) { ann.images.splice(idx2, 1); this.selectedElement = null; this._renderAnnotations(); return; }
        const idx3 = ann.shapes.indexOf(this.selectedElement);
        if (idx3 !== -1) { ann.shapes.splice(idx3, 1); this.selectedElement = null; this._renderAnnotations(); return; }
    },

    // ==================== SAVE / EXPORT ====================

    _bindSave() {
        document.getElementById('editorSaveBtn')?.addEventListener('click', () => this.savePdf());
    },

    async savePdf() {
        try {
            Converter.showLoading('Saving PDF...');
            const { PDFDocument } = PDFLib;
            const pdf = await PDFDocument.load(this.pdfBytes);

            const renderScale = 2;

            for (let i = 0; i < this.totalPages; i++) {
                const page = pdf.getPage(i);
                const { width, height } = page.getSize();
                const ann = this.annotations[i];
                if (!ann) continue;

                const hasAnnotations = ann.texts.length > 0 || ann.shapes.length > 0 ||
                    ann.drawings.length > 0 || ann.images.length > 0 || ann.watermarks.length > 0;
                if (!hasAnnotations) continue;

                const canvas = document.createElement('canvas');
                canvas.width = Math.round(width * renderScale);
                canvas.height = Math.round(height * renderScale);
                const ctx = canvas.getContext('2d');

                const s = renderScale / this.zoom;
                ctx.scale(s, s);

                ann.shapes.forEach(shape => this._drawShape(ctx, shape));

                ann.drawings.forEach(d => {
                    if (!d.points || d.points.length < 2) return;
                    ctx.save();
                    if (d.eraser) {
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = d.size || 20;
                    } else {
                        ctx.strokeStyle = d.color || '#000';
                        ctx.lineWidth = d.size || 3;
                    }
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(d.points[0].x, d.points[0].y);
                    for (let j = 1; j < d.points.length; j++) {
                        ctx.lineTo(d.points[j].x, d.points[j].y);
                    }
                    ctx.stroke();
                    ctx.restore();
                });

                ann.images.forEach(img => this._drawImageAnnotation(ctx, img));
                ann.watermarks.forEach(w => this._drawWatermark(ctx, w));
                ann.texts.forEach(t => this._drawTextOnCanvas(ctx, t));

                try {
                    const imgDataUrl = canvas.toDataURL('image/png');
                    const imgBytes = this._dataUrlToBytes(imgDataUrl);
                    const embeddedImg = await pdf.embedPng(imgBytes);
                    page.drawImage(embeddedImg, {
                        x: 0, y: 0,
                        width: width, height: height
                    });
                } catch (e) {
                    console.warn('Failed to embed annotations for page ' + (i + 1) + ':', e);
                }
            }

            const pdfBytes = await pdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const baseName = (this.pdfFileName || 'document').replace(/\.[^.]+$/, '');
            Converter.downloadBlob(blob, `${baseName}_edited.pdf`);

            HistoryManager.addRecord({
                fileName: `${baseName}_edited.pdf`,
                originalFormat: 'pdf',
                convertedFormat: 'pdf',
                size: blob.size,
                status: 'success',
                category: 'pdf'
            });

            if (window.App) App.showToast('PDF saved successfully!', 'success');
        } catch (err) {
            console.error('Save error:', err);
            if (window.App) App.showToast('Failed to save PDF: ' + err.message, 'error');
        }
        Converter.hideLoading();
    },

    _dataUrlToBytes(dataUrl) {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    },

    _hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return { r, g, b };
    },

    // ==================== AUTOSAVE ====================

    _autosave() {
        clearTimeout(this.autosaveTimer);
        this.autosaveTimer = setTimeout(() => {
            try {
                const data = {};
                for (let i = 0; i < this.totalPages; i++) {
                    const ann = this.annotations[i];
                    if (ann) {
                        data[i] = JSON.parse(JSON.stringify(ann, (key, val) => {
                            if (key === '_htmlImg') return undefined;
                            return val;
                        }));
                    }
                }
                localStorage.setItem('edeson_pdf_editor_autosave', JSON.stringify({
                    fileName: this.pdfFileName,
                    totalPages: this.totalPages,
                    annotations: data
                }));
            } catch (e) { /* ignore quota errors */ }
        }, 2000);
    },

    _loadAutosave() {
        try {
            const saved = localStorage.getItem('edeson_pdf_editor_autosave');
            if (saved) {
                const data = JSON.parse(saved);
                if (data.fileName === this.pdfFileName && data.totalPages === this.totalPages) {
                    for (const [key, val] of Object.entries(data.annotations || {})) {
                        this.annotations[parseInt(key)] = val;
                    }
                    this._renderAnnotations();
                }
            }
        } catch (e) { /* ignore */ }
    },

    // ==================== CLOSE ====================

    closeEditor() {
        this.pdfDoc = null;
        this.pdfBytes = null;
        this.currentPage = 0;
        this.totalPages = 0;
        this.annotations = {};
        this.undoStack = {};
        this.redoStack = {};
        this.selectedElement = null;

        document.getElementById('editorUploadArea').style.display = '';
        document.getElementById('editorWorkspace').style.display = 'none';

        if (window.App) App.navigateTo('pdf-tools');
    }
};
