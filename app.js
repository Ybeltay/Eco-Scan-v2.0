// ── BASE URL (dinámica: local vs producción) ──────────────────────────────────
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5050' : window.location.origin;

class EcoScanApp {
    constructor() {
        this.currentLang    = 'es';
        this.currentResults = null;
        this.currentData    = null;
        this.videoStream    = null;
        this.scanResult     = null;
        this.userRegion     = '';
        this.userLat        = '';
        this.userLng        = '';
        this.BASE_URL       = API_BASE;
        this.init();
    }

    init() {
        this.bindEvents();
        this.initPHSlider();
        this.initInstallPrompt();
        this.initTutorial();
        this.requestLocationOnLoad();
    }

    // ── PEDIR UBICACIÓN AL CARGAR ────────────────────────────────────────────
    requestLocationOnLoad() {
        // Pedir permiso de ubicación al iniciar (con banner amigable)
        if (!localStorage.getItem('locationAsked')) {
            setTimeout(() => this.showLocationBanner(), 1200);
        } else if (localStorage.getItem('locationGranted') === 'true') {
            this.getUserLocation(true); // silencioso, sin toast
        }
    }

    showLocationBanner() {
        const existing = document.getElementById('locationBanner');
        if (existing) return;
        const banner = document.createElement('div');
        banner.id = 'locationBanner';
        banner.style.cssText = `
            position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
            background:var(--bg-card);border:1px solid var(--accent-primary);
            border-radius:20px;padding:1.1rem 1.5rem;box-shadow:0 8px 32px rgba(0,0,0,.18);
            z-index:2500;display:flex;align-items:center;gap:1rem;max-width:480px;width:90%;
            animation:slideUp .4s cubic-bezier(.16,1,.3,1);
        `;
        banner.innerHTML = `
            <i class="fas fa-map-marker-alt" style="font-size:1.8rem;color:var(--accent-primary);flex-shrink:0;"></i>
            <div style="flex:1;">
                <strong style="display:block;margin-bottom:.2rem;">¿Usamos tu ubicación?</strong>
                <span style="font-size:.82rem;color:var(--text-secondary);">La IA recomendará plantas nativas de tu región exacta</span>
            </div>
            <div style="display:flex;gap:.5rem;flex-shrink:0;">
                <button id="locationAllowBtn" style="background:var(--accent-primary);color:#fff;border:none;border-radius:50px;padding:.5rem 1rem;cursor:pointer;font-weight:600;font-size:.85rem;">Permitir</button>
                <button id="locationDenyBtn" style="background:var(--accent-light);border:1px solid var(--border-color);border-radius:50px;padding:.5rem .8rem;cursor:pointer;font-size:.82rem;">No</button>
            </div>
        `;
        document.body.appendChild(banner);
        const style = document.createElement('style');
        style.textContent = `@keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`;
        document.head.appendChild(style);

        document.getElementById('locationAllowBtn').addEventListener('click', () => {
            banner.remove();
            localStorage.setItem('locationAsked', 'true');
            this.getUserLocation(false);
        });
        document.getElementById('locationDenyBtn').addEventListener('click', () => {
            banner.remove();
            localStorage.setItem('locationAsked', 'true');
            localStorage.setItem('locationGranted', 'false');
        });
    }

    // ── BIND EVENTS ──────────────────────────────────────────────────────────
    bindEvents() {
        document.getElementById('logoutBtn')?.addEventListener('click', async () => {
            try { await fetch(this.BASE_URL + '/api/logout', { method:'POST', credentials:'include' }); } catch(e) {}
            window.location.href = 'login.html';
        });
        document.getElementById('soilForm')?.addEventListener('submit', (e) => this.handleSubmit(e));
        document.getElementById('closeResults')?.addEventListener('click', () => this.hideResults());
        document.getElementById('downloadPdfBtn')?.addEventListener('click', () => this.downloadPDF());
        document.getElementById('getLocationBtn')?.addEventListener('click', () => this.getUserLocation(false));
        document.getElementById('scanCameraBtn')?.addEventListener('click', () => this.openCameraModal());
        document.getElementById('showGuidesBtn')?.addEventListener('click', () => this.showGuidesModal());
        document.getElementById('scheduleReminder')?.addEventListener('click', () => this.scheduleReminder());
        document.getElementById('enableAlerts')?.addEventListener('change', (e) => {
            document.getElementById('alertFrequency')?.classList.toggle('hidden', !e.target.checked);
        });
        document.getElementById('closeGuidesModal')?.addEventListener('click', () => this.closeGuidesModal());
        document.querySelectorAll('.guide-tab').forEach(tab =>
            tab.addEventListener('click', (e) => this.switchGuideTab(e.target.dataset.guide)));
        document.getElementById('closeCameraModal')?.addEventListener('click', () => this.closeCameraModal());
        document.getElementById('capturePhoto')?.addEventListener('click', () => this.capturePhoto());
        document.getElementById('uploadPhoto')?.addEventListener('click', () => document.getElementById('photoUpload').click());
        document.getElementById('photoUpload')?.addEventListener('change', (e) => this.handleImageUpload(e));
        document.getElementById('applyScanResult')?.addEventListener('click', () => this.applyScanToForm());
        document.getElementById('closeTutorial')?.addEventListener('click', () => this.closeTutorial());
        document.getElementById('skipTutorial')?.addEventListener('click', () => this.closeTutorial());
        document.getElementById('prevStep')?.addEventListener('click', () => this.prevTutorialStep());
        document.getElementById('nextStep')?.addEventListener('click', () => this.nextTutorialStep());
    }

    // ── PWA ───────────────────────────────────────────────────────────────────
    initInstallPrompt() {
        let dp;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault(); dp = e;
            const btn = document.getElementById('installBtn');
            if (btn) { btn.style.display='flex'; btn.onclick = async () => { if (dp) { dp.prompt(); await dp.userChoice; dp=null; } }; }
        });
    }

    // ── TUTORIAL ──────────────────────────────────────────────────────────────
    initTutorial() {
        if (!localStorage.getItem('tutorialShown')) setTimeout(() => this.showTutorial(), 700);
    }

    showTutorial() {
        this.currentTutorialStep = 0;
        this.tutorialSteps = [
            { title:'🌱 Bienvenido a EcoScan', desc:'Analiza tu suelo con IA real y obtén diagnósticos científicos completos con salinidad, plagas y plantas locales.', icon:'fas fa-seedling' },
            { title:'📍 Plantas de tu región', desc:'Activa tu ubicación y la IA recomendará plantas nativas de tu zona climática exacta.', icon:'fas fa-map-marker-alt' },
            { title:'📸 Escáner visual completo', desc:'Toma una foto y la IA analizará tipo, salinidad, plagas potenciales, nutrientes y más.', icon:'fas fa-camera' },
            { title:'🤖 Diagnóstico profundo', desc:'Completa el formulario para un plan de rehabilitación con manejo hídrico, enmiendas y calendario de cuidados.', icon:'fas fa-microchip' }
        ];
        this.updateTutorialStep();
        document.getElementById('tutorialModal').style.display = 'flex';
    }

    updateTutorialStep() {
        const step = this.tutorialSteps[this.currentTutorialStep];
        const stepDiv = document.getElementById('tutorialStep');
        const counter = document.getElementById('stepCounter');
        const prevBtn = document.getElementById('prevStep');
        const nextBtn = document.getElementById('nextStep');
        if (stepDiv) stepDiv.innerHTML = `<div style="text-align:center;padding:1rem 0;"><i class="${step.icon}" style="font-size:3rem;color:var(--accent-primary);margin-bottom:1rem;display:block;"></i><h4 style="margin-bottom:.75rem;">${step.title}</h4><p style="color:var(--text-secondary);line-height:1.6;">${step.desc}</p></div>`;
        if (counter) counter.textContent = `Paso ${this.currentTutorialStep + 1}/${this.tutorialSteps.length}`;
        if (prevBtn) prevBtn.disabled = this.currentTutorialStep === 0;
        if (nextBtn) nextBtn.textContent = this.currentTutorialStep === this.tutorialSteps.length - 1 ? 'Comenzar' : 'Siguiente';
    }

    nextTutorialStep() {
        if (this.currentTutorialStep < this.tutorialSteps.length - 1) { this.currentTutorialStep++; this.updateTutorialStep(); }
        else this.closeTutorial();
    }

    prevTutorialStep() {
        if (this.currentTutorialStep > 0) { this.currentTutorialStep--; this.updateTutorialStep(); }
    }

    closeTutorial() {
        document.getElementById('tutorialModal').style.display = 'none';
        localStorage.setItem('tutorialShown', 'true');
    }

    // ── PH SLIDER ────────────────────────────────────────────────────────────
    initPHSlider() {
        const slider = document.getElementById('phSlider');
        const input  = document.getElementById('phLevel');
        const update = (v) => { if (slider) slider.style.accentColor = v<6?'#d32f2f':v<=7.5?'#2e7d32':'#ff9800'; };
        slider?.addEventListener('input', (e) => { if (input) input.value = parseFloat(e.target.value).toFixed(1); update(parseFloat(e.target.value)); });
        input?.addEventListener('input', (e) => {
            let v = parseFloat(e.target.value);
            if (!isNaN(v)) { v = Math.max(0, Math.min(14, v)); if (slider) slider.value = v; update(v); }
        });
    }

    // ── GEOLOCALIZACIÓN ──────────────────────────────────────────────────────
    getUserLocation(silent = false) {
        if (!navigator.geolocation) { if (!silent) this.showToast('Geolocalización no disponible en este navegador', 'error'); return; }
        if (!silent) this.showToast('Obteniendo ubicación...', 'info');
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                this.userLat = lat; this.userLng = lng;
                document.getElementById('userLatitude').value  = lat;
                document.getElementById('userLongitude').value = lng;
                localStorage.setItem('locationGranted', 'true');
                await this.getRegionFromCoordinates(lat, lng);
                if (!silent) this.showToast('📍 Ubicación detectada. La IA usará plantas de tu región.', 'success');
            },
            (err) => {
                localStorage.setItem('locationGranted', 'false');
                if (!silent) this.showToast('No se pudo obtener la ubicación. Puedes escribirla manualmente.', 'warning');
            }
        );
    }

    async getRegionFromCoordinates(lat, lng) {
        try {
            const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`, { headers:{'Accept-Language':'es'} });
            const d = await r.json();
            const a = d.address || {};
            this.userRegion = [a.city||a.town||a.village||a.municipality, a.state||a.region, a.country].filter(Boolean).join(', ');
            document.getElementById('userRegion').value = this.userRegion;
            const locDiv = document.getElementById('locationDisplay');
            const locTxt = document.getElementById('locationText');
            if (locDiv && locTxt && this.userRegion) {
                locTxt.textContent = `📍 ${this.userRegion}`;
                locDiv.classList.remove('hidden');
            }
        } catch(e) { console.error('Geocoding error:', e); }
    }

    // ── CÁMARA ───────────────────────────────────────────────────────────────
    async openCameraModal() {
        document.getElementById('cameraModal').style.display = 'flex';
        document.getElementById('scanResult')?.classList.add('hidden');
        try {
            const video = document.getElementById('cameraVideo');
            this.videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = this.videoStream;
        } catch {
            this.showToast('No se pudo acceder a la cámara. Usa "Subir imagen".', 'error');
        }
    }

    capturePhoto() {
        const video  = document.getElementById('cameraVideo');
        const canvas = document.getElementById('cameraCanvas');
        canvas.width = video.videoWidth||640; canvas.height = video.videoHeight||480;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        this.analyzeImageWithAI(canvas.toDataURL('image/jpeg', 0.8));
    }

    handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.getElementById('cameraCanvas');
                const MAX = 1024, ratio = Math.min(MAX/img.width, MAX/img.height, 1);
                canvas.width = img.width*ratio; canvas.height = img.height*ratio;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                this.analyzeImageWithAI(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    async analyzeImageWithAI(dataUrl) {
        const resultDiv    = document.getElementById('scanResult');
        const analysisText = document.getElementById('scanAnalysis');
        const previewImg   = document.getElementById('capturedPreview');
        const applyBtn     = document.getElementById('applyScanResult');

        // Spinner en modal mientras escanea
        if (previewImg)  { previewImg.src = dataUrl; previewImg.style.display = 'block'; }
        if (applyBtn)      applyBtn.style.display = 'none';
        if (resultDiv)     resultDiv.classList.remove('hidden');
        if (analysisText)  analysisText.innerHTML = `
            <div style="display:flex;align-items:center;gap:.75rem;padding:.5rem 0;">
                <div style="width:36px;height:36px;border-radius:50%;background:var(--accent-light);display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-spinner fa-spin" style="color:var(--accent-primary);"></i>
                </div>
                <div>
                    <strong style="display:block;font-size:.9rem;">Escaneando imagen con IA...</strong>
                    <span style="font-size:.8rem;color:var(--text-secondary);">Comparando con base de datos + SoilGrids</span>
                </div>
            </div>`;

        try {
            // ── PASO 1: Escaneo visual ─────────────────────────────────────────
            const scanResp = await fetch(this.BASE_URL + '/api/scan-image', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ image: dataUrl, lang: this.currentLang, region: this.userRegion, lat: this.userLat, lng: this.userLng })
            });
            if (!scanResp.ok) throw new Error('Error HTTP ' + scanResp.status);
            const scanResult = await scanResp.json();
            if (scanResult.error) throw new Error(scanResult.error);

            // Imagen inválida: error en el modal para que reintente
            if (!scanResult.isSoil) {
                if (previewImg) previewImg.style.display = 'none';
                if (analysisText) analysisText.innerHTML = `
                    <div style="text-align:center;padding:.75rem 0;">
                        <i class="fas fa-ban" style="font-size:2.5rem;color:var(--error);margin-bottom:.5rem;display:block;"></i>
                        <strong style="color:var(--error);">No se detectó suelo en la imagen</strong>
                        <p style="margin-top:.5rem;font-size:.85rem;color:var(--text-secondary);">${scanResult.rejection_reason || 'Apunta directamente al suelo (tierra, arena, arcilla).'}</p>
                    </div>`;
                return;
            }

            // ── PASO 2: Llenar formulario silenciosamente ──────────────────────
            this._fillFormFromScan(scanResult);
            this.currentData = {
                soilType:    scanResult.soilType    || 'franco',
                ph:          scanResult.estimatedPh  || 7.0,
                compaction:  scanResult.compaction   || 'media',
                drainage:    scanResult.drainage     || 'moderado',
                erosion:     scanResult.erosion      || 'media',
                fireHistory: scanResult.fireHistory  || 'ninguno',
                goal:        document.getElementById('goal')?.value || 'mejorar suelo',
                region:      this.userRegion || document.getElementById('userRegion')?.value || '',
                latitude:    this.userLat    || document.getElementById('userLatitude')?.value  || '',
                longitude:   this.userLng    || document.getElementById('userLongitude')?.value || '',
            };

            // ── PASO 3: Cerrar modal + loading overlay para análisis completo ──
            this.closeCameraModal();
            this.hideResults();
            this.showLoading(true, '🔬 Tipo detectado: ' + (scanResult.soilType || 'N/A') + ' · pH: ' + (scanResult.estimatedPh || 'N/A') + ' · Generando diagnóstico completo...');

            // ── PASO 4: Análisis completo con /api/analyze ────────────────────
            const fullAnalysis = await this.analyzeWithAI(this.currentData);
            this.currentResults = fullAnalysis;

            // ── PASO 5: Mostrar igual que el formulario + paneles de foto/BD/SG
            this.displayResults(fullAnalysis);
            this._injectScanPanels(scanResult, dataUrl);

            this.showLoading(false);
            this.showResults();
            this.showToast('✅ Diagnóstico completo generado desde tu fotografía', 'success');

        } catch (err) {
            this.showLoading(false);
            console.error('Scan/analyze error:', err);
            if (document.getElementById('cameraModal')?.style.display === 'none') {
                this.displayError('Error al generar el diagnóstico: ' + err.message);
                this.showResults();
            } else {
                if (previewImg) previewImg.style.display = 'none';
                if (analysisText) analysisText.innerHTML = `<strong style="color:var(--error);">Error: ${err.message}</strong>`;
            }
        }
    }

    // ── Rellena formulario silenciosamente con datos del scan ─────────────────
    _fillFormFromScan(r) {
        const set = (id, val) => { if (!val) return; const el = document.getElementById(id); if (el) el.value = val; };
        set('soilType', r.soilType); set('compaction', r.compaction);
        set('drainage', r.drainage); set('erosion', r.erosion); set('fireHistory', r.fireHistory);
        const ph = parseFloat(r.estimatedPh);
        if (!isNaN(ph)) {
            set('phLevel', ph.toFixed(1));
            const slider = document.getElementById('phSlider');
            if (slider) { slider.value = ph; slider.style.accentColor = ph < 6 ? '#d32f2f' : ph <= 7.5 ? '#2e7d32' : '#ff9800'; }
        }
    }

    // ── Inserta paneles foto + BD + SoilGrids al inicio de resultsContent ────
    _injectScanPanels(r, dataUrl) {
        const container = document.getElementById('resultsContent');
        if (!container) return;
        const hasSG  = !!r.soilGridsData;
        const hasDB  = r.databaseMatches && r.databaseMatches.length > 0;
        const matchC = ['#1b5e20', '#2e7d32', '#388e3c'];
        let html = '';

        // Panel foto
        html += `<div class="results-section">
            <h4 style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;">
                <i class="fas fa-camera"></i> Foto analizada
                <span style="background:var(--accent-primary);color:#fff;font-size:.68rem;padding:2px 8px;border-radius:50px;">🤖 IA Visión</span>
                ${hasDB ? `<span style="background:#1b5e20;color:#fff;font-size:.68rem;padding:2px 8px;border-radius:50px;">📚 BD Suelos</span>` : ''}
                ${hasSG ? `<span style="background:#0d47a1;color:#fff;font-size:.68rem;padding:2px 8px;border-radius:50px;">🌍 SoilGrids</span>` : ''}
            </h4>
            <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-start;">
                <img src="${dataUrl}" alt="Foto del suelo" style="width:125px;height:125px;object-fit:cover;border-radius:12px;border:2px solid var(--border-color);flex-shrink:0;">
                <div style="flex:1;min-width:150px;font-size:.83rem;">
                    <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:.3rem .5rem;margin-bottom:.45rem;">
                        <div><span style="color:var(--text-secondary);">Tipo:</span> <strong>${r.soilType || 'N/A'}</strong></div>
                        <div><span style="color:var(--text-secondary);">pH visual:</span> <strong>${r.estimatedPh || 'N/A'}${hasSG && r.soilGridsData?.ph_real ? ` <span style="color:#0d47a1;font-size:.72rem;">(real: ${r.soilGridsData.ph_real})</span>` : ''}</strong></div>
                        <div><span style="color:var(--text-secondary);">Compactación:</span> <strong>${r.compaction || 'N/A'}</strong></div>
                        <div><span style="color:var(--text-secondary);">Drenaje:</span> <strong>${r.drainage || 'N/A'}</strong></div>
                        <div><span style="color:var(--text-secondary);">Humedad:</span> <strong>${r.humidity || 'N/A'}</strong></div>
                        <div><span style="color:var(--text-secondary);">Estructura:</span> <strong>${r.structureQuality || 'N/A'}</strong></div>
                    </div>
                    <div style="background:var(--accent-light);border-radius:8px;padding:.3rem .6rem;font-size:.77rem;">
                        🎯 Confianza IA: <strong>${r.confidence || 'N/A'}%</strong>
                        ${r.color ? ` · 🎨 ${r.color}` : ''}
                    </div>
                    ${r.observations ? `<p style="font-size:.77rem;color:var(--text-secondary);margin:.45rem 0 0;font-style:italic;">${r.observations}</p>` : ''}
                </div>
            </div>
        </div>`;

        // Panel SoilGrids
        if (hasSG) {
            const sg = r.soilGridsData;
            html += `<div class="results-section" style="padding:0;overflow:hidden;">
                <div style="background:linear-gradient(135deg,#0d47a1,#1565c0);color:#fff;padding:1rem 1.2rem;">
                    <h4 style="margin:0 0 .55rem;color:#fff;font-size:.95rem;"><i class="fas fa-globe"></i> Datos Reales Medidos — ISRIC SoilGrids (0–5 cm)</h4>
                    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.4rem .6rem;font-size:.81rem;">
                        ${sg.ph_real            != null ? `<div><span style="opacity:.75;">pH real</span><br><strong style="font-size:1rem;">${sg.ph_real}</strong></div>` : ''}
                        ${sg.clay_pct           != null ? `<div><span style="opacity:.75;">Arcilla</span><br><strong>${sg.clay_pct}%</strong></div>` : ''}
                        ${sg.sand_pct           != null ? `<div><span style="opacity:.75;">Arena</span><br><strong>${sg.sand_pct}%</strong></div>` : ''}
                        ${sg.silt_pct           != null ? `<div><span style="opacity:.75;">Limo</span><br><strong>${sg.silt_pct}%</strong></div>` : ''}
                        ${sg.organic_carbon_pct != null ? `<div><span style="opacity:.75;">C. Orgánico</span><br><strong>${sg.organic_carbon_pct}%</strong></div>` : ''}
                        ${sg.cec_cmolkg         != null ? `<div><span style="opacity:.75;">CIC</span><br><strong>${sg.cec_cmolkg} cmol/kg</strong></div>` : ''}
                        ${sg.bulk_density_g_cm3 != null ? `<div><span style="opacity:.75;">D. Aparente</span><br><strong>${sg.bulk_density_g_cm3} g/cm³</strong></div>` : ''}
                        ${sg.nitrogen_cg_kg     != null ? `<div><span style="opacity:.75;">Nitrógeno</span><br><strong>${sg.nitrogen_cg_kg} cg/kg</strong></div>` : ''}
                        ${sg.texture_class               ? `<div><span style="opacity:.75;">Textura real</span><br><strong>${sg.texture_class}</strong></div>` : ''}
                    </div>
                </div>
            </div>`;
        }

        // Panel BD de suelos
        if (hasDB) {
            html += `<div class="results-section">
                <h4><i class="fas fa-database"></i> Comparación con Base de Datos de Suelos
                    <span style="font-size:.73rem;font-weight:400;color:var(--text-secondary);margin-left:.4rem;">· Usada para afinar el diagnóstico IA</span>
                </h4>`;
            r.databaseMatches.forEach((m, i) => {
                const barW = Math.min(100, m.match_score);
                const barC = matchC[i] || '#2e7d32';
                html += `<details style="background:var(--bg-secondary);border-radius:10px;padding:.6rem .85rem;margin-bottom:.35rem;border:1px solid var(--border-color);" ${i === 0 ? 'open' : ''}>
                    <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:.5rem;font-size:.83rem;flex-wrap:wrap;">
                        <span style="background:${barC};color:#fff;border-radius:50px;padding:1px 7px;font-size:.7rem;font-weight:700;flex-shrink:0;">#${i + 1}</span>
                        <strong style="min-width:0;overflow-wrap:break-word;flex:1 1 120px;">${m.name}</strong>
                        <span style="font-size:.73rem;color:var(--text-secondary);">${m.fao_class}</span>
                        <span style="font-size:.78rem;font-weight:700;color:${barC};margin-left:auto;">${m.match_score}/100</span>
                    </summary>
                    <div style="margin-top:.5rem;padding-top:.4rem;border-top:1px solid var(--border-color);font-size:.79rem;">
                        <div style="background:var(--border-color);border-radius:50px;height:5px;margin-bottom:.45rem;overflow:hidden;">
                            <div style="width:${barW}%;background:${barC};height:100%;border-radius:50px;"></div>
                        </div>
                        <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:.25rem .7rem;color:var(--text-secondary);margin-bottom:.35rem;">
                            <div>📋 USDA: <strong style="color:var(--text-primary);">${m.usda_class}</strong></div>
                            <div>🌱 Fertilidad: <strong style="color:var(--text-primary);">${m.fertility}</strong></div>
                        </div>
                        ${m.typical_regions?.length ? `<p style="margin:.25rem 0;">📍 <em>Regiones:</em> ${m.typical_regions.join(', ')}</p>` : ''}
                        ${m.native_plants?.length   ? `<p style="margin:.25rem 0;">🌿 <em>Nativas:</em> ${m.native_plants.join(' · ')}</p>` : ''}
                        ${m.typical_crops?.length   ? `<p style="margin:.25rem 0;">🌽 <em>Cultivos:</em> ${m.typical_crops.join(', ')}</p>` : ''}
                        ${m.main_issues?.length     ? `<p style="margin:.25rem 0;">⚠️ <em>Problemas:</em> ${m.main_issues.join('; ')}</p>` : ''}
                        ${m.amendments?.length      ? `<p style="margin:.25rem 0;">🧪 <em>Enmiendas:</em> ${m.amendments.join('; ')}</p>` : ''}
                    </div>
                </details>`;
            });
            html += `</div>`;
        }

        container.insertAdjacentHTML('afterbegin', html);
    }

    renderScanResult(r) {
        const salinityColor = { baja:'#2e7d32', media:'#ff9800', alta:'#f44336', 'muy alta':'#b71c1c' };
        const riskColor     = { bajo:'#2e7d32', medio:'#ff9800', alto:'#f44336', crítico:'#b71c1c' };
        const matchColors   = ['#1b5e20','#2e7d32','#388e3c'];

        const salinityLevel = (r.salinity?.level || 'baja').toLowerCase();
        const salColor = salinityColor[salinityLevel] || '#666';
        const hasSG = !!r.soilGridsData;
        const hasDB = r.databaseMatches && r.databaseMatches.length > 0;

        // ── Cabecera con badges de fuente ──────────────────────────────────────
        let html = `<div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:1rem;padding-bottom:.75rem;border-bottom:1px solid var(--border-color);">
            <span style="background:var(--accent-primary);color:#fff;font-size:.68rem;padding:2px 8px;border-radius:50px;">🤖 IA Visión</span>
            ${hasDB ? `<span style="background:#1b5e20;color:#fff;font-size:.68rem;padding:2px 8px;border-radius:50px;">📚 BD Suelos</span>` : ''}
            ${hasSG ? `<span style="background:#0d47a1;color:#fff;font-size:.68rem;padding:2px 8px;border-radius:50px;">🌍 SoilGrids Real</span>` : ''}
            <strong style="color:var(--accent-primary);margin-left:auto;">Confianza ${r.confidence}%</strong>
        </div>`;

        // ── SoilGrids: datos medidos reales (si hay GPS) ────────────────────────
        if (hasSG) {
            const sg = r.soilGridsData;
            html += `<div style="background:linear-gradient(135deg,#0d47a1 0%,#1565c0 100%);color:#fff;border-radius:12px;padding:.75rem 1rem;margin-bottom:.9rem;font-size:.82rem;">
                <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.5rem;">
                    <span style="font-size:1rem;">🌍</span>
                    <strong style="font-size:.85rem;">Datos Reales Medidos — ISRIC SoilGrids (0–5 cm)</strong>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.4rem .6rem;">
                    ${sg.ph_real != null ? `<div><span style="opacity:.8;">pH real</span><br><strong style="font-size:1rem;">${sg.ph_real}</strong></div>` : ''}
                    ${sg.clay_pct != null ? `<div><span style="opacity:.8;">Arcilla</span><br><strong>${sg.clay_pct}%</strong></div>` : ''}
                    ${sg.sand_pct != null ? `<div><span style="opacity:.8;">Arena</span><br><strong>${sg.sand_pct}%</strong></div>` : ''}
                    ${sg.silt_pct != null ? `<div><span style="opacity:.8;">Limo</span><br><strong>${sg.silt_pct}%</strong></div>` : ''}
                    ${sg.organic_carbon_pct != null ? `<div><span style="opacity:.8;">C.O.</span><br><strong>${sg.organic_carbon_pct}%</strong></div>` : ''}
                    ${sg.cec_cmolkg != null ? `<div><span style="opacity:.8;">CIC</span><br><strong>${sg.cec_cmolkg} cmol/kg</strong></div>` : ''}
                    ${sg.bulk_density_g_cm3 != null ? `<div><span style="opacity:.8;">D. Aparente</span><br><strong>${sg.bulk_density_g_cm3} g/cm³</strong></div>` : ''}
                    ${sg.nitrogen_cg_kg != null ? `<div><span style="opacity:.8;">Nitrógeno</span><br><strong>${sg.nitrogen_cg_kg} cg/kg</strong></div>` : ''}
                    ${sg.texture_class ? `<div><span style="opacity:.8;">Textura real</span><br><strong>${sg.texture_class}</strong></div>` : ''}
                </div>
            </div>`;
        }

        // ── Comparación con Base de Datos de Referencia ────────────────────────
        if (hasDB) {
            html += `<div style="margin-bottom:.9rem;">
                <strong style="font-size:.85rem;display:flex;align-items:center;gap:.4rem;margin-bottom:.5rem;">
                    <span style="background:#1b5e20;color:#fff;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:.7rem;">📚</span>
                    Comparación con Base de Datos de Suelos
                </strong>`;
            r.databaseMatches.forEach((m, i) => {
                const barW = Math.min(100, m.match_score);
                const barC = matchColors[i] || '#2e7d32';
                html += `<details style="background:var(--bg-primary);border-radius:10px;padding:.6rem .8rem;margin-bottom:.35rem;border:1px solid var(--border-color);" ${i===0?'open':''}>
                    <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:.5rem;font-size:.83rem;flex-wrap:wrap;">
                        <span style="background:${barC};color:#fff;border-radius:50px;padding:1px 7px;font-size:.7rem;flex-shrink:0;">#${i+1}</span>
                        <strong style="min-width:0;overflow-wrap:break-word;flex:1 1 120px;">${m.name}</strong>
                        <span style="font-size:.75rem;color:var(--text-secondary);">${m.fao_class}</span>
                        <span style="font-size:.75rem;font-weight:600;color:${barC};margin-left:auto;">${m.match_score}/100</span>
                    </summary>
                    <div style="margin-top:.5rem;padding-top:.4rem;border-top:1px solid var(--border-color);font-size:.8rem;">
                        <div style="background:var(--border-color);border-radius:50px;height:5px;margin-bottom:.5rem;overflow:hidden;">
                            <div style="width:${barW}%;background:${barC};height:100%;border-radius:50px;"></div>
                        </div>
                        <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:.3rem .6rem;color:var(--text-secondary);margin-bottom:.4rem;">
                            <div>📋 USDA: <strong style="color:var(--text-primary);">${m.usda_class}</strong></div>
                            <div>🌱 Fertilidad: <strong style="color:var(--text-primary);">${m.fertility}</strong></div>
                        </div>
                        ${m.typical_regions?.length ? `<div style="margin-bottom:.3rem;">📍 <em>Regiones típicas:</em> ${m.typical_regions.join(', ')}</div>` : ''}
                        ${m.native_plants?.length ? `<div style="margin-bottom:.3rem;">🌿 <em>Plantas nativas:</em> ${m.native_plants.join(' · ')}</div>` : ''}
                        ${m.typical_crops?.length ? `<div style="margin-bottom:.3rem;">🌽 <em>Cultivos típicos:</em> ${m.typical_crops.join(', ')}</div>` : ''}
                        ${m.main_issues?.length ? `<div style="margin-bottom:.3rem;">⚠️ <em>Problemas comunes:</em> ${m.main_issues.join('; ')}</div>` : ''}
                        ${m.amendments?.length ? `<div>🧪 <em>Enmiendas clave:</em> ${m.amendments.join('; ')}</div>` : ''}
                    </div>
                </details>`;
            });
            html += `</div>`;
        }

        // ── Grid principal: tipo, pH, estructura ───────────────────────────────
        html += `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:.5rem .8rem;font-size:.85rem;margin-bottom:1rem;">
            <div><span style="color:var(--text-secondary);">Tipo:</span> <strong>${r.soilType || 'N/A'}</strong></div>
            <div><span style="color:var(--text-secondary);">pH estimado:</span> <strong>${r.estimatedPh || 'N/A'}${hasSG && r.soilGridsData.ph_real ? ` <span style="color:#0d47a1;font-size:.75rem;">(real: ${r.soilGridsData.ph_real})</span>` : ''}</strong></div>
            <div><span style="color:var(--text-secondary);">Color:</span> <strong>${r.color || 'N/A'}</strong></div>
            <div><span style="color:var(--text-secondary);">Textura:</span> <strong>${r.texture || 'N/A'}</strong></div>
            <div><span style="color:var(--text-secondary);">Compactación:</span> <strong>${r.compaction || 'N/A'}</strong></div>
            <div><span style="color:var(--text-secondary);">Drenaje:</span> <strong>${r.drainage || 'N/A'}</strong></div>
            <div><span style="color:var(--text-secondary);">Erosión:</span> <strong>${r.erosion || 'N/A'}</strong></div>
            <div><span style="color:var(--text-secondary);">Humedad:</span> <strong>${r.humidity || 'N/A'}</strong></div>
            <div><span style="color:var(--text-secondary);">Mat. Orgánica:</span> <strong>${r.organicMatter || 'N/A'}</strong></div>
            <div><span style="color:var(--text-secondary);">Estructura:</span> <strong>${r.structureQuality || 'N/A'}</strong></div>
        </div>`;

        // ── Salinidad ──────────────────────────────────────────────────────────
        if (r.salinity) {
            html += `<div style="background:var(--bg-primary);border-left:3px solid ${salColor};border-radius:8px;padding:.6rem .8rem;margin-bottom:.75rem;font-size:.83rem;">
                <strong style="color:${salColor};">🧂 Salinidad: ${r.salinity.level?.toUpperCase() || 'N/A'}</strong>
                ${r.salinity.estimatedDsM ? `<span style="color:var(--text-secondary);"> (~${r.salinity.estimatedDsM} dS/m)</span>` : ''}
                <p style="margin:.3rem 0 0;color:var(--text-secondary);">${r.salinity.visualSigns || ''}</p>
                ${r.salinity.recommendation ? `<p style="margin:.3rem 0 0;font-style:italic;">${r.salinity.recommendation}</p>` : ''}
            </div>`;
        }

        // ── Nutrientes estimados ───────────────────────────────────────────────
        if (r.nutrients) {
            html += `<div style="background:var(--bg-primary);border-radius:8px;padding:.6rem .8rem;margin-bottom:.75rem;font-size:.83rem;">
                <strong>🌿 Nutrientes estimados</strong>
                <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:.3rem;margin-top:.4rem;">
                    <div>N: <strong>${r.nutrients.estimatedNitrogen || r.nutrients.nitrogen || 'N/A'}</strong></div>
                    <div>P: <strong>${r.nutrients.estimatedPhosphorus || r.nutrients.phosphorus || 'N/A'}</strong></div>
                    <div>M.O.: <strong>${r.nutrients.organicMatterLevel || r.nutrients.organicMatter || 'N/A'}</strong></div>
                </div>
                ${r.nutrients.visualCues ? `<p style="margin:.4rem 0 0;color:var(--text-secondary);">${r.nutrients.visualCues}</p>` : ''}
            </div>`;
        }

        // ── Plagas potenciales ─────────────────────────────────────────────────
        if (r.potentialPests && r.potentialPests.length > 0) {
            html += `<div style="margin-bottom:.75rem;">
                <strong style="font-size:.85rem;display:block;margin-bottom:.4rem;">🐛 Plagas potenciales detectadas</strong>`;
            r.potentialPests.forEach(p => {
                const rc = riskColor[(p.riskLevel||'bajo').toLowerCase()] || '#666';
                html += `<div style="background:var(--bg-primary);border-radius:8px;padding:.5rem .7rem;margin-bottom:.3rem;font-size:.82rem;border-left:3px solid ${rc};">
                    <strong>${p.name}</strong> <span style="font-size:.75rem;background:var(--accent-light);border-radius:50px;padding:1px 7px;">${p.type}</span>
                    <span style="float:right;color:${rc};font-size:.75rem;font-weight:600;">Riesgo: ${p.riskLevel}</span>
                    <p style="margin:.3rem 0 0;color:var(--text-secondary);">${p.visualEvidence || ''}</p>
                    ${p.control ? `<p style="margin:.2rem 0 0;color:var(--accent-primary);font-size:.78rem;">Control: ${p.control}</p>` : ''}
                </div>`;
            });
            html += `</div>`;
        }

        // ── Plantas recomendadas ───────────────────────────────────────────────
        if (r.recommendedPlants && r.recommendedPlants.length > 0) {
            html += `<div style="margin-bottom:.75rem;">
                <strong style="font-size:.85rem;display:block;margin-bottom:.4rem;">🌿 Plantas recomendadas para tu región</strong>`;
            r.recommendedPlants.slice(0,4).forEach(p => {
                html += `<div style="background:var(--accent-light);border-radius:8px;padding:.5rem .7rem;margin-bottom:.3rem;font-size:.82rem;">
                    <strong>${p.name}</strong> ${p.type ? `<span style="font-size:.73rem;background:var(--bg-card);border-radius:50px;padding:1px 6px;">${p.type}</span>` : ''}
                    <p style="margin:.25rem 0 0;color:var(--text-secondary);">${p.reason || ''}</p>
                    ${p.waterNeeds ? `<small>💧 Agua: ${p.waterNeeds}</small>` : ''}
                    ${p.season ? `<small style="margin-left:.5rem;">📅 ${p.season}</small>` : ''}
                </div>`;
            });
            html += `</div>`;
        }

        // ── Acciones inmediatas ────────────────────────────────────────────────
        if (r.immediateActions && r.immediateActions.length > 0) {
            html += `<div style="margin-bottom:.5rem;">
                <strong style="font-size:.85rem;display:block;margin-bottom:.4rem;">⚡ Acciones inmediatas recomendadas</strong>
                <ul style="list-style:none;padding:0;font-size:.82rem;">
                    ${r.immediateActions.map(a => `<li style="padding:.3rem 0;border-bottom:1px solid var(--border-color);color:var(--text-secondary);">→ ${a}</li>`).join('')}
                </ul>
            </div>`;
        }

        // ── Observaciones finales ──────────────────────────────────────────────
        if (r.observations) {
            html += `<p style="font-size:.8rem;color:var(--text-secondary);border-top:1px solid var(--border-color);padding-top:.6rem;margin-top:.5rem;font-style:italic;">${r.observations}</p>`;
        }

        return html;
    }

    applyScanToForm() {
        if (!this.scanResult) { this.showToast('No hay datos de escaneo para aplicar', 'error'); return; }
        const s = this.scanResult;
        const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
        set('soilType', s.soilType); set('phLevel', s.ph); set('phSlider', s.ph);
        set('compaction', s.compaction); set('drainage', s.drainage);
        set('erosion', s.erosion); set('fireHistory', s.fireHistory);
        const phVal = parseFloat(s.ph);
        const slider = document.getElementById('phSlider');
        if (slider) slider.style.accentColor = phVal<6?'#d32f2f':phVal<=7.5?'#2e7d32':'#ff9800';
        this.closeCameraModal();
        this.showToast('✅ Formulario completado con datos del escáner IA', 'success');
    }

    closeCameraModal() {
        document.getElementById('cameraModal').style.display = 'none';
        if (this.videoStream) { this.videoStream.getTracks().forEach(t => t.stop()); this.videoStream = null; }
    }

    showGuidesModal(tab='ph') {
        document.getElementById('guidesModal').style.display = 'flex';
        this.switchGuideTab(tab);
    }

    closeGuidesModal() { document.getElementById('guidesModal').style.display = 'none'; }

    switchGuideTab(tab) {
        document.querySelectorAll('.guide-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.guide-content').forEach(c => c.classList.remove('active'));
        document.querySelector(`[data-guide="${tab}"]`)?.classList.add('active');
        document.getElementById(`${tab}Guide`)?.classList.add('active');
    }

    // ── RECORDATORIOS ────────────────────────────────────────────────────────
    scheduleReminder() {
        if (!('Notification' in window)) { this.showToast('Notificaciones no disponibles', 'error'); return; }
        if (Notification.permission === 'granted') this.setReminder();
        else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p==='granted') this.setReminder(); });
        else this.showToast('Notificaciones bloqueadas en el navegador', 'error');
    }

    setReminder() {
        new Notification('EcoScan 🌱', { body:'¡Es hora de revisar tu suelo!' });
        this.showToast('✅ Recordatorio activado', 'success');
    }

    // ── FORMULARIO ───────────────────────────────────────────────────────────
    async handleSubmit(e) {
        e.preventDefault();
        const soilType = document.getElementById('soilType').value;
        const ph = parseFloat(document.getElementById('phLevel').value);
        const goal = document.getElementById('goal').value;
        if (!soilType || !goal) { this.showToast('Completa los campos requeridos (*)', 'error'); return; }
        if (isNaN(ph) || ph < 0 || ph > 14) { this.showToast('El pH debe ser entre 0 y 14', 'error'); return; }

        this.currentData = {
            soilType, ph,
            fireHistory: document.getElementById('fireHistory').value || 'ninguno',
            compaction:  document.getElementById('compaction').value  || 'media',
            drainage:    document.getElementById('drainage').value    || 'moderado',
            erosion:     document.getElementById('erosion').value     || 'media',
            goal,
            region:    this.userRegion || document.getElementById('userRegion').value || '',
            latitude:  this.userLat   || document.getElementById('userLatitude').value  || '',
            longitude: this.userLng   || document.getElementById('userLongitude').value || ''
        };

        this.showLoading(true); this.hideResults();
        try {
            const analysis = await this.analyzeWithAI(this.currentData);
            this.currentResults = analysis;
            this.displayResults(analysis);
            this.showResults();
        } catch (err) {
            this.displayError('Error al analizar. Verifica tu conexión.');
        } finally {
            this.showLoading(false);
        }
    }

    // ── ANÁLISIS IA ──────────────────────────────────────────────────────────
    async analyzeWithAI(data) {
        const resp = await fetch(`${this.BASE_URL}/api/analyze`, {
            method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
            body: JSON.stringify({ data, lang: this.currentLang })
        });
        if (!resp.ok) { const e = await resp.json().catch(()=>({})); throw new Error(e.error || resp.status); }
        const ai = await resp.json();
        if (ai.error) throw new Error(ai.error);
        return this.formatAIResponse(ai, data);
    }

    formatAIResponse(ai, data) {
        return {
            phAnalysis:       ai.soilStatus?.phAnalysis    || '',
            soilHealth:       ai.soilStatus?.soilHealth    || '',
            mainIssues:       ai.soilStatus?.mainIssues    || [],
            salinity:         ai.soilStatus?.salinity      || null,
            nutrients:        ai.soilStatus?.nutrients     || null,
            pests:            ai.pests                     || null,
            immediateActions: ai.rehabilitation?.immediateActions || [],
            longTermActions:  ai.rehabilitation?.longTermActions  || [],
            amendments:       ai.rehabilitation?.amendments       || [],
            suitability:      ai.suitability               || { level:'N/A', score:50, message:'' },
            plants:           ai.plants                    || { reforestation:[], agriculture:[], coverCrops:[] },
            waterManagement:  ai.waterManagement           || null,
            careRoutine:      ai.careRoutine               || { soilCare:[], plantCare:[], schedule:'' },
            aiGenerated: true
        };
    }

    // ── RENDERIZADO DE RESULTADOS ─────────────────────────────────────────────
    displayResults(a) {
        const container = document.getElementById('resultsContent');
        if (!container) return;

        const colorMap  = { 'Óptimo':'#2e7d32', 'Aceptable':'#ff9800', 'Requiere rehabilitación':'#f44336', 'Crítico':'#b71c1c' };
        const salColors = { baja:'#2e7d32', media:'#ff9800', alta:'#f44336', 'muy alta':'#b71c1c' };
        const riskColors= { bajo:'#2e7d32', medio:'#ff9800', alto:'#f44336', crítico:'#b71c1c' };
        const sc = colorMap[a.suitability?.level] || '#666';
        const aiTag = `<span style="background:var(--accent-primary);color:white;font-size:.7rem;padding:2px 8px;border-radius:50px;margin-left:8px;">🤖 IA Real</span>`;

        let html = '';

        // 1 — Aptitud del suelo
        html += `<div class="results-section">
            <h4><i class="fas fa-chart-pie"></i> Aptitud del Suelo ${aiTag}</h4>
            <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin:.75rem 0;">
                <p style="color:${sc};font-weight:bold;font-size:1.4rem;margin:0;">${a.suitability?.level}</p>
                <div style="flex:1;min-width:120px;">
                    <div style="background:var(--border-color);border-radius:50px;height:10px;overflow:hidden;">
                        <div style="width:${a.suitability?.score}%;background:${sc};height:100%;border-radius:50px;transition:width 1.2s ease;"></div>
                    </div>
                    <small style="color:var(--text-secondary);">${Math.round(a.suitability?.score)}/100</small>
                </div>
            </div>
            <p style="color:var(--text-secondary);">${a.suitability?.message}</p>
        </div>`;

        // 2 — Análisis de pH y salud
        html += `<div class="results-section">
            <h4><i class="fas fa-flask"></i> Análisis Químico y Salud</h4>
            <p>${a.phAnalysis}</p>
            ${a.soilHealth ? `<p style="margin-top:.5rem;"><strong>Estado general:</strong> ${a.soilHealth}</p>` : ''}
            ${a.mainIssues?.length ? `<p style="margin-top:.6rem;"><strong>Problemas detectados:</strong> ${a.mainIssues.join('. ')}.</p>` : ''}
        </div>`;

        // 3 — Salinidad
        if (a.salinity) {
            const sal = a.salinity;
            const salC = salColors[(sal.level||'baja').toLowerCase()] || '#666';
            html += `<div class="results-section">
                <h4><i class="fas fa-tint"></i> Salinidad del Suelo</h4>
                <div style="display:flex;align-items:center;gap:1rem;margin:.5rem 0;flex-wrap:wrap;">
                    <span style="background:${salC};color:#fff;padding:.3rem .9rem;border-radius:50px;font-weight:700;font-size:.95rem;">${(sal.level||'').toUpperCase()}</span>
                    ${sal.estimatedDsM ? `<span style="color:var(--text-secondary);font-size:.9rem;">~${sal.estimatedDsM} dS/m</span>` : ''}
                </div>
                ${sal.impact ? `<p style="margin:.4rem 0;">${sal.impact}</p>` : ''}
                ${sal.recommendation ? `<p style="margin:.4rem 0;background:var(--accent-light);padding:.5rem .8rem;border-radius:10px;font-size:.9rem;"><strong>Recomendación:</strong> ${sal.recommendation}</p>` : ''}
            </div>`;
        }

        // 4 — Nutrientes
        if (a.nutrients) {
            const nut = a.nutrients;
            const nutIcon = (v) => v==='deficiente'?'🔴':v==='exceso'?'🟠':'🟢';
            html += `<div class="results-section">
                <h4><i class="fas fa-seedling"></i> Estado Nutricional</h4>
                <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;margin:.5rem 0;">
                    <div style="background:var(--accent-light);border-radius:12px;padding:.6rem;text-align:center;font-size:.85rem;">
                        <div>${nutIcon(nut.nitrogen)}</div><strong>Nitrógeno</strong><br><span style="color:var(--text-secondary);">${nut.nitrogen}</span>
                    </div>
                    <div style="background:var(--accent-light);border-radius:12px;padding:.6rem;text-align:center;font-size:.85rem;">
                        <div>${nutIcon(nut.phosphorus)}</div><strong>Fósforo</strong><br><span style="color:var(--text-secondary);">${nut.phosphorus}</span>
                    </div>
                    <div style="background:var(--accent-light);border-radius:12px;padding:.6rem;text-align:center;font-size:.85rem;">
                        <div>${nutIcon(nut.potassium)}</div><strong>Potasio</strong><br><span style="color:var(--text-secondary);">${nut.potassium}</span>
                    </div>
                </div>
                <div style="background:var(--accent-light);border-radius:12px;padding:.6rem;text-align:center;font-size:.85rem;margin-top:.4rem;">
                    <strong>Mat. Orgánica:</strong> ${nut.organicMatter}
                </div>
                ${nut.analysis ? `<p style="margin-top:.5rem;font-size:.88rem;color:var(--text-secondary);">${nut.analysis}</p>` : ''}
            </div>`;
        }

        // 5 — Plagas
        if (a.pests) {
            const pests = a.pests;
            const riskC = riskColors[(pests.riskLevel||'bajo').toLowerCase()] || '#666';
            html += `<div class="results-section">
                <h4><i class="fas fa-bug"></i> Análisis de Plagas y Enfermedades</h4>
                <div style="display:flex;align-items:center;gap:.75rem;margin:.5rem 0 .75rem;">
                    <span>Riesgo general:</span>
                    <span style="background:${riskC};color:#fff;padding:.25rem .8rem;border-radius:50px;font-weight:700;font-size:.85rem;">${(pests.riskLevel||'').toUpperCase()}</span>
                </div>
                ${pests.commonPests?.length ? pests.commonPests.map(p => {
                    const rc = riskColors['medio'] || '#ff9800';
                    return `<div style="background:var(--bg-secondary);border-radius:12px;padding:.7rem .9rem;margin-bottom:.5rem;border-left:3px solid ${rc};">
                        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem;flex-wrap:wrap;">
                            <strong>${p.name}</strong>
                            <span style="font-size:.72rem;background:var(--accent-light);border-radius:50px;padding:1px 8px;">${p.type}</span>
                        </div>
                        <p style="font-size:.83rem;color:var(--text-secondary);margin-bottom:.3rem;">${p.description}</p>
                        <p style="font-size:.82rem;color:var(--accent-primary);"><i class="fas fa-shield-alt"></i> ${p.control}</p>
                    </div>`;
                }).join('') : ''}
                ${pests.preventionTips?.length ? `<p style="margin-top:.5rem;"><strong>Prevención:</strong> ${pests.preventionTips.join('. ')}.</p>` : ''}
            </div>`;
        }

        // 6 — Plan de rehabilitación
        html += `<div class="results-section">
            <h4><i class="fas fa-tools"></i> Plan de Rehabilitación</h4>
            ${a.immediateActions?.length ? `<p><strong>⚡ Acciones inmediatas:</strong> ${a.immediateActions.join('. ')}.</p>` : ''}
            ${a.longTermActions?.length  ? `<p style="margin-top:.6rem;"><strong>📅 Largo plazo:</strong> ${a.longTermActions.join('. ')}.</p>` : ''}
            ${a.amendments?.length       ? `<p style="margin-top:.6rem;"><strong>🌾 Enmiendas:</strong> ${a.amendments.join('. ')}.</p>` : ''}
        </div>`;

        // 7 — Manejo hídrico
        if (a.waterManagement) {
            const wm = a.waterManagement;
            html += `<div class="results-section">
                <h4><i class="fas fa-water"></i> Manejo del Agua</h4>
                ${wm.irrigationType ? `<p><strong>Tipo de riego:</strong> ${wm.irrigationType}</p>` : ''}
                ${wm.frequency ? `<p style="margin-top:.4rem;"><strong>Frecuencia:</strong> ${wm.frequency}</p>` : ''}
                ${wm.tips?.length ? `<p style="margin-top:.4rem;">${wm.tips.join('. ')}.</p>` : ''}
            </div>`;
        }

        // 8 — Plantas recomendadas
        html += `<div class="results-section">
            <h4><i class="fas fa-leaf"></i> Plantas Recomendadas para tu Región</h4>`;

        if (a.plants?.reforestation?.length) {
            html += `<p style="margin-bottom:.5rem;"><strong>🌳 Reforestación / Nativas:</strong></p>
            <div class="plants-list">${a.plants.reforestation.map(p => `
                <div class="plant-card">
                    <strong>${p.name}</strong>
                    ${p.nativeRegion ? `<span style="font-size:.72rem;background:var(--accent-light);border-radius:50px;padding:1px 7px;margin-left:.3rem;">${p.nativeRegion}</span>` : ''}
                    <p style="font-size:.84rem;color:var(--text-secondary);margin:.25rem 0;">${p.reason}</p>
                    <small>💧 ${p.care}</small>
                    ${p.waterNeeds ? `<small style="margin-left:.5rem;">Agua: ${p.waterNeeds}</small>` : ''}
                </div>`).join('')}</div>`;
        }

        if (a.plants?.agriculture?.length) {
            html += `<p style="margin:.75rem 0 .5rem;"><strong>🌽 Agricultura / Cultivos:</strong></p>
            <div class="plants-list">${a.plants.agriculture.map(p => `
                <div class="plant-card">
                    <strong>${p.name}</strong>
                    <p style="font-size:.84rem;color:var(--text-secondary);margin:.25rem 0;">${p.reason}</p>
                    <small>💧 ${p.care}</small>
                    ${p.season ? `<small style="display:block;margin-top:.2rem;">📅 Siembra: ${p.season}</small>` : ''}
                    ${p.yield ? `<small style="display:block;">📦 Rendimiento: ${p.yield}</small>` : ''}
                </div>`).join('')}</div>`;
        }

        if (a.plants?.coverCrops?.length) {
            html += `<p style="margin:.75rem 0 .5rem;"><strong>🌱 Cultivos de cobertura:</strong></p>
            <div class="plants-list">${a.plants.coverCrops.map(p => `
                <div class="plant-card">
                    <strong>${p.name}</strong>
                    <p style="font-size:.84rem;color:var(--text-secondary);margin:.25rem 0;">${p.benefit}</p>
                    ${p.howToUse ? `<small>${p.howToUse}</small>` : ''}
                </div>`).join('')}</div>`;
        }
        html += `</div>`;

        // 9 — Rutina de cuidado
        if (a.careRoutine) {
            const cr = a.careRoutine;
            html += `<div class="results-section">
                <h4><i class="fas fa-calendar-check"></i> Rutina de Cuidado</h4>
                ${cr.soilCare?.length  ? `<p><strong>🌍 Suelo:</strong> ${cr.soilCare.join('. ')}.</p>` : ''}
                ${cr.plantCare?.length ? `<p style="margin-top:.4rem;"><strong>🌿 Plantas:</strong> ${cr.plantCare.join('. ')}.</p>` : ''}
                ${cr.schedule          ? `<p style="margin-top:.4rem;"><strong>📆 Calendario:</strong> ${cr.schedule}</p>` : ''}
            </div>`;
        }

        // 10 — Chat IA
        html += `<div class="results-section" id="chatSection">
            <h4><i class="fas fa-comments"></i> Habla con EcoChat</h4>
            <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:.75rem;">Tu asistente de IA para dudas sobre este diagnóstico, plagas, plantas o manejo del suelo</p>
            <div id="chatMessages" style="max-height:260px;overflow-y:auto;margin-bottom:.75rem;padding:.5rem;background:var(--bg-secondary);border-radius:12px;">
                <div style="margin-bottom:.75rem;"><span style="background:var(--accent-light);padding:.5rem .75rem;border-radius:12px 12px 12px 2px;display:inline-block;max-width:85%;font-size:.9rem;line-height:1.5;">¡Hola! Soy EcoChat 🌱 Pregúntame lo que quieras sobre tu diagnóstico.</span></div>
            </div>
            <div style="display:flex;gap:.5rem;">
                <input id="chatInput" type="text" placeholder="Ej: ¿Cómo controlo la salinidad en mi suelo?"
                    style="flex:1;padding:.6rem 1rem;border:2px solid var(--border-color);border-radius:50px;background:var(--input-bg);color:var(--text-primary);font-size:.9rem;outline:none;">
                <button id="sendChatBtn" style="background:var(--accent-primary);color:white;border:none;border-radius:50px;padding:.6rem 1.2rem;cursor:pointer;font-size:1rem;">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>`;

        container.innerHTML = html;
        document.getElementById('sendChatBtn')?.addEventListener('click', () => this.sendChatMessage());
        document.getElementById('chatInput')?.addEventListener('keydown', (e) => { if (e.key==='Enter') { e.preventDefault(); this.sendChatMessage(); } });
    }

    // ── CHAT ─────────────────────────────────────────────────────────────────
    async sendChatMessage() {
        const input = document.getElementById('chatInput');
        const msgs  = document.getElementById('chatMessages');
        if (!input || !msgs) return;
        const q = input.value.trim(); if (!q) return;
        input.value = '';
        msgs.innerHTML += `<div style="text-align:right;margin-bottom:.75rem;"><span style="background:var(--accent-primary);color:white;padding:.5rem .75rem;border-radius:12px 12px 2px 12px;display:inline-block;max-width:80%;font-size:.9rem;">${q}</span></div>`;
        const tid = 'typing-' + Date.now();
        msgs.innerHTML += `<div id="${tid}" style="margin-bottom:.75rem;"><span style="background:var(--accent-light);padding:.5rem .75rem;border-radius:12px 12px 12px 2px;display:inline-block;font-size:.9rem;"><i class="fas fa-spinner fa-spin"></i> Pensando...</span></div>`;
        msgs.scrollTop = msgs.scrollHeight;
        try {
            const ctx = this.currentData ? `Suelo:${this.currentData.soilType}, pH:${this.currentData.ph}, Región:${this.currentData.region}` : '';
            const resp = await fetch(`${this.BASE_URL}/api/chat`, {
                method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
                body: JSON.stringify({ question:q, context:ctx, lang:this.currentLang })
            });
            const d = await resp.json();
            document.getElementById(tid)?.remove();
            msgs.innerHTML += `<div style="margin-bottom:.75rem;"><span style="background:var(--accent-light);padding:.5rem .75rem;border-radius:12px 12px 12px 2px;display:inline-block;max-width:85%;font-size:.9rem;line-height:1.5;">${d.answer||'Sin respuesta.'}</span></div>`;
        } catch {
            document.getElementById(tid)?.remove();
            msgs.innerHTML += `<div style="margin-bottom:.75rem;"><span style="background:var(--accent-light);padding:.5rem .75rem;border-radius:12px;display:inline-block;font-size:.9rem;color:var(--error);">Error de conexión.</span></div>`;
        }
        msgs.scrollTop = msgs.scrollHeight;
    }

    // ── UI HELPERS ───────────────────────────────────────────────────────────
    displayError(msg) {
        const c = document.getElementById('resultsContent');
        if (c) c.innerHTML = `<div class="results-section" style="text-align:center;">
            <i class="fas fa-exclamation-triangle" style="font-size:3rem;color:var(--error);margin-bottom:1rem;display:block;"></i>
            <h4>Error</h4><p style="margin:.75rem 0;">${msg}</p>
            <button onclick="location.reload()" style="margin-top:1rem;padding:.5rem 1.5rem;background:var(--accent-primary);color:white;border:none;border-radius:50px;cursor:pointer;">Reintentar</button>
        </div>`;
        this.showResults();
    }

    showToast(msg, type='info') {
        document.querySelectorAll('.eco-toast').forEach(t => t.remove());
        const t = document.createElement('div');
        t.className = 'eco-toast';
        const icon = {success:'fa-check-circle',error:'fa-exclamation-circle',warning:'fa-exclamation-triangle',info:'fa-info-circle'}[type]||'fa-info-circle';
        const bdr  = {success:'#2e7d32',error:'#f44336',warning:'#ff9800',info:'#2196f3'}[type]||'#2196f3';
        t.innerHTML = `<i class="fas ${icon}"></i><span>${msg}</span>`;
        t.style.cssText = `position:fixed;bottom:24px;right:24px;background:var(--bg-card);color:var(--text-primary);padding:12px 20px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.15);z-index:3000;display:flex;align-items:center;gap:10px;border-left:4px solid ${bdr};max-width:340px;font-size:.9rem;animation:ecSlideIn .3s ease;`;
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); }, 4000);
    }

    showLoading(show, msg) {
        document.getElementById('loadingOverlay')?.classList.toggle('hidden', !show);
        if (show) { const lt = document.getElementById('loadingText'); if (lt) lt.textContent = msg || '🤖 IA analizando suelo y ubicación...'; }
    }

    showResults() {
        const c = document.getElementById('resultsContainer');
        if (c) { c.classList.remove('hidden'); setTimeout(()=>c.scrollIntoView({behavior:'smooth',block:'start'}),100); }
    }

    hideResults() { document.getElementById('resultsContainer')?.classList.add('hidden'); }

    // ── GENERADOR DE PDF ─────────────────────────────────────────────────────
    downloadPDF() {
        if (!this.currentResults) {
            this.showToast('Primero genera un diagnóstico para descargar el PDF', 'warning');
            return;
        }
        if (typeof window.jspdf === 'undefined') {
            this.showToast('Librería PDF no disponible. Verifica tu conexión.', 'error');
            return;
        }
        this.showToast('Generando PDF...', 'info');
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const a = this.currentResults;
            const d = this.currentData || {};
            const now = new Date();
            const fecha = now.toLocaleDateString('es-MX', { year:'numeric', month:'long', day:'numeric' });
            const userName = window.userData?.nombre || 'Usuario';

            // ── Paleta de colores (alineada a la paleta verde de EcoScan) ──
            const GREEN_DARK  = [30, 90, 40];
            const GREEN_MED   = [76, 175, 80];
            const GREEN_LIGHT = [232, 243, 233];
            const GRAY_DARK   = [40, 40, 40];
            const GRAY_MED    = [100, 100, 100];
            const GRAY_LIGHT  = [245, 247, 245];
            const WHITE       = [255, 255, 255];
            const BORDER      = [200, 220, 200];

            const PW  = 210; // page width A4
            const PH  = 297; // page height A4
            const ML  = 18;  // margin left
            const MR  = 18;  // margin right
            const CW  = PW - ML - MR; // content width
            let   Y   = 0;   // cursor Y
            let   secN = 0;  // contador de secciones numeradas

            // ── helpers ──────────────────────────────────────────────────────
            const checkPage = (needed = 15) => {
                if (Y + needed > PH - 20) { doc.addPage(); Y = 20; }
            };

            const drawRect = (x, y, w, h, r, fill) => {
                doc.setFillColor(...fill);
                doc.roundedRect(x, y, w, h, r, r, 'F');
            };

            // Encabezado de sección con badge numerado (en vez de emoji, que
            // las fuentes estándar de jsPDF no pueden dibujar correctamente)
            const sectionHeader = (title, color = GREEN_DARK) => {
                checkPage(18);
                secN += 1;
                drawRect(ML, Y, CW, 10, 2, GREEN_LIGHT);
                doc.setFillColor(...color);
                doc.circle(ML + 6.3, Y + 5, 3.6, 'F');
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...WHITE);
                doc.text(String(secN), ML + 6.3, Y + 6.4, { align: 'center' });
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...color);
                doc.text(title, ML + 14, Y + 6.8);
                Y += 13;
            };

            // Subtítulo con barra de acento vertical (reemplaza los prefijos con emoji)
            const subLabel = (text, color = GREEN_DARK) => {
                checkPage(7);
                doc.setFillColor(...color);
                doc.rect(ML + 2, Y - 3.3, 1.1, 4.3, 'F');
                doc.setFontSize(9.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...color);
                doc.text(text, ML + 6, Y);
                Y += 5;
            };

            const paragraph = (text, indent = 0, color = GRAY_DARK, size = 9.5) => {
                if (!text) return;
                checkPage(8);
                doc.setFontSize(size);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...color);
                const lines = doc.splitTextToSize(String(text), CW - indent - 2);
                doc.text(lines, ML + indent, Y);
                Y += lines.length * (size * 0.42) + 3;
            };

            const label = (key, val, indent = 0) => {
                if (!val) return;
                checkPage(7);
                doc.setFontSize(9.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...GREEN_DARK);
                doc.text(key + ':', ML + indent, Y);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...GRAY_DARK);
                const valLines = doc.splitTextToSize(String(val), CW - indent - 28);
                doc.text(valLines, ML + indent + 28, Y);
                Y += Math.max(valLines.length * 4, 5);
            };

            const bulletList = (items, indent = 4, color = GRAY_DARK) => {
                if (!items || !items.length) return;
                items.forEach(item => {
                    checkPage(6);
                    doc.setFontSize(9.2);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...color);
                    doc.setFillColor(...GREEN_MED);
                    doc.circle(ML + indent + 1.5, Y - 1, 1, 'F');
                    const lines = doc.splitTextToSize(String(item), CW - indent - 6);
                    doc.text(lines, ML + indent + 5, Y);
                    Y += lines.length * 4 + 1.5;
                });
            };

            const divider = () => {
                checkPage(5);
                doc.setDrawColor(...BORDER);
                doc.setLineWidth(0.3);
                doc.line(ML, Y, ML + CW, Y);
                Y += 5;
            };

            const badge = (text, x, y, bgColor, textColor = WHITE) => {
                const w = doc.getTextWidth(text) + 6;
                doc.setFillColor(...bgColor);
                doc.roundedRect(x, y - 4, w, 6, 2, 2, 'F');
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...textColor);
                doc.text(text, x + 3, y);
                return w;
            };

            const nutBadge = (label, val, x, y, w) => {
                const color = val === 'deficiente' ? [220, 53, 69] : val === 'exceso' ? [255, 152, 0] : [46, 125, 50];
                drawRect(x, y, w, 14, 3, GREEN_LIGHT);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...GREEN_DARK);
                doc.text(label, x + w/2, y + 5, { align: 'center' });
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...color);
                doc.text(val || 'N/A', x + w/2, y + 10, { align: 'center' });
            };

            // Pequeño brote/hoja dibujado con formas vectoriales (nunca falla,
            // a diferencia de un emoji que la fuente del PDF no puede mostrar)
            const drawSprout = (cx, cy, scale = 1) => {
                doc.setFillColor(...WHITE);
                doc.rect(cx - 0.55 * scale, cy - 2 * scale, 1.1 * scale, 9 * scale, 'F');
                doc.ellipse(cx - 4 * scale, cy - 1.5 * scale, 4 * scale, 2.4 * scale, 'F');
                doc.ellipse(cx + 4 * scale, cy - 4.5 * scale, 4 * scale, 2.4 * scale, 'F');
            };

            // Recorta texto para que quepa en UNA sola línea dentro de maxWidth,
            // añadiendo "…" si es necesario. Usa la medición real de jsPDF
            // (getTextWidth) con la fuente/tamaño activos en ese momento, así
            // nunca se desborda del recuadro sin importar el largo del texto.
            const fitOneLine = (text, maxWidth) => {
                if (!text) return '';
                let s = String(text);
                if (doc.getTextWidth(s) <= maxWidth) return s;
                while (s.length > 1 && doc.getTextWidth(s + '…') > maxWidth) {
                    s = s.slice(0, -1);
                }
                return s + '…';
            };

            // ═══════════════════════════════════════════════════════════════
            // PORTADA
            // ═══════════════════════════════════════════════════════════════
            // Fondo superior
            drawRect(0, 0, PW, 70, 0, GREEN_DARK);

            // Logo — brote vectorial en vez de emoji (compatibilidad garantizada)
            doc.setFillColor(...GREEN_MED);
            doc.circle(PW / 2, 28, 16, 'F');
            doc.setDrawColor(255, 255, 255);
            doc.setLineWidth(0.5);
            doc.circle(PW / 2, 28, 12.6, 'S');
            drawSprout(PW / 2, 31, 1);

            doc.setFontSize(28);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...WHITE);
            doc.text('EcoScan', PW / 2, 52, { align: 'center' });

            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(200, 230, 200);
            doc.text('Diagnóstico Inteligente de Suelos con IA', PW / 2, 59, { align: 'center' });

            // Tarjeta de datos
            Y = 80;
            drawRect(ML, Y, CW, 42, 4, GREEN_LIGHT);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...GREEN_DARK);
            doc.text('Informe generado para:', ML + 8, Y + 9);
            doc.setFontSize(13);
            doc.setTextColor(...GRAY_DARK);
            doc.text(userName, ML + 8, Y + 17);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...GRAY_MED);
            doc.text('Fecha:', ML + 8, Y + 24);
            doc.text(fecha, ML + 22, Y + 24);
            if (d.region) { doc.text('Región:', ML + 8, Y + 30); doc.text(fitOneLine(d.region, CW - 68), ML + 22, Y + 30); }
            doc.text('Tipo de suelo:', ML + 8, Y + 36);
            doc.text((d.soilType || 'N/A').charAt(0).toUpperCase() + (d.soilType||'').slice(1), ML + 38, Y + 36);

            // Score box
            const sc = a.suitability;
            const scColor = sc?.level === 'Óptimo' ? GREEN_DARK : sc?.level === 'Aceptable' ? [180, 100, 0] : [180, 40, 40];
            drawRect(ML + CW - 46, Y + 6, 40, 30, 4, WHITE);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...GRAY_MED);
            doc.text('APTITUD DEL SUELO', ML + CW - 46 + 20, Y + 12, { align: 'center' });
            doc.setFontSize(22);
            doc.setTextColor(...scColor);
            doc.text(String(Math.round(sc?.score || 0)), ML + CW - 46 + 20, Y + 24, { align: 'center' });
            doc.setFontSize(8);
            doc.setTextColor(...GRAY_MED);
            doc.text('/ 100', ML + CW - 46 + 20, Y + 30, { align: 'center' });

            Y += 52;

            // Nivel de aptitud badge grande
            badge((sc?.level || 'N/A').toUpperCase(), ML, Y, scColor);
            Y += 10;
            if (sc?.message) { paragraph(sc.message, 0, GRAY_MED, 9); }

            // Datos del suelo usados
            Y += 3;
            drawRect(ML, Y, CW, 22, 3, GRAY_LIGHT);
            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...GRAY_MED);
            const colW = CW / 3;
            doc.text(fitOneLine('pH: ' + (d.ph || 'N/A'), colW - 10), ML + 6, Y + 7);
            doc.text(fitOneLine('Compactación: ' + (d.compaction || 'N/A'), colW - 10), ML + colW + 6, Y + 7);
            doc.text(fitOneLine('Drenaje: ' + (d.drainage || 'N/A'), colW - 10), ML + colW * 2 + 6, Y + 7);
            doc.text(fitOneLine('Erosión: ' + (d.erosion || 'N/A'), colW - 10), ML + 6, Y + 14);
            doc.text(fitOneLine('Incendios: ' + (d.fireHistory || 'N/A'), colW - 10), ML + colW + 6, Y + 14);
            doc.text(fitOneLine('Objetivo: ' + (d.goal || 'N/A'), colW - 10), ML + colW * 2 + 6, Y + 14);
            Y += 28;

            // Nota IA (sin nombre de modelo específico, para que no quede desactualizada)
            drawRect(ML, Y, CW, 10, 2, [224, 242, 241]);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(0, 100, 80);
            doc.text('Análisis generado con IA, comparado con base de datos de suelos y datos satelitales', PW / 2, Y + 6.5, { align: 'center' });
            Y += 16;

            // ═══════════════════════════════════════════════════════════════
            // SECCIÓN: ANÁLISIS DEL SUELO
            // ═══════════════════════════════════════════════════════════════
            sectionHeader('ANÁLISIS QUÍMICO Y SALUD DEL SUELO');
            if (a.phAnalysis) { paragraph(a.phAnalysis, 2); Y += 1; }
            if (a.soilHealth) { label('Estado general', a.soilHealth, 2); Y += 1; }
            if (a.mainIssues?.length) {
                subLabel('Problemas detectados');
                bulletList(a.mainIssues, 5);
            }
            divider();

            // ═══════════════════════════════════════════════════════════════
            // SECCIÓN: SALINIDAD
            // ═══════════════════════════════════════════════════════════════
            if (a.salinity) {
                sectionHeader('SALINIDAD DEL SUELO');
                const sal = a.salinity;
                const salC = sal.level === 'alta' || sal.level === 'muy alta' ? [180, 40, 40] : sal.level === 'media' ? [180, 100, 0] : GREEN_DARK;
                badge((sal.level || 'N/A').toUpperCase(), ML + 2, Y + 4, salC);
                if (sal.estimatedDsM) {
                    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY_MED);
                    doc.text('~' + sal.estimatedDsM + ' dS/m', ML + 40, Y + 4);
                }
                Y += 9;
                if (sal.impact)          { paragraph(sal.impact, 2); }
                if (sal.recommendation)  { label('Recomendación', sal.recommendation, 2); }
                divider();
            }

            // ═══════════════════════════════════════════════════════════════
            // SECCIÓN: NUTRIENTES
            // ═══════════════════════════════════════════════════════════════
            if (a.nutrients) {
                sectionHeader('ESTADO NUTRICIONAL');
                const nut = a.nutrients;
                checkPage(20);
                const bw = (CW - 6) / 4;
                nutBadge('Nitrógeno', nut.nitrogen, ML,          Y, bw);
                nutBadge('Fósforo',   nut.phosphorus, ML + bw + 2, Y, bw);
                nutBadge('Potasio',   nut.potassium,  ML + (bw+2)*2, Y, bw);
                nutBadge('Mat. Org.', nut.organicMatter, ML + (bw+2)*3, Y, bw);
                Y += 18;
                if (nut.analysis) { paragraph(nut.analysis, 2, GRAY_MED); }
                divider();
            }

            // ═══════════════════════════════════════════════════════════════
            // SECCIÓN: PLAGAS
            // ═══════════════════════════════════════════════════════════════
            if (a.pests) {
                sectionHeader('ANÁLISIS DE PLAGAS Y ENFERMEDADES');
                const pests = a.pests;
                const riskC = pests.riskLevel === 'alto' || pests.riskLevel === 'crítico' ? [180, 40, 40] : pests.riskLevel === 'medio' ? [180, 100, 0] : GREEN_DARK;
                doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GRAY_DARK);
                doc.text('Riesgo general:', ML + 2, Y);
                badge((pests.riskLevel || 'N/A').toUpperCase(), ML + 34, Y + 1, riskC);
                Y += 9;
                if (pests.commonPests?.length) {
                    pests.commonPests.forEach((p, i) => {
                        const nameTxt = (i + 1) + '. ' + (p.name || '');
                        doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
                        const nameLines = doc.splitTextToSize(nameTxt, CW - 8 - 26); // deja espacio a la derecha para el badge de tipo
                        doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
                        const descLines = p.description ? doc.splitTextToSize(p.description, CW - 8) : [];
                        const ctrlLines = doc.splitTextToSize('Control: ' + (p.control || ''), CW - 8);

                        const nameH = nameLines.length * 4;
                        const descH = descLines.length * 4;
                        const ctrlH = ctrlLines.length * 4;
                        const cardH = nameH + descH + ctrlH + 7;

                        checkPage(cardH + 4);
                        drawRect(ML, Y, CW, cardH, 3, GRAY_LIGHT);

                        let ty = Y + 6;
                        doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GRAY_DARK);
                        doc.text(nameLines, ML + 4, ty);
                        badge(p.type || '', ML + 4 + doc.getTextWidth(nameLines[0] || '') + 3, ty, GREEN_MED);
                        ty += nameH;

                        if (descLines.length) {
                            doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY_MED);
                            doc.text(descLines, ML + 4, ty);
                            ty += descH;
                        }

                        doc.setFontSize(8.5); doc.setTextColor(30, 100, 40);
                        doc.text(ctrlLines, ML + 4, ty);

                        Y += cardH + 3;
                    });
                }
                if (pests.preventionTips?.length) {
                    subLabel('Consejos de prevención');
                    bulletList(pests.preventionTips, 5, GRAY_DARK);
                }
                divider();
            }

            // ═══════════════════════════════════════════════════════════════
            // SECCIÓN: PLAN DE REHABILITACIÓN
            // ═══════════════════════════════════════════════════════════════
            sectionHeader('PLAN DE REHABILITACIÓN');
            if (a.immediateActions?.length) {
                subLabel('Acciones inmediatas');
                bulletList(a.immediateActions, 5);
            }
            if (a.longTermActions?.length) {
                Y += 2;
                subLabel('Estrategias a largo plazo');
                bulletList(a.longTermActions, 5);
            }
            if (a.amendments?.length) {
                Y += 2;
                subLabel('Enmiendas recomendadas');
                bulletList(a.amendments, 5);
            }
            divider();

            // ═══════════════════════════════════════════════════════════════
            // SECCIÓN: MANEJO HÍDRICO
            // ═══════════════════════════════════════════════════════════════
            if (a.waterManagement) {
                sectionHeader('MANEJO DEL AGUA E IRRIGACIÓN');
                const wm = a.waterManagement;
                if (wm.irrigationType) { label('Tipo de riego recomendado', wm.irrigationType, 2); }
                if (wm.frequency)      { label('Frecuencia',               wm.frequency,      2); }
                if (wm.tips?.length)   { bulletList(wm.tips, 5); }
                divider();
            }

            // ═══════════════════════════════════════════════════════════════
            // SECCIÓN: PLANTAS RECOMENDADAS
            // ═══════════════════════════════════════════════════════════════
            sectionHeader('PLANTAS RECOMENDADAS PARA TU REGIÓN');
            if (a.plants?.reforestation?.length) {
                subLabel('Reforestación / Especies nativas');
                Y += 1;
                a.plants.reforestation.forEach(p => {
                    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
                    const nameLines = doc.splitTextToSize(p.name || '', CW - 8);
                    doc.setFontSize(8.2); doc.setFont('helvetica', 'normal');
                    const reasonLines = p.reason ? doc.splitTextToSize(p.reason, CW - 8) : [];
                    const careLines   = p.care   ? doc.splitTextToSize('Cuidados: ' + p.care, CW - 8) : [];

                    const nameH   = nameLines.length * 4;
                    const reasonH = reasonLines.length * 4;
                    const careH   = careLines.length * 4;
                    const cardH   = nameH + reasonH + careH + 5;

                    checkPage(cardH + 3);
                    drawRect(ML, Y, CW, cardH, 3, GREEN_LIGHT);

                    let ty = Y + 5;
                    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GRAY_DARK);
                    doc.text(nameLines, ML + 4, ty);
                    ty += nameH;

                    if (reasonLines.length) {
                        doc.setFontSize(8.2); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY_MED);
                        doc.text(reasonLines, ML + 4, ty);
                        ty += reasonH;
                    }
                    if (careLines.length) {
                        doc.setFontSize(8.2); doc.setTextColor(30, 100, 40);
                        doc.text(careLines, ML + 4, ty);
                    }

                    Y += cardH + 3;
                });
            }
            if (a.plants?.agriculture?.length) {
                Y += 2;
                subLabel('Agricultura / Cultivos recomendados');
                Y += 1;
                a.plants.agriculture.forEach(p => {
                    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
                    const nameLines = doc.splitTextToSize(p.name || '', CW - 8);
                    doc.setFontSize(8.2); doc.setFont('helvetica', 'normal');
                    const reasonLines = p.reason ? doc.splitTextToSize(p.reason, CW - 8) : [];

                    const extrasTxt = [
                        p.season ? 'Época: ' + p.season : null,
                        p.yield  ? 'Rinde: ' + p.yield   : null,
                        p.care   ? 'Cuidado: ' + p.care  : null,
                    ].filter(Boolean).join('   ·   ');
                    doc.setFontSize(7.5);
                    const extrasLines = extrasTxt ? doc.splitTextToSize(extrasTxt, CW - 8) : [];

                    const nameH   = nameLines.length * 4;
                    const reasonH = reasonLines.length * 4;
                    const extrasH = extrasLines.length * 3.6;
                    const cardH   = nameH + reasonH + extrasH + 6;

                    checkPage(cardH + 3);
                    drawRect(ML, Y, CW, cardH, 3, GREEN_LIGHT);

                    let ty = Y + 5;
                    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GRAY_DARK);
                    doc.text(nameLines, ML + 4, ty);
                    ty += nameH;

                    if (reasonLines.length) {
                        doc.setFontSize(8.2); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY_MED);
                        doc.text(reasonLines, ML + 4, ty);
                        ty += reasonH;
                    }
                    if (extrasLines.length) {
                        doc.setFontSize(7.5); doc.setTextColor(...GRAY_MED);
                        doc.text(extrasLines, ML + 4, ty);
                    }

                    Y += cardH + 3;
                });
            }
            if (a.plants?.coverCrops?.length) {
                Y += 2;
                subLabel('Cultivos de cobertura');
                a.plants.coverCrops.forEach(p => {
                    checkPage(12);
                    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GRAY_DARK);
                    const nameLines = doc.splitTextToSize('• ' + (p.name || ''), CW - 8);
                    doc.text(nameLines, ML + 4, Y);
                    Y += nameLines.length * 4;
                    if (p.benefit)   { paragraph(p.benefit, 6, GRAY_MED, 8.5); }
                    if (p.howToUse) { paragraph(p.howToUse, 6, [30,100,40], 8.2); }
                    Y += 1;
                });
            }
            divider();

            // ═══════════════════════════════════════════════════════════════
            // SECCIÓN: RUTINA DE CUIDADO
            // ═══════════════════════════════════════════════════════════════
            if (a.careRoutine) {
                sectionHeader('RUTINA Y CALENDARIO DE CUIDADO');
                const cr = a.careRoutine;
                if (cr.soilCare?.length) {
                    subLabel('Cuidado del suelo');
                    bulletList(cr.soilCare, 5);
                }
                if (cr.plantCare?.length) {
                    Y += 2;
                    subLabel('Cuidado de plantas');
                    bulletList(cr.plantCare, 5);
                }
                if (cr.schedule) {
                    Y += 2;
                    checkPage(14);
                    drawRect(ML, Y, CW, 12, 3, [224, 242, 224]);
                    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GREEN_DARK);
                    doc.text('Calendario:', ML + 4, Y + 5);
                    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY_DARK);
                    const calLines = doc.splitTextToSize(cr.schedule, CW - 32);
                    doc.text(calLines.slice(0, 1), ML + 26, Y + 5);
                    Y += 15;
                }
            }

            // ═══════════════════════════════════════════════════════════════
            // PIE DE PÁGINA en todas las páginas
            // ═══════════════════════════════════════════════════════════════
            const totalPages = doc.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                drawRect(0, PH - 14, PW, 14, 0, GREEN_DARK);
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...WHITE);
                doc.text('EcoScan — Diagnóstico de Suelos con IA', ML, PH - 6);
                doc.text('Página ' + i + ' de ' + totalPages, PW - ML, PH - 6, { align: 'right' });
                doc.text(fecha, PW / 2, PH - 6, { align: 'center' });
                // Línea decorativa en portada (pág 1)
                if (i === 1) {
                    doc.setDrawColor(...GREEN_MED);
                    doc.setLineWidth(0.8);
                    doc.line(ML, 72, ML + CW, 72);
                }
            }

            // Guardar
            const filename = 'EcoScan_Diagnostico_' + (d.region ? d.region.split(',')[0].replace(/\s+/g, '_') : 'Suelo') + '_' + now.getFullYear() + (now.getMonth()+1).toString().padStart(2,'0') + now.getDate() + '.pdf';
            doc.save(filename);
            this.showToast('✅ PDF descargado correctamente', 'success');
        } catch (err) {
            console.error('PDF error:', err);
            this.showToast('Error al generar el PDF: ' + err.message, 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => { window.ecoscan = new EcoScanApp(); });

const _s = document.createElement('style');
_s.textContent = `@keyframes ecSlideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}`;
document.head.appendChild(_s);
