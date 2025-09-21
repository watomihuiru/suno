// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
let currentViewName = 'generate', currentLibraryTab = 'all';
const modelMap = { "V4_5PLUS": "V4.5+", "V4_5": "V4.5", "V4": "V4", "V3_5": "V3.5" };
const modelLimits = {
    'V3_5': { prompt: 3000, style: 200 },
    'V4': { prompt: 3000, style: 200 },
    'V4_5': { prompt: 5000, style: 1000 },
    'V4_5PLUS': { prompt: 5000, style: 1000 },
    'title': 80,
    'songDescription': 200
};
let pollingInterval, playlist = [], currentTrackIndex = -1, isShuffled = false, isRepeatOne = false, currentLyrics = [];

// --- ГЛОБАЛЬНЫЕ ЭЛЕМЕНТЫ ---
let statusContainer, songListContainer, emptyListMessage, globalPlayer, lyricsModal;
let mobileMenuToggle, sidebar, sidebarOverlay;
let mobileLibraryToggle, libraryCard, libraryOverlay;

function formatTime(seconds) { if(isNaN(seconds)||seconds===null||!isFinite(seconds))return'0:00';const m=Math.floor(seconds/60),s=Math.floor(seconds%60);return`${m}:${s<10?"0":""}${s}`;}

// --- ЛОГИКА АВТОРИЗАЦИИ ---
async function handleLogin() {
    const loginElements = { 
        overlay: document.getElementById('login-overlay'), 
        container: document.getElementById('app-container'), 
        input: document.getElementById('access-key-input'), 
        button: document.getElementById('access-key-button'), 
        error: document.getElementById('login-error-message') 
    };

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: loginElements.input.value })
        });

        if (response.ok) {
            sessionStorage.setItem('is-authenticated', 'true');
            loginElements.overlay.style.display = 'none';
            const appTemplate = document.getElementById('app-template');
            loginElements.container.innerHTML = ''; 
            loginElements.container.appendChild(appTemplate.content.cloneNode(true));
            loginElements.container.style.display = 'block';
            initializeApp();
        } else {
            const result = await response.json();
            loginElements.error.textContent = result.message || 'Неверный ключ'; 
            loginElements.input.value = '';
        }
    } catch (error) {
        console.error('Ошибка при входе:', error);
        loginElements.error.textContent = 'Ошибка сети. Попробуйте снова.';
    }
}

// --- ГЛАВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ ---
function initializeApp() {
    statusContainer = document.getElementById("status-container");
    songListContainer = document.getElementById('song-list-container');
    emptyListMessage = document.getElementById('empty-list-message');
    globalPlayer = { container: document.getElementById("global-player"), audio: document.createElement('audio'), cover: document.getElementById("player-cover"), title: document.getElementById("player-title"), seekBar: document.getElementById("seek-bar"), playPauseBtn: document.getElementById("play-pause-btn"), currentTime: document.getElementById("current-time"), totalDuration: document.getElementById("total-duration"), prevBtn: document.getElementById('prev-btn'), nextBtn: document.getElementById('next-btn'), shuffleBtn: document.getElementById('shuffle-btn'), repeatBtn: document.getElementById('repeat-btn'), closeBtn: document.getElementById('close-player-btn'), currentSongId: null };
    lyricsModal = { overlay: document.getElementById('lyrics-modal-overlay'), content: document.getElementById('lyrics-modal-content'), closeBtn: document.getElementById('lyrics-modal-close') };
    
    mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    sidebar = document.querySelector('.sidebar');
    sidebarOverlay = document.getElementById('sidebar-overlay');
    mobileLibraryToggle = document.getElementById('mobile-library-toggle');
    libraryCard = document.querySelector('.library-card');
    libraryOverlay = document.getElementById('library-overlay');

    setupPlayerListeners();
    setupEventListeners();
    
    handleApiCall("/api/chat/credit", { method: "GET" }, true);
    loadSongsFromServer();
}

// --- ЛОГИКА ПЛЕЕРА И ПЕСЕН ---
async function refreshAudioUrlAndPlay(songId) {
    updateStatus(`⏳ Ссылка на аудио истекла, обновляю...`);
    try {
        const response = await fetch('/api/refresh-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: songId }) });
        if (!response.ok) throw new Error('Не удалось обновить URL');
        const result = await response.json();
        console.log('Получен новый URL:', result.newUrl);
        globalPlayer.audio.src = `/api/stream/${songId}`;
        const playPromise = globalPlayer.audio.play();
        if (playPromise !== undefined) { playPromise.catch(error => console.error("Ошибка авто-воспроизведения после обновления URL:", error)); }
        updateStatus(`✅ Ссылка обновлена, воспроизведение...`, true);
        setTimeout(() => updateStatus(''), 2000);
    } catch (error) {
        console.error('Ошибка при обновлении URL аудио:', error);
        updateStatus(`🚫 Не удалось обновить ссылку на аудио.`, false, true);
    }
}

function setupPlayerListeners() {
    globalPlayer.audio.onerror = (e) => { console.error("Ошибка аудио:", e); if (globalPlayer.currentSongId) { refreshAudioUrlAndPlay(globalPlayer.currentSongId); } };
    globalPlayer.playPauseBtn.onclick = () => { if (globalPlayer.audio.src) { if (globalPlayer.audio.paused) globalPlayer.audio.play(); else globalPlayer.audio.pause(); } };
    globalPlayer.audio.onplay = () => { globalPlayer.playPauseBtn.innerHTML = `<i class="fas fa-pause"></i>`; updateAllPlayIcons(); };
    globalPlayer.audio.onpause = () => { globalPlayer.playPauseBtn.innerHTML = `<i class="fas fa-play"></i>`; updateAllPlayIcons(); };
    globalPlayer.audio.onloadedmetadata = () => { globalPlayer.seekBar.max = globalPlayer.audio.duration; globalPlayer.totalDuration.textContent = formatTime(globalPlayer.audio.duration); };
    globalPlayer.audio.ontimeupdate = () => {
        globalPlayer.seekBar.value = globalPlayer.audio.currentTime;
        globalPlayer.currentTime.textContent = formatTime(globalPlayer.audio.currentTime);
        const progressPercent = (globalPlayer.audio.currentTime / globalPlayer.audio.duration) * 100;
        globalPlayer.seekBar.style.setProperty('--seek-before-width', `${progressPercent}%`);
        updateActiveLyric(globalPlayer.audio.currentTime);
    };
    globalPlayer.seekBar.addEventListener('input', () => {
        globalPlayer.audio.currentTime = globalPlayer.seekBar.value;
        const progressPercent = (globalPlayer.audio.currentTime / globalPlayer.audio.duration) * 100;
        globalPlayer.seekBar.style.setProperty('--seek-before-width', `${progressPercent}%`);
    });
    globalPlayer.audio.onended = () => { if (isRepeatOne) { globalPlayer.audio.currentTime = 0; globalPlayer.audio.play(); } else { playNext(); } };
    globalPlayer.nextBtn.onclick = playNext;
    globalPlayer.prevBtn.onclick = playPrevious;
    globalPlayer.shuffleBtn.onclick = () => { isShuffled = !isShuffled; globalPlayer.shuffleBtn.classList.toggle('active', isShuffled); };
    globalPlayer.repeatBtn.onclick = () => { isRepeatOne = !isRepeatOne; globalPlayer.repeatBtn.classList.toggle('active', isRepeatOne); };
    lyricsModal.closeBtn.onclick = () => { lyricsModal.overlay.style.display = 'none'; currentLyrics = []; };
    lyricsModal.overlay.onclick = (e) => { if (e.target === lyricsModal.overlay) { lyricsModal.overlay.style.display = 'none'; currentLyrics = []; } };

    globalPlayer.closeBtn.onclick = () => {
        globalPlayer.audio.pause();
        globalPlayer.audio.src = '';
        globalPlayer.currentSongId = null;
        globalPlayer.container.style.display = 'none';
        updateAllPlayIcons();
    };
}

function playSongByIndex(index) {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndex = index;
    const songData = playlist[currentTrackIndex].songData;
    globalPlayer.currentSongId = songData.id;
    globalPlayer.cover.src = songData.imageUrl || 'placeholder.png';
    globalPlayer.title.textContent = songData.title || 'Без названия';
    globalPlayer.audio.src = `/api/stream/${songData.id}`;
    globalPlayer.audio.play().catch(e => { if (e.name !== 'AbortError') { console.error("Ошибка воспроизведения:", e); } });
    globalPlayer.container.style.display = 'flex';
    updateAllPlayIcons();
}

function playNext() { if (playlist.length === 0) return; let nextIndex; if (isShuffled) { nextIndex = Math.floor(Math.random() * playlist.length); } else { nextIndex = (currentTrackIndex + 1) % playlist.length; } playSongByIndex(nextIndex); }
function playPrevious() { if (playlist.length === 0) return; let prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length; playSongByIndex(prevIndex); }

function updateAllPlayIcons() {
    document.querySelectorAll('.song-cover').forEach(el => {
        const id = el.id.replace('cover-', '');
        const playIconContainer = el.querySelector('.play-icon');
        el.classList.remove('playing', 'paused');
        if (id === globalPlayer.currentSongId && globalPlayer.audio.src) {
            playIconContainer.innerHTML = globalPlayer.audio.paused ? `<i class="fas fa-play"></i>` : `<i class="fas fa-pause"></i>`;
            el.classList.add(globalPlayer.audio.paused ? 'paused' : 'playing');
        } else {
            playIconContainer.innerHTML = `<i class="fas fa-play"></i>`;
        }
    });
}

async function downloadSong(event, url, filename) { event.preventDefault(); const button = event.currentTarget; const originalHTML = button.innerHTML; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Скачивание...'; button.style.cursor = 'wait'; try { const response = await fetch(url); const blob = await response.blob(); const blobUrl = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.style.display = 'none'; a.href = blobUrl; a.download = filename; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(blobUrl); a.remove(); } catch (error) { console.error('Download failed:', error); button.innerHTML = '<i class="fas fa-exclamation-circle"></i> Ошибка'; } finally { setTimeout(() => { button.innerHTML = originalHTML; button.style.cursor = 'pointer'; }, 1500); } }
function copyToClipboard(text, element) { navigator.clipboard.writeText(text).then(() => { const originalText = element.textContent; element.textContent = 'Скопировано!'; element.style.color = 'var(--accent-green)'; setTimeout(() => { element.textContent = originalText; element.style.color = ''; }, 1500); }); }
async function deleteSong(songId, cardElement) { try { await fetch(`/api/songs/${songId}`, { method: 'DELETE' }); cardElement.style.transition = 'opacity 0.3s, transform 0.3s'; cardElement.style.opacity = '0'; cardElement.style.transform = 'translateX(-20px)'; setTimeout(() => { cardElement.remove(); playlist = playlist.filter(p => p.songData.id !== songId); if (songListContainer.children.length === 1 && songListContainer.querySelector('#empty-list-message')) { emptyListMessage.style.display = 'block'; } else if (songListContainer.children.length === 0) {emptyListMessage.style.display = 'block';} }, 300); } catch (e) { console.error("Could not delete song", e); } }
async function toggleFavorite(songId, cardElement) { const songInfo = playlist.find(p => p.songData.id === songId); if (!songInfo) return; const newStatus = !songInfo.songData.is_favorite; try { await fetch(`/api/songs/${songId}/favorite`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_favorite: newStatus }) }); songInfo.songData.is_favorite = newStatus; cardElement.classList.toggle('is-favorite', newStatus); const favButton = cardElement.querySelector('.favorite-action'); if (favButton) { favButton.innerHTML = `<i class="${newStatus ? 'fas fa-heart' : 'far fa-heart'}"></i> ${newStatus ? 'Убрать из избранного' : 'В избранное'}`; } } catch(e) { console.error("Could not update favorite status", e); } }
async function showTimestampedLyrics(songId) { lyricsModal.content.innerHTML = '<p>Загрузка текста...</p>'; lyricsModal.overlay.style.display = 'flex'; try { const songInfo = playlist.find(p => p.songData.id === songId); const payload = { audioId: songId, taskId: songInfo?.requestParams?.taskId }; const response = await fetch('/api/lyrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const result = await response.json(); if (!response.ok || !result.data || !result.data.alignedWords || result.data.alignedWords.length === 0) { lyricsModal.content.textContent = songInfo ? (songInfo.songData.prompt || "Текст недоступен.") : "Текст недоступен."; currentLyrics = []; return; } currentLyrics = result.data.alignedWords.map(line => ({ text: line.word, startTime: line.startS })); lyricsModal.content.innerHTML = ''; currentLyrics.forEach((line, index) => { const p = document.createElement('p'); p.textContent = line.text; p.className = 'lyric-line'; p.dataset.index = index; lyricsModal.content.appendChild(p); }); } catch (error) { console.error("Ошибка загрузки текста:", error); lyricsModal.content.textContent = "Не удалось загрузить текст."; } }
function updateActiveLyric(currentTime) { if (currentLyrics.length === 0) return; let activeLineIndex = -1; for (let i = 0; i < currentLyrics.length; i++) { if (currentTime >= currentLyrics[i].startTime) { activeLineIndex = i; } else { break; } } if (activeLineIndex > -1) { document.querySelectorAll('.lyric-line.active').forEach(el => el.classList.remove('active')); const activeElement = document.querySelector(`.lyric-line[data-index="${activeLineIndex}"]`); if (activeElement) { activeElement.classList.add('active'); activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' }); } } }
function addSongToList(songInfo) {
    if (document.getElementById(`song-${songInfo.songData.id}`)) return;
    emptyListMessage.style.display = 'none';
    const { songData, requestParams } = songInfo;
    const card = document.createElement('div');
    card.className = 'song-card';
    card.id = `song-${songInfo.songData.id}`;
    card.classList.toggle('is-favorite', songData.is_favorite);
    const friendlyModelName = modelMap[requestParams?.model] || 'N/A';
    const downloadUrl = songData.audioUrl || songData.streamAudioUrl;
    const filename = `${songData.title || 'track'}.mp3`;
    card.innerHTML = `<div class="song-cover" id="cover-${songInfo.songData.id}"><img src="${songData.imageUrl}" alt="Обложка трека"><div class="song-duration">${formatTime(songData.duration)}</div><div class="play-icon"><i class="fas fa-play"></i></div></div><div class="song-info"><div><span class="song-title">${songData.title || 'Без названия'}</span><span class="song-model-tag">${friendlyModelName}</span></div><div class="song-style"><div class="song-style-content">${songData.tags || '(no styles)'}</div></div></div><div class="song-actions"><button class="menu-trigger"><i class="fas fa-ellipsis-v"></i></button><ul class="song-menu"></ul></div>`;
    if (!playlist.some(p => p.songData.id === songData.id)) {
        playlist.unshift(songInfo);
    }
    const songIndex = playlist.findIndex(p => p.songData.id === songData.id);
    card.querySelector('.song-cover').onclick = () => playSongByIndex(songIndex);
    card.querySelector('.song-title').onclick = () => copyToClipboard(songData.id, card.querySelector('.song-title'));
    const menu = card.querySelector('.song-menu');
    card.querySelector('.menu-trigger').onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.song-menu.active').forEach(m => { if (m !== menu) m.classList.remove('active') }); menu.classList.toggle('active'); };
    const menuItems = [ { icon: 'fas fa-download', text: 'Скачать', action: (e) => downloadSong(e, downloadUrl, filename) }, { icon: 'fas fa-file-alt', text: 'Текст', action: () => showTimestampedLyrics(songData.id) }, { icon: songData.is_favorite ? 'fas fa-heart' : 'far fa-heart', text: songData.is_favorite ? 'Убрать из избранного' : 'В избранное', action: () => toggleFavorite(songData.id, card), className: 'favorite-action' }, { icon: 'fas fa-trash', text: 'Удалить', action: () => deleteSong(songData.id, card), className: 'delete' } ];
    menuItems.forEach(item => { const li = document.createElement('li'); li.className = 'menu-item ' + (item.className || ''); li.innerHTML = `<i class="${item.icon}"></i> ${item.text}`; li.onclick = item.action; menu.appendChild(li); });
    songListContainer.appendChild(card);

    const styleContent = card.querySelector('.song-style-content');
    if (styleContent.scrollHeight > styleContent.clientHeight) {
        const showMoreBtn = document.createElement('button');
        showMoreBtn.textContent = 'Показать полностью';
        showMoreBtn.className = 'show-more-btn';
        showMoreBtn.onclick = (e) => {
            e.stopPropagation();
            const styleContainer = styleContent.parentElement;
            styleContainer.classList.toggle('expanded');
            showMoreBtn.textContent = styleContainer.classList.contains('expanded') ? 'Скрыть' : 'Показать полностью';
        };
        styleContent.parentElement.appendChild(showMoreBtn);
    }
}
function renderLibrary() { songListContainer.innerHTML = ''; const filteredPlaylist = (currentLibraryTab === 'favorites') ? playlist.filter(p => p.songData.is_favorite) : playlist; if (filteredPlaylist.length > 0) { emptyListMessage.style.display = 'none'; filteredPlaylist.forEach(addSongToList); } else { emptyListMessage.textContent = currentLibraryTab === 'favorites' ? 'У вас пока нет избранных треков.' : 'Здесь будут отображаться ваши песни.'; emptyListMessage.style.display = 'block'; } }
async function loadSongsFromServer() { try { const response = await fetch('/api/songs'); if (!response.ok) throw new Error('Network response was not ok'); playlist = await response.json(); renderLibrary(); } catch (e) { console.error("Не удалось загрузить песни с сервера", e); songListContainer.innerHTML = '<p id="empty-list-message" style="color: var(--accent-red);">Ошибка загрузки песен. Проверьте консоль.</p>'; } }
async function startPolling(taskId) { if (pollingInterval) clearInterval(pollingInterval); createPlaceholderCard(taskId); updateStatus(`⏳ Задача ${taskId.slice(0, 8)}... в очереди.`); pollingInterval = setInterval(async () => { try { const response = await fetch(`/api/task-status/${taskId}`); const result = await response.json(); document.getElementById("response-output").textContent = JSON.stringify(result, null, 2); if (!response.ok || !result.data) { throw new Error(result.message || "Некорректный ответ от API"); } const taskData = result.data; const statusLowerCase = taskData.status.toLowerCase(); const successStatuses = ["success", "completed", "text_success", "first_success"]; const pendingStatuses = ["pending", "running", "submitted", "queued"]; if (successStatuses.includes(statusLowerCase)) { if (statusLowerCase === 'success' || statusLowerCase === 'completed') { clearInterval(pollingInterval); updateStatus("✅ Задача выполнена!", true); document.getElementById(`placeholder-${taskId}`)?.remove(); await loadSongsFromServer(); await handleApiCall("/api/chat/credit", { method: "GET" }, true); } else { updateStatus(`⏳ Статус: ${taskData.status}...`); } } else if (pendingStatuses.includes(statusLowerCase)) { updateStatus(`⏳ Статус: ${taskData.status}...`); } else { throw new Error(taskData.errorMessage || `API вернул статус сбоя: ${taskData.status}`); } } catch (error) { clearInterval(pollingInterval); updateStatus(`🚫 Ошибка проверки: ${error.message}`, false, true); document.getElementById(`placeholder-${taskId}`)?.remove(); } }, 10000); }
function toggleCustomModeFields() { const isCustom = document.getElementById('g-customMode').checked; document.getElementById('simple-mode-fields').style.display = isCustom ? 'none' : 'flex'; document.getElementById('custom-mode-fields').style.display = isCustom ? 'flex' : 'none'; }
function setupSliderListeners() { document.querySelectorAll('input[type="range"]').forEach(slider => { const valueSpan = slider.nextElementSibling; if (valueSpan && valueSpan.classList.contains('slider-value')) { slider.addEventListener('input', () => { valueSpan.textContent = slider.value; }); } }); }

function updateCountersUI(element, limit) {
    const counter = document.getElementById(`${element.id}-counter`);
    if (counter) {
        const length = element.value.length;
        counter.textContent = `${length}/${limit}`;
        counter.classList.toggle('limit-exceeded', length > limit);
    }
}

function updateAllLimits() {
    const model = document.getElementById('g-model-value').value;
    const limits = modelLimits[model] || modelLimits['V4_5PLUS'];
    const fields = [
        { id: 'g-title', limit: modelLimits.title },
        { id: 'g-song-description', limit: modelLimits.songDescription },
        { id: 'g-style', limit: limits.style },
        { id: 'g-prompt', limit: limits.prompt }
    ];
    fields.forEach(field => {
        const element = document.getElementById(field.id);
        if (element) {
            element.maxLength = field.limit;
            updateCountersUI(element, field.limit);
        }
    });
}

function setupCharCounters() {
    ['g-title', 'g-song-description', 'g-style', 'g-prompt'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => updateCountersUI(element, element.maxLength));
        }
    });
}

function setupEventListeners() {
    const toggleSidebar = () => { sidebar.classList.toggle('is-open'); sidebarOverlay.classList.toggle('is-visible'); };
    mobileMenuToggle.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', toggleSidebar);
    const toggleLibrary = () => { libraryCard.classList.toggle('is-open'); libraryOverlay.classList.toggle('is-visible'); };
    mobileLibraryToggle.addEventListener('click', toggleLibrary);
    libraryOverlay.addEventListener('click', toggleLibrary);

    document.querySelectorAll('.sidebar-nav .nav-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const viewName = button.dataset.view;
            if (currentViewName === viewName) return;
            document.querySelectorAll('.main-content .view-content').forEach(view => view.classList.remove('active'));
            document.querySelectorAll('.sidebar-nav .nav-button').forEach(btn => btn.classList.remove('active'));
            document.getElementById(viewName).classList.add('active');
            event.currentTarget.classList.add('active');
            currentViewName = viewName;
            if (window.innerWidth <= 768) { toggleSidebar(); }
        });
    });

    setupSliderListeners();
    setupCharCounters();
    updateAllLimits();

    document.querySelectorAll('#library-tabs .tab-button').forEach(button => { button.addEventListener('click', (event) => { const filter = button.dataset.filter; currentLibraryTab = filter; document.querySelectorAll('#library-tabs .tab-button').forEach(btn => btn.classList.remove('active')); event.currentTarget.classList.add('active'); renderLibrary(); }); });
    const customModeToggle = document.getElementById("g-customMode");
    customModeToggle.addEventListener('change', toggleCustomModeFields);
    toggleCustomModeFields(); 
    const instrumentalToggle = document.getElementById("g-instrumental");
    const promptGroup = document.getElementById("g-prompt-group");
    const vocalGenderGroup = document.querySelector("#g-vocalGender").parentElement;
    function toggleInstrumentalFields() { const isInstrumental = instrumentalToggle.checked; promptGroup.style.display = isInstrumental ? 'none' : 'flex'; vocalGenderGroup.style.display = isInstrumental ? 'none' : 'flex'; }
    instrumentalToggle.addEventListener('change', toggleInstrumentalFields);
    toggleInstrumentalFields();

    document.getElementById("generate-music-form").addEventListener("submit", (e) => { e.preventDefault(); if (!validateGenerateForm()) return; const isCustom = document.getElementById("g-customMode").checked; const isInstrumental = document.getElementById("g-instrumental").checked; const payload = { model: document.getElementById("g-model-value").value, instrumental: isInstrumental, customMode: isCustom, styleWeight: parseFloat(document.getElementById('g-styleWeight').value), weirdnessConstraint: parseFloat(document.getElementById('g-weirdnessConstraint').value) }; if (isCustom) { payload.title = document.getElementById('g-title').value; payload.style = document.getElementById('g-style').value; payload.negativeTags = document.getElementById('g-negativeTags').value; if (!isInstrumental) { payload.prompt = document.getElementById('g-prompt').value; const vocalGender = document.getElementById('g-vocalGender').value; if(vocalGender) payload.vocalGender = vocalGender; } } else { payload.prompt = document.getElementById('g-song-description').value; } handleApiCall("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true); });
    document.getElementById("extend-music-form").addEventListener("submit", (e) => { e.preventDefault(); const payload = { audioId: document.getElementById("e-audioId").value, continueAt: document.getElementById("e-continueAt").value }; const fields = { title: 'e-title', style: 'e-style', prompt: 'e-prompt', negativeTags: 'e-negativeTags', styleWeight: 'e-styleWeight', weirdnessConstraint: 'e-weirdnessConstraint', audioWeight: 'e-audioWeight' }; for (const key in fields) { const element = document.getElementById(fields[key]); if (element.value) { payload[key] = (element.type === 'range') ? parseFloat(element.value) : element.value; } } handleApiCall("/api/generate/extend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true); });
    document.getElementById("upload-cover-form").addEventListener("submit", (e) => { e.preventDefault(); const payload = { uploadUrl: document.getElementById("uc-uploadUrl").value, instrumental: document.getElementById("uc-instrumental").checked }; const fields = { title: 'uc-title', style: 'uc-style', prompt: 'uc-prompt', negativeTags: 'uc-negativeTags', styleWeight: 'uc-styleWeight', weirdnessConstraint: 'uc-weirdnessConstraint', audioWeight: 'uc-audioWeight' }; for (const key in fields) { const element = document.getElementById(fields[key]); if (element.value) { payload[key] = (element.type === 'range') ? parseFloat(element.value) : element.value; } } handleApiCall("/api/generate/upload-cover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true); });
    document.getElementById("upload-extend-form").addEventListener("submit", (e) => { e.preventDefault(); const payload = { uploadUrl: document.getElementById("ue-uploadUrl").value, continueAt: document.getElementById("ue-continueAt").value }; const fields = { prompt: 'ue-prompt', audioWeight: 'ue-audioWeight' }; for (const key in fields) { const element = document.getElementById(fields[key]); if (element.value) { payload[key] = (element.type === 'range') ? parseFloat(element.value) : element.value; } } handleApiCall("/api/generate/upload-extend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true); });
    
    const boostButton = document.getElementById('boost-style-button');
    boostButton.addEventListener('click', async (e) => {
        e.preventDefault();
        const styleTextarea = document.getElementById('g-style');
        const currentStyle = styleTextarea.value.trim();
        if (!currentStyle) {
            styleTextarea.classList.add('input-error');
            setTimeout(() => styleTextarea.classList.remove('input-error'), 1000);
            return;
        }

        boostButton.disabled = true;
        boostButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const response = await fetch('/api/boost-style', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: currentStyle })
            });
            const result = await response.json();
            // *** ИЗМЕНЕНИЕ: Проверяем правильный путь к данным: result.data.result ***
            if (response.ok && result.data && result.data.result) {
                styleTextarea.value = result.data.result;
                styleTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                updateStatus(`🚫 Ошибка Boost: ${result.message || 'Не удалось улучшить стиль.'}`, false, true);
            }
        } catch (error) {
            updateStatus(`💥 Критическая ошибка Boost: ${error.message}`, false, true);
        } finally {
            boostButton.disabled = false;
            boostButton.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i>';
        }
    });

    const selectButton = document.getElementById("select-model-button"); 
    const selectDropdown = document.getElementById("select-model-dropdown"); 
    selectButton.addEventListener("click", e => { e.stopPropagation(); selectDropdown.classList.toggle("open"); }); 
    selectDropdown.addEventListener("click", e => { 
        if (e.target.classList.contains("select-option")) { 
            const currentSelected = selectDropdown.querySelector('.select-option.selected');
            if (currentSelected) { currentSelected.classList.remove('selected'); }
            e.target.classList.add('selected');
            document.getElementById("g-model-value").value = e.target.dataset.value; 
            selectButton.textContent = e.target.textContent; 
            selectDropdown.classList.remove("open");
            updateAllLimits();
        } 
    });
    window.addEventListener("click", () => { selectDropdown.classList.remove("open"); document.querySelectorAll('.song-menu.active').forEach(menu => menu.classList.remove('active')); });
}

function validateGenerateForm() { let isValid = true; const isCustom = document.getElementById("g-customMode").checked; const isInstrumental = document.getElementById("g-instrumental").checked; const fieldsToValidate = []; if (isCustom) { fieldsToValidate.push(document.getElementById('g-title')); fieldsToValidate.push(document.getElementById('g-style')); if (!isInstrumental) { fieldsToValidate.push(document.getElementById('g-prompt')); } } else { fieldsToValidate.push(document.getElementById('g-song-description')); } fieldsToValidate.forEach(field => { if (!field.value.trim()) { isValid = false; field.classList.add('input-error'); setTimeout(() => field.classList.remove('input-error'), 1000); } }); return isValid; }
function createPlaceholderCard(taskId) { const card = document.createElement('div'); card.className = 'song-card placeholder'; card.id = `placeholder-${taskId}`; card.innerHTML = `<div class="song-cover"><div class="song-duration">--:--</div></div><div class="song-info"><span class="song-title">Генерация...</span><span class="song-style">Пожалуйста, подождите</span><div class="progress-bar-container"><div class="progress-bar-inner"></div></div></div>`; songListContainer.prepend(card); }
function updateStatus(message, isSuccess = false, isError = false) { if(statusContainer) statusContainer.innerHTML = `<div class="status-message ${isSuccess ? 'success' : ''} ${isError ? 'error' : ''}">${message}</div>`; }
async function handleApiCall(endpoint, options, isCreditCheck = false, isGeneration = false) { const responseOutput = document.getElementById("response-output"); if(!isCreditCheck) { updateStatus('Ожидание запуска задачи...'); responseOutput.textContent = "Выполняется запрос..."; } if (pollingInterval && !isCreditCheck) clearInterval(pollingInterval); try { const response = await fetch(endpoint, options); const result = await response.json(); if (response.ok) { if(!isCreditCheck) responseOutput.textContent = JSON.stringify(result, null, 2); if (isCreditCheck && result.data !== undefined) { document.getElementById("credits-value").textContent = result.data; document.getElementById("credits-container").style.display = 'inline-flex'; } if (isGeneration && result.data && result.data.taskId) { startPolling(result.data.taskId); } else if (isGeneration) { updateStatus(`🚫 Ошибка запуска: ${result.message || 'Не удалось получить taskId.'}`, false, true); } } else { if(!isCreditCheck) responseOutput.textContent = `🚫 Ошибка ${response.status}:\n\n${JSON.stringify(result, null, 2)}`; updateStatus(`🚫 Ошибка запуска: ${result.message || 'Сервер вернул ошибку.'}`, false, true); } } catch (error) { if(!isCreditCheck) responseOutput.textContent = "💥 Сетевая ошибка:\n\n" + error.message; updateStatus(`💥 Критическая ошибка: ${error.message}`, false, true); } }

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('access-key-button').addEventListener('click', handleLogin);
    document.getElementById('access-key-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { handleLogin(); } });
    if (sessionStorage.getItem('is-authenticated') === 'true') {
        document.getElementById('login-overlay').style.display = 'none';
        const appTemplate = document.getElementById('app-template');
        const appContainer = document.getElementById('app-container');
        if (appContainer.children.length === 0) { appContainer.appendChild(appTemplate.content.cloneNode(true)); }
        appContainer.style.display = 'block';
        initializeApp();
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
});