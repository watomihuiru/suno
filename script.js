// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
const SECRET_KEY = 'messisipi'; // <<< ИЗМЕНИТЕ ЭТОТ КЛЮЧ НА СВОЙ !!!
let pollingInterval, currentTabName = 'generate', currentLibraryTab = 'all';
const modelMap = { "V4_5PLUS": "V4.5+", "V4_5": "V4.5", "V4": "V4", "V3_5": "V3.5" };

let playlist = []; let currentTrackIndex = -1; let isShuffled = false; let isRepeatOne = false;
let currentLyrics = [];

// --- ГЛОБАЛЬНЫЕ ЭЛЕМЕНТЫ ---
let statusContainer, songListContainer, emptyListMessage, globalPlayer, lyricsModal;

function formatTime(seconds) { if(isNaN(seconds)||seconds===null||!isFinite(seconds))return'0:00';const m=Math.floor(seconds/60),s=Math.floor(seconds%60);return`${m}:${s<10?"0":""}${s}`;}

// --- ЛОГИКА АВТОРИЗАЦИИ ---
function handleLogin() {
    const loginElements = { 
        overlay: document.getElementById('login-overlay'), 
        container: document.getElementById('app-container'), 
        input: document.getElementById('access-key-input'), 
        button: document.getElementById('access-key-button'), 
        error: document.getElementById('login-error-message') 
    };
    if (loginElements.input.value === SECRET_KEY) {
        sessionStorage.setItem('is-authenticated', 'true');
        loginElements.overlay.style.display = 'none';
        const appTemplate = document.getElementById('app-template');
        loginElements.container.innerHTML = ''; 
        loginElements.container.appendChild(appTemplate.content.cloneNode(true));
        loginElements.container.style.display = 'block';
        initializeApp();
    } else {
        loginElements.error.textContent = 'Неверный ключ'; 
        loginElements.input.value = '';
    }
}

// --- ГЛАВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ ---
function initializeApp() {
    statusContainer = document.getElementById("status-container");
    songListContainer = document.getElementById('song-list-container');
    emptyListMessage = document.getElementById('empty-list-message');
    globalPlayer = { container: document.getElementById("global-player"), audio: document.createElement('audio'), cover: document.getElementById("player-cover"), title: document.getElementById("player-title"), seekBar: document.getElementById("seek-bar"), playPauseBtn: document.getElementById("play-pause-btn"), currentTime: document.getElementById("current-time"), totalDuration: document.getElementById("total-duration"), prevBtn: document.getElementById('prev-btn'), nextBtn: document.getElementById('next-btn'), shuffleBtn: document.getElementById('shuffle-btn'), repeatBtn: document.getElementById('repeat-btn'), currentSongId: null };
    lyricsModal = { overlay: document.getElementById('lyrics-modal-overlay'), content: document.getElementById('lyrics-modal-content'), closeBtn: document.getElementById('lyrics-modal-close') };
    
    setupPlayerListeners();
    setupEventListeners();
    
    handleApiCall("/api/chat/credit", { method: "GET" }, true);
    loadSongsFromServer();
}

// --- ЛОГИКА ПЛЕЕРА И ПЕСЕН ---
function setupPlayerListeners() {
    globalPlayer.audio.onerror = (e) => { 
        console.error("Ошибка аудио:", e);
    };
    globalPlayer.playPauseBtn.onclick = () => { if (globalPlayer.audio.src) { if (globalPlayer.audio.paused) globalPlayer.audio.play(); else globalPlayer.audio.pause(); } };
    globalPlayer.audio.onplay = () => { globalPlayer.playPauseBtn.innerHTML = `<i class="fas fa-pause"></i>`; updateAllPlayIcons(); };
    globalPlayer.audio.onpause = () => { globalPlayer.playPauseBtn.innerHTML = `<i class="fas fa-play"></i>`; updateAllPlayIcons(); };
    globalPlayer.audio.onloadedmetadata = () => { globalPlayer.seekBar.max = globalPlayer.audio.duration; globalPlayer.totalDuration.textContent = formatTime(globalPlayer.audio.duration); };
    globalPlayer.audio.ontimeupdate = () => {
        globalPlayer.seekBar.value = globalPlayer.audio.currentTime;
        globalPlayer.currentTime.textContent = formatTime(globalPlayer.audio.currentTime);
        updateActiveLyric(globalPlayer.audio.currentTime);
    };
    // *** ИСПРАВЛЕНИЕ: Перемотка плеера ***
    globalPlayer.seekBar.oninput = () => (globalPlayer.audio.currentTime = globalPlayer.seekBar.value);
    globalPlayer.audio.onended = () => { if (isRepeatOne) { globalPlayer.audio.currentTime = 0; globalPlayer.audio.play(); } else { playNext(); } };
    globalPlayer.nextBtn.onclick = playNext;
    globalPlayer.prevBtn.onclick = playPrevious;
    globalPlayer.shuffleBtn.onclick = () => { isShuffled = !isShuffled; globalPlayer.shuffleBtn.classList.toggle('active', isShuffled); };
    globalPlayer.repeatBtn.onclick = () => { isRepeatOne = !isRepeatOne; globalPlayer.repeatBtn.classList.toggle('active', isRepeatOne); };
    lyricsModal.closeBtn.onclick = () => { lyricsModal.overlay.style.display = 'none'; currentLyrics = []; };
    lyricsModal.overlay.onclick = (e) => { if (e.target === lyricsModal.overlay) { lyricsModal.overlay.style.display = 'none'; currentLyrics = []; } };
}

function playSongByIndex(index) {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndex = index;
    const songData = playlist[currentTrackIndex].songData;
    globalPlayer.currentSongId = songData.id;
    globalPlayer.cover.src = songData.imageUrl || 'placeholder.png';
    globalPlayer.title.textContent = songData.title || 'Без названия';
    globalPlayer.audio.src = `/api/stream/${songData.id}`;
    globalPlayer.audio.play().catch(e => { 
        if (e.name !== 'AbortError') { 
            console.error("Ошибка воспроизведения:", e); 
        } 
    });
    globalPlayer.container.style.display = 'flex';
    updateAllPlayIcons();
}

function playNext() { if (playlist.length === 0) return; let nextIndex; if (isShuffled) { nextIndex = Math.floor(Math.random() * playlist.length); } else { nextIndex = (currentTrackIndex + 1) % playlist.length; } playSongByIndex(nextIndex); }
function playPrevious() { if (playlist.length === 0) return; let prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length; playSongByIndex(prevIndex); }

function updateAllPlayIcons() { document.querySelectorAll('.song-cover').forEach(el => { const id = el.id.replace('cover-', ''); el.classList.remove('playing', 'paused'); if (id === globalPlayer.currentSongId) { el.classList.add(globalPlayer.audio.paused ? 'paused' : 'playing'); } }); }

async function downloadSong(event, url, filename) { event.preventDefault(); const button = event.currentTarget; const originalHTML = button.innerHTML; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Скачивание...'; button.style.cursor = 'wait'; try { const response = await fetch(url); const blob = await response.blob(); const blobUrl = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.style.display = 'none'; a.href = blobUrl; a.download = filename; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(blobUrl); a.remove(); } catch (error) { console.error('Download failed:', error); button.innerHTML = '<i class="fas fa-exclamation-circle"></i> Ошибка'; } finally { setTimeout(() => { button.innerHTML = originalHTML; button.style.cursor = 'pointer'; }, 1500); } }

function copyToClipboard(text, element) { navigator.clipboard.writeText(text).then(() => { const originalText = element.textContent; element.textContent = 'Скопировано!'; element.style.color = 'var(--accent-green)'; setTimeout(() => { element.textContent = originalText; element.style.color = ''; }, 1500); }); }

async function deleteSong(songId, cardElement) { try { await fetch(`/api/songs/${songId}`, { method: 'DELETE' }); cardElement.style.transition = 'opacity 0.3s, transform 0.3s'; cardElement.style.opacity = '0'; cardElement.style.transform = 'translateX(-20px)'; setTimeout(() => { cardElement.remove(); playlist = playlist.filter(p => p.songData.id !== songId); if (songListContainer.children.length === 1 && songListContainer.querySelector('#empty-list-message')) { emptyListMessage.style.display = 'block'; } else if (songListContainer.children.length === 0) {emptyListMessage.style.display = 'block';} }, 300); } catch (e) { console.error("Could not delete song", e); } }

async function toggleFavorite(songId, cardElement) {
    const songInfo = playlist.find(p => p.songData.id === songId); if (!songInfo) return;
    const newStatus = !songInfo.songData.is_favorite;
    try {
        await fetch(`/api/songs/${songId}/favorite`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_favorite: newStatus }) });
        songInfo.songData.is_favorite = newStatus;
        cardElement.classList.toggle('is-favorite', newStatus);
        const favButton = cardElement.querySelector('.favorite-action');
        if (favButton) { favButton.innerHTML = `<i class="${newStatus ? 'fas fa-heart' : 'far fa-heart'}"></i> ${newStatus ? 'Убрать из избранного' : 'В избранное'}`; }
    } catch(e) { console.error("Could not update favorite status", e); }
}

async function showTimestampedLyrics(songId) {
    lyricsModal.content.innerHTML = '<p>Загрузка текста...</p>';
    lyricsModal.overlay.style.display = 'flex';
    try {
        const songInfo = playlist.find(p => p.songData.id === songId);
        const payload = { audioId: songId, taskId: songInfo?.requestParams?.taskId };
        const response = await fetch('/api/lyrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok || !result.data || !result.data.alignedWords || result.data.alignedWords.length === 0) {
            lyricsModal.content.textContent = songInfo ? (songInfo.songData.prompt || "Текст недоступен.") : "Текст недоступен.";
            currentLyrics = [];
            return;
        }
        currentLyrics = result.data.alignedWords.map(line => ({ text: line.word, startTime: line.startS }));
        lyricsModal.content.innerHTML = '';
        currentLyrics.forEach((line, index) => {
            const p = document.createElement('p'); p.textContent = line.text; p.className = 'lyric-line'; p.dataset.index = index; lyricsModal.content.appendChild(p);
        });
    } catch (error) { console.error("Ошибка загрузки текста:", error); lyricsModal.content.textContent = "Не удалось загрузить текст."; }
}

function updateActiveLyric(currentTime) {
    if (currentLyrics.length === 0) return;
    let activeLineIndex = -1;
    for (let i = 0; i < currentLyrics.length; i++) { if (currentTime >= currentLyrics[i].startTime) { activeLineIndex = i; } else { break; } }
    if (activeLineIndex > -1) {
        document.querySelectorAll('.lyric-line.active').forEach(el => el.classList.remove('active'));
        const activeElement = document.querySelector(`.lyric-line[data-index="${activeLineIndex}"]`);
        if (activeElement) { activeElement.classList.add('active'); activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
}

function addSongToList(songInfo) {
    if (document.getElementById(`song-${songInfo.songData.id}`)) return;
    emptyListMessage.style.display = 'none';
    const { songData, requestParams } = songInfo;
    const card = document.createElement('div');
    card.className = 'song-card'; card.id = `song-${songData.id}`; card.classList.toggle('is-favorite', songData.is_favorite);
    const friendlyModelName = modelMap[requestParams?.model] || 'N/A';
    const downloadUrl = songData.audioUrl || songData.streamAudioUrl;
    const filename = `${songData.title || 'track'}.mp3`;
    card.innerHTML = `<div class="song-cover" id="cover-${songData.id}"><img src="${songData.imageUrl}" alt="Обложка трека"><div class="song-duration">${formatTime(songData.duration)}</div><div class="play-icon"><i class="fas fa-play"></i></div></div><div class="song-info"><div><span class="song-title">${songData.title || 'Без названия'}</span><span class="song-model-tag">${friendlyModelName}</span></div><div class="song-style"><div class="song-style-content">${songData.tags || '(no styles)'}</div></div></div><div class="song-actions"><button class="menu-trigger"><i class="fas fa-ellipsis-v"></i></button><ul class="song-menu"></ul></div>`;
    if (!playlist.some(p => p.songData.id === songData.id)) { playlist.unshift(songInfo); }
    const songIndex = playlist.findIndex(p => p.songData.id === songData.id);
    card.querySelector('.song-cover').onclick = () => playSongByIndex(songIndex);
    card.querySelector('.song-title').onclick = () => copyToClipboard(songData.id, card.querySelector('.song-title'));
    const menu = card.querySelector('.song-menu');
    card.querySelector('.menu-trigger').onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.song-menu.active').forEach(m => { if (m !== menu) m.classList.remove('active') }); menu.classList.toggle('active'); };
    const menuItems = [ { icon: 'fas fa-download', text: 'Скачать', action: (e) => downloadSong(e, downloadUrl, filename) }, { icon: 'fas fa-file-alt', text: 'Текст', action: () => showTimestampedLyrics(songData.id) }, { icon: songData.is_favorite ? 'fas fa-heart' : 'far fa-heart', text: songData.is_favorite ? 'Убрать из избранного' : 'В избранное', action: () => toggleFavorite(songData.id, card), className: 'favorite-action' }, { icon: 'fas fa-trash', text: 'Удалить', action: () => deleteSong(songData.id, card), className: 'delete' } ];
    menuItems.forEach(item => { const li = document.createElement('li'); li.className = 'menu-item ' + (item.className || ''); li.innerHTML = `<i class="${item.icon}"></i> ${item.text}`; li.onclick = item.action; menu.appendChild(li); });
    songListContainer.prepend(card);
}

function renderLibrary() {
    songListContainer.innerHTML = '';
    const filteredPlaylist = (currentLibraryTab === 'favorites') ? playlist.filter(p => p.songData.is_favorite) : playlist;
    if (filteredPlaylist.length > 0) {
        emptyListMessage.style.display = 'none';
        filteredPlaylist.forEach(addSongToList);
    } else {
        emptyListMessage.textContent = currentLibraryTab === 'favorites' ? 'У вас пока нет избранных треков.' : 'Здесь будут отображаться ваши песни.';
        emptyListMessage.style.display = 'block';
    }
}

async function loadSongsFromServer() {
    try {
        const response = await fetch('/api/songs'); if (!response.ok) throw new Error('Network response was not ok');
        playlist = await response.json(); renderLibrary();
    } catch (e) { console.error("Не удалось загрузить песни с сервера", e); songListContainer.innerHTML = '<p id="empty-list-message" style="color: var(--accent-red);">Ошибка загрузки песен. Проверьте консоль.</p>'; }
}

async function startPolling(taskId) {
    if (pollingInterval) clearInterval(pollingInterval);
    createPlaceholderCard(taskId);
    updateStatus(`⏳ Задача ${taskId.slice(0, 8)}... в очереди.`);
    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/task-status/${taskId}`); const result = await response.json();
            document.getElementById("response-output").textContent = JSON.stringify(result, null, 2);
            if (!response.ok || !result.data) { throw new Error(result.message || "Некорректный ответ от API"); }
            const taskData = result.data; const statusLowerCase = taskData.status.toLowerCase();
            const successStatuses = ["success", "completed", "text_success", "first_success"];
            const pendingStatuses = ["pending", "running", "submitted", "queued"];
            if (successStatuses.includes(statusLowerCase)) {
                if (statusLowerCase === 'success' || statusLowerCase === 'completed') {
                    clearInterval(pollingInterval);
                    updateStatus("✅ Задача выполнена!", true);
                    document.getElementById(`placeholder-${taskId}`)?.remove();
                    await loadSongsFromServer();
                    await handleApiCall("/api/chat/credit", { method: "GET" }, true);
                } else {
                    updateStatus(`⏳ Статус: ${taskData.status}...`);
                }
            } else if (pendingStatuses.includes(statusLowerCase)) {
                updateStatus(`⏳ Статус: ${taskData.status}...`);
            } else { 
                throw new Error(taskData.errorMessage || `API вернул статус сбоя: ${taskData.status}`); 
            }
        } catch (error) {
            clearInterval(pollingInterval); updateStatus(`🚫 Ошибка проверки: ${error.message}`, false, true); document.getElementById(`placeholder-${taskId}`)?.remove();
        }
    }, 10000);
}

// *** ИСПРАВЛЕНИЕ: Новая функция для управления видимостью полей ***
function toggleCustomModeFields() {
    const isCustom = document.getElementById('g-customMode').checked;
    document.getElementById('simple-mode-fields').style.display = isCustom ? 'none' : 'flex';
    document.getElementById('custom-mode-fields').style.display = isCustom ? 'flex' : 'none';
}

function setupEventListeners() {
    document.querySelectorAll('.main-card .tabs .tab-button').forEach(button => { button.addEventListener('click', (event) => { const tabName = button.dataset.tab; if (currentTabName === tabName) return; document.querySelectorAll('.main-card .tab-content').forEach(tab => tab.classList.remove('active')); document.querySelectorAll('.main-card .tabs .tab-button').forEach(btn => btn.classList.remove('active')); document.getElementById(tabName).classList.add('active'); event.currentTarget.classList.add('active'); currentTabName = tabName; }); });
    document.querySelectorAll('#library-tabs .tab-button').forEach(button => { button.addEventListener('click', (event) => { const filter = button.dataset.filter; currentLibraryTab = filter; document.querySelectorAll('#library-tabs .tab-button').forEach(btn => btn.classList.remove('active')); event.currentTarget.classList.add('active'); renderLibrary(); }); });
    
    // *** ИСПРАВЛЕНИЕ: Логика переключателей ***
    const customModeToggle = document.getElementById("g-customMode");
    customModeToggle.addEventListener('change', toggleCustomModeFields);
    toggleCustomModeFields(); // Вызываем при инициализации, чтобы установить правильное состояние

    const instrumentalToggle = document.getElementById("g-instrumental");
    const promptGroup = document.getElementById("g-prompt-group");
    const vocalGenderGroup = document.querySelector("#g-vocalGender").parentElement;
    function toggleInstrumentalFields() {
        const isInstrumental = instrumentalToggle.checked;
        promptGroup.style.display = isInstrumental ? 'none' : 'flex';
        vocalGenderGroup.style.display = isInstrumental ? 'none' : 'flex';
    }
    instrumentalToggle.addEventListener('change', toggleInstrumentalFields);
    toggleInstrumentalFields();

    document.getElementById("generate-music-form").addEventListener("submit", (e) => { 
        e.preventDefault(); 
        if (!validateGenerateForm()) return;
        const isCustom = document.getElementById("g-customMode").checked;
        const isInstrumental = document.getElementById("g-instrumental").checked;
        const payload = { model: document.getElementById("g-model-value").value, instrumental: isInstrumental, customMode: isCustom, };
        if (isCustom) {
            payload.title = document.getElementById('g-title').value;
            payload.style = document.getElementById('g-style').value;
            payload.negativeTags = document.getElementById('g-negativeTags').value;
            if (!isInstrumental) {
                payload.prompt = document.getElementById('g-prompt').value;
                const vocalGender = document.getElementById('g-vocalGender').value;
                if(vocalGender) payload.vocalGender = vocalGender;
            }
        } else {
            payload.prompt = document.getElementById('g-song-description').value;
        }
        handleApiCall("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true); 
    });
    document.getElementById("extend-music-form").addEventListener("submit", (e) => { e.preventDefault(); const payload = { audioId: document.getElementById("e-audioId").value, continueAt: document.getElementById("e-continueAt").value, prompt: document.getElementById("e-prompt").value }; handleApiCall("/api/generate/extend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true); });
    document.getElementById("upload-cover-form").addEventListener("submit", (e) => { e.preventDefault(); const payload = { uploadUrl: document.getElementById("uc-uploadUrl").value, prompt: document.getElementById("uc-prompt").value }; handleApiCall("/api/generate/upload-cover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true); });
    document.getElementById("upload-extend-form").addEventListener("submit", (e) => { e.preventDefault(); const payload = { uploadUrl: document.getElementById("ue-uploadUrl").value, continueAt: document.getElementById("ue-continueAt").value }; handleApiCall("/api/generate/upload-extend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true); });
    document.getElementById("boost-style-form").addEventListener("submit", (e) => { e.preventDefault(); const payload = { content: document.getElementById("b-style-content").value }; handleApiCall("/api/boost-style", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true); });
    const selectButton = document.getElementById("select-model-button"); 
    const selectDropdown = document.getElementById("select-model-dropdown"); 
    selectButton.addEventListener("click", e => { e.stopPropagation(); selectDropdown.classList.toggle("open"); }); 
    selectDropdown.addEventListener("click", e => { 
        if (e.target.classList.contains("select-option")) { 
            const currentSelected = selectDropdown.querySelector('.select-option.selected');
            if (currentSelected) {
                currentSelected.classList.remove('selected');
            }
            e.target.classList.add('selected');
            document.getElementById("g-model-value").value = e.target.dataset.value; 
            selectButton.textContent = e.target.textContent; 
            selectDropdown.classList.remove("open");
        } 
    });
    window.addEventListener("click", () => { selectDropdown.classList.remove("open"); document.querySelectorAll('.song-menu.active').forEach(menu => menu.classList.remove('active')); });
}

function validateGenerateForm() {
    let isValid = true;
    const isCustom = document.getElementById("g-customMode").checked;
    const isInstrumental = document.getElementById("g-instrumental").checked;
    const fieldsToValidate = [];
    if (isCustom) {
        fieldsToValidate.push(document.getElementById('g-title'));
        fieldsToValidate.push(document.getElementById('g-style'));
        if (!isInstrumental) {
            fieldsToValidate.push(document.getElementById('g-prompt'));
        }
    } else {
        fieldsToValidate.push(document.getElementById('g-song-description'));
    }
    fieldsToValidate.forEach(field => {
        if (!field.value.trim()) {
            isValid = false;
            field.classList.add('input-error');
            setTimeout(() => field.classList.remove('input-error'), 1000);
        }
    });
    return isValid;
}

function createPlaceholderCard(taskId) { const card = document.createElement('div'); card.className = 'song-card placeholder'; card.id = `placeholder-${taskId}`; card.innerHTML = `<div class="song-cover"><div class="song-duration">--:--</div></div><div class="song-info"><span class="song-title">Генерация...</span><span class="song-style">Пожалуйста, подождите</span><div class="progress-bar-container"><div class="progress-bar-inner"></div></div></div>`; songListContainer.prepend(card); }
function updateStatus(message, isSuccess = false, isError = false) { if(statusContainer) statusContainer.innerHTML = `<div class="status-message ${isSuccess ? 'success' : ''} ${isError ? 'error' : ''}">${message}</div>`; }
async function handleApiCall(endpoint, options, isCreditCheck = false, isGeneration = false) {
    const responseOutput = document.getElementById("response-output");
    if(!isCreditCheck) { updateStatus('Ожидание запуска задачи...'); responseOutput.textContent = "Выполняется запрос..."; }
    if (pollingInterval && !isCreditCheck) clearInterval(pollingInterval);
    try {
        const response = await fetch(endpoint, options);
        const result = await response.json();
        if (response.ok) {
            if(!isCreditCheck) responseOutput.textContent = JSON.stringify(result, null, 2);
            if (isCreditCheck && result.data !== undefined) {
                document.getElementById("credits-value").textContent = result.data;
                document.getElementById("credits-container").style.display = 'inline-flex';
            }
            if (isGeneration && result.data && result.data.taskId) { startPolling(result.data.taskId); } 
            else if (isGeneration) { updateStatus(`🚫 Ошибка запуска: ${result.message || 'Не удалось получить taskId.'}`, false, true); }
        } else {
            if(!isCreditCheck) responseOutput.textContent = `🚫 Ошибка ${response.status}:\n\n${JSON.stringify(result, null, 2)}`;
            updateStatus(`🚫 Ошибка запуска: ${result.message || 'Сервер вернул ошибку.'}`, false, true);
        }
    } catch (error) {
        if(!isCreditCheck) responseOutput.textContent = "💥 Сетевая ошибка:\n\n" + error.message;
        updateStatus(`💥 Критическая ошибка: ${error.message}`, false, true);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('access-key-button').addEventListener('click', handleLogin);
    document.getElementById('access-key-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });
    if (sessionStorage.getItem('is-authenticated') === 'true') {
        document.getElementById('login-overlay').style.display = 'none';
        const appTemplate = document.getElementById('app-template');
        const appContainer = document.getElementById('app-container');
        if (appContainer.children.length === 0) {
            appContainer.appendChild(appTemplate.content.cloneNode(true));
        }
        appContainer.style.display = 'block';
        initializeApp();
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
});