// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
const SECRET_KEY = 'messisipi'; // <<< !!! ИЗМЕНИТЕ ЭТОТ КЛЮЧ НА СВОЙ !!!
let pollingInterval; let currentTabName = 'generate';
const modelMap = { "V4_5PLUS": "V4.5+", "V4_5": "V4.5", "V4": "V4", "V3_5": "V3.5" };

let playlist = [];
let currentTrackIndex = -1;
let isShuffled = false;
let isRepeatOne = false;

// --- ГЛОБАЛЬНЫЕ ЭЛЕМЕНТЫ (будут определены после инициализации) ---
let customModeToggle, simpleModeFields, customModeFields, modelValueInput, selectButton, selectDropdown, styleTextarea, promptTextarea, instrumentalToggle, promptGroup, descriptionGroup, statusContainer, songListContainer, emptyListMessage, logsNotificationDot, globalPlayer, lyricsModal, titleInput, styleInput, promptInput, descriptionInput;

function formatTime(seconds) { if(isNaN(seconds)||seconds===null||!isFinite(seconds))return'--:--';const m=Math.floor(seconds/60),s=Math.floor(seconds%60);return`${m}:${s<10?"0":""}${s}`;}

// --- ЛОГИКА АВТОРИЗАЦИИ ---
function handleLogin() {
    const loginElements = { overlay: document.getElementById('login-overlay'), container: document.getElementById('app-container'), input: document.getElementById('access-key-input'), button: document.getElementById('access-key-button'), error: document.getElementById('login-error-message') };
    if (loginElements.input.value === SECRET_KEY) {
        loginElements.overlay.style.display = 'none';
        const appTemplate = document.getElementById('app-template');
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
    // Query all elements now that the app container is visible
    customModeToggle=document.getElementById("g-customMode"); simpleModeFields=document.getElementById("simple-mode-fields"); customModeFields=document.getElementById("custom-mode-fields"); modelValueInput=document.getElementById("g-model-value"); selectButton=document.getElementById("select-model-button"); selectDropdown=document.getElementById("select-model-dropdown"); styleTextarea=document.getElementById("g-style"); promptTextarea=document.getElementById("g-prompt"); instrumentalToggle=document.getElementById("g-instrumental"); promptGroup=document.getElementById("g-prompt-group"); descriptionGroup=document.getElementById("g-song-description-group"); statusContainer=document.getElementById("status-container"); songListContainer = document.getElementById('song-list-container'); emptyListMessage = document.getElementById('empty-list-message'); logsNotificationDot = document.getElementById('logs-notification-dot');
    globalPlayer={container:document.getElementById("global-player"),audio:document.createElement('audio'),cover:document.getElementById("player-cover"),title:document.getElementById("player-title"),seekBar:document.getElementById("seek-bar"),playPauseBtn:document.getElementById("play-pause-btn"),currentTime:document.getElementById("current-time"),totalDuration:document.getElementById("total-duration"),prevBtn: document.getElementById('prev-btn'), nextBtn: document.getElementById('next-btn'), shuffleBtn: document.getElementById('shuffle-btn'), repeatBtn: document.getElementById('repeat-btn'),currentSongId:null};
    lyricsModal = { overlay: document.getElementById('lyrics-modal-overlay'), content: document.getElementById('lyrics-modal-content'), closeBtn: document.getElementById('lyrics-modal-close') };
    titleInput = document.getElementById('g-title'); styleInput = document.getElementById('g-style'); promptInput = document.getElementById('g-prompt'); descriptionInput = document.getElementById('g-song-description');

    // --- ЛОГИКА ПЛЕЕРА ---
    function playSongByIndex(index) {
        currentTrackIndex = index;
        const songData = playlist[currentTrackIndex].songData;
        globalPlayer.currentSongId = songData.id;
        globalPlayer.cover.src = songData.imageUrl;
        globalPlayer.title.textContent = songData.title || 'Без названия';
        globalPlayer.audio.src = songData.streamAudioUrl;
        globalPlayer.audio.play();
        globalPlayer.container.style.display = 'flex';
        updateAllPlayIcons();
    }

    function playNext() {
        if (playlist.length === 0) return;
        let nextIndex;
        if (isShuffled) { nextIndex = Math.floor(Math.random() * playlist.length); } 
        else { nextIndex = (currentTrackIndex + 1) % playlist.length; }
        playSongByIndex(nextIndex);
    }

    function playPrevious() {
        if (playlist.length === 0) return;
        let prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
        playSongByIndex(prevIndex);
    }

    async function refreshSongUrl(songId) {
        try {
            const response = await fetch('/api/refresh-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: songId }) });
            if (!response.ok) throw new Error('Failed to refresh URL');
            const data = await response.json();
            const songIndex = playlist.findIndex(p => p.songData.id === songId);
            if (songIndex > -1) {
                playlist[songIndex].songData.streamAudioUrl = data.newUrl;
                if(globalPlayer.currentSongId === songId) { globalPlayer.audio.src = data.newUrl; globalPlayer.audio.play(); }
            }
        } catch (error) { console.error("Couldn't refresh URL:", error); }
    }
    
    globalPlayer.audio.onerror = () => { if(globalPlayer.currentSongId) { refreshSongUrl(globalPlayer.currentSongId); } };
    globalPlayer.playPauseBtn.onclick=()=>{if(globalPlayer.audio.src){if(globalPlayer.audio.paused)globalPlayer.audio.play();else globalPlayer.audio.pause();}};
    globalPlayer.audio.onplay=()=>{globalPlayer.playPauseBtn.innerHTML=`<i class="fas fa-pause"></i>`; updateAllPlayIcons();};
    globalPlayer.audio.onpause=()=>{globalPlayer.playPauseBtn.innerHTML=`<i class="fas fa-play"></i>`; updateAllPlayIcons();};
    globalPlayer.audio.onloadedmetadata=()=>{globalPlayer.seekBar.max=globalPlayer.audio.duration;globalPlayer.totalDuration.textContent=formatTime(globalPlayer.audio.duration);};
    globalPlayer.audio.ontimeupdate=()=>{globalPlayer.seekBar.value=globalPlayer.audio.currentTime;globalPlayer.currentTime.textContent=formatTime(globalPlayer.audio.currentTime);};
    globalPlayer.seekBar.oninput=()=>(globalPlayer.audio.currentTime=globalPlayer.seekBar.value);
    globalPlayer.audio.onended = () => { if(isRepeatOne) { globalPlayer.audio.currentTime = 0; globalPlayer.audio.play(); } else { playNext(); }};
    globalPlayer.nextBtn.onclick = playNext;
    globalPlayer.prevBtn.onclick = playPrevious;
    globalPlayer.shuffleBtn.onclick = () => { isShuffled = !isShuffled; globalPlayer.shuffleBtn.classList.toggle('active', isShuffled); };
    globalPlayer.repeatBtn.onclick = () => { isRepeatOne = !isRepeatOne; globalPlayer.repeatBtn.classList.toggle('active', isRepeatOne); };

    function updateAllPlayIcons() {
        document.querySelectorAll('.song-cover').forEach(el => {
            const id = el.id.replace('cover-', '');
            el.classList.remove('playing', 'paused');
            if (id === globalPlayer.currentSongId) { el.classList.add(globalPlayer.audio.paused ? 'paused' : 'playing'); }
        });
    }
    
    async function downloadSong(event, url, filename) {
        event.preventDefault(); const button = event.currentTarget; const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Скачивание...'; button.style.cursor = 'wait';
        try {
            const response = await fetch(url); const blob = await response.blob(); const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.style.display = 'none'; a.href = blobUrl; a.download = filename;
            document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(blobUrl); a.remove();
        } catch (error) { console.error('Download failed:', error); button.innerHTML = '<i class="fas fa-exclamation-circle"></i> Ошибка';
        } finally { setTimeout(() => { button.innerHTML = originalHTML; button.style.cursor = 'pointer'; }, 1500); }
    }

    function showLyrics(promptText) {
        lyricsModal.content.textContent = promptText;
        lyricsModal.overlay.style.display = 'flex';
    }
    lyricsModal.closeBtn.onclick = () => lyricsModal.overlay.style.display = 'none';
    lyricsModal.overlay.onclick = (e) => { if (e.target === lyricsModal.overlay) lyricsModal.overlay.style.display = 'none'; };

    function copyToClipboard(text, element) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = element.textContent;
            element.textContent = 'Скопировано!'; element.style.color = 'var(--accent-green)';
            setTimeout(() => { element.textContent = originalText; element.style.color = ''; }, 1500);
        });
    }
    
    async function deleteSong(songId, cardElement) {
        try {
            const response = await fetch(`/api/songs/${songId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete');
            cardElement.style.transition = 'opacity 0.3s, transform 0.3s';
            cardElement.style.opacity = '0'; cardElement.style.transform = 'translateX(-20px)';
            setTimeout(() => { 
                cardElement.remove();
                playlist = playlist.filter(p => p.songData.id !== songId);
            }, 300);
        } catch (e) { console.error("Could not delete song", e); }
    }
    
    function addSongToList(songInfo) {
        if (emptyListMessage) emptyListMessage.style.display = 'none';
        const { songData, requestParams } = songInfo;
        const card = document.createElement('div'); card.className = 'song-card'; card.id = `song-${songData.id}`;
        let friendlyModelName = 'v4';
        try { const params = JSON.parse(requestParams); friendlyModelName = modelMap[params.model] || params.model; } catch(e) {}
        const downloadUrl = songData.audioUrl || songData.streamAudioUrl; const filename = `${songData.title || 'track'}.mp3`;
        card.innerHTML = `<div class="song-cover" id="cover-${songData.id}"><img src="${songData.imageUrl}" alt="Обложка трека"><div class="song-duration">${formatTime(songData.duration)}</div><div class="play-icon"><i class="fas fa-play"></i></div></div><div class="song-info"><div><span class="song-title">${songData.title || 'Без названия'}</span><span class="song-model-tag">${friendlyModelName}</span></div><div class="song-style"><div class="song-style-content">${songData.tags || '(no styles)'}</div></div></div><div class="song-actions"><button class="menu-trigger"><i class="fas fa-ellipsis-v"></i></button><ul class="song-menu"></ul></div>`;
        
        const songIndex = playlist.findIndex(p => p.songData.id === songData.id);
        card.querySelector('.song-cover').onclick = () => playSongByIndex(songIndex);
        
        const titleEl = card.querySelector('.song-title');
        titleEl.onclick = () => copyToClipboard(songData.id, titleEl);

        const menu = card.querySelector('.song-menu');
        const menuTrigger = card.querySelector('.menu-trigger');
        menuTrigger.onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.song-menu.active').forEach(m => {if (m !== menu) m.classList.remove('active')}); menu.classList.toggle('active'); };
        
        const menuItems = [
            { icon: 'fa-download', text: 'Скачать', action: (e) => downloadSong(e, downloadUrl, filename) },
            { icon: 'fa-file-alt', text: 'Текст', action: () => showLyrics(songData.prompt) },
            { icon: 'fa-heart', text: 'В избранное', action: () => console.log('Favorite clicked') },
            { icon: 'fa-trash', text: 'Удалить', action: () => deleteSong(songData.id, card), className: 'delete' }
        ];

        menuItems.forEach(item => {
            const li = document.createElement('li');
            li.className = 'menu-item ' + (item.className || '');
            li.innerHTML = `<i class="fas ${item.icon}"></i> ${item.text}`;
            li.onclick = item.action;
            menu.appendChild(li);
        });

        songListContainer.appendChild(card);

        setTimeout(() => {
            const styleContent = card.querySelector('.song-style-content');
            if (styleContent && styleContent.scrollHeight > styleContent.clientHeight) {
                styleContent.classList.add('collapsed'); const toggleBtn = document.createElement('button');
                toggleBtn.className = 'toggle-description-btn'; toggleBtn.textContent = '[ развернуть ]';
                toggleBtn.onclick = () => { const isCollapsed = styleContent.classList.toggle('collapsed'); toggleBtn.textContent = isCollapsed ? '[ развернуть ]' : '[ свернуть ]'; };
                styleContent.parentElement.appendChild(toggleBtn);
            }
        }, 10);
    }

    async function startPolling(taskId) {
        if (pollingInterval) clearInterval(pollingInterval); createPlaceholderCard(taskId);
        updateStatus(`⏳ Задача ${taskId.slice(0,8)}... в очереди. Начинаем проверку...`); let progress = 0;
        pollingInterval = setInterval(async () => {
            const progressBar = document.getElementById(`progress-${taskId}`);
            if (progress < 95) { progress += 5; if(progressBar) progressBar.style.width = `${progress}%`; }
            try {
                const response = await fetch(`/api/task-status/${taskId}`); const result = await response.json();
                document.getElementById("response-output").textContent = JSON.stringify(result, null, 2);
                if (!response.ok) { handleTaskError(taskId, result.message || `Ошибка сервера: ${response.status}`); return; }
                if (!result.data) { handleTaskError(taskId, "Получен некорректный ответ от API (отсутствует поле 'data')."); return; }
                const taskData = result.data; const statusLowerCase = taskData.status.toLowerCase();
                const successStates = ["success", "completed"];
                const pendingStates = ["pending", "running", "submitted", "queued", "text_success", "first_success"];
                if (successStates.includes(statusLowerCase)) {
                    clearInterval(pollingInterval);
                    if(progressBar) progressBar.style.width = `100%`;
                    updateStatus("✅ Задача выполнена!", true);
                    const placeholder = document.getElementById(`placeholder-${taskId}`);
                    if(placeholder) placeholder.remove();
                    await loadSongsFromServer();
                    await handleApiCall("/api/chat/credit", { method: "GET" }, true);
                } else if (pendingStates.includes(statusLowerCase)) {
                    updateStatus(`⏳ Статус: ${taskData.status}. Следующая проверка через 10 сек...`);
                } else { handleTaskError(taskId, taskData.errorMessage || `API вернул статус сбоя: ${taskData.status}`); }
            } catch (error) { handleTaskError(taskId, "Сетевая ошибка или ошибка парсинга ответа."); }
        }, 10000);
    }
    
    async function loadSongsFromServer() {
        try {
            const response = await fetch('/api/songs');
            const songs = await response.json();
            songListContainer.innerHTML = '';
            playlist = songs;
            if (songs.length > 0) {
                emptyListMessage.style.display = 'none';
                songs.forEach(songInfo => addSongToList(songInfo));
            } else {
                songListContainer.innerHTML = '<p id="empty-list-message">Здесь будут отображаться ваши сгенерированные песни.</p>';
            }
        } catch(e) { console.error("Не удалось загрузить песни с сервера", e); }
    }

    function setupEventListeners() {
        selectButton.addEventListener("click",e=>{e.stopPropagation(),selectDropdown.classList.toggle("open")});
        selectDropdown.addEventListener("click",e=>{if(e.target.classList.contains("select-option")){modelValueInput.value=e.target.dataset.value;selectButton.textContent=e.target.textContent;document.querySelectorAll(".select-option").forEach(e=>e.classList.remove("selected"));e.target.classList.add("selected");updateCharacterLimits(modelValueInput.value)}});
        window.addEventListener("click",()=>{selectDropdown.classList.remove("open"); document.querySelectorAll('.song-menu.active').forEach(menu => menu.classList.remove('active'))});
        customModeToggle.addEventListener("change", toggleGeneratorMode);
        instrumentalToggle.addEventListener("change", togglePromptVisibility);
        document.getElementById("generate-music-form").addEventListener("submit", function(e) {
            e.preventDefault(); if (!validateGenerateForm()) { updateStatus('🚫 Пожалуйста, заполните все выделенные поля.', false, true); return; }
            let payload = { model: modelValueInput.value, instrumental: instrumentalToggle.checked, customMode: customModeToggle.checked };
            if (payload.customMode) {
                payload.title = titleInput.value; payload.style = styleTextarea.value; if (!payload.instrumental) payload.prompt = promptTextarea.value;
                const negativeTags = document.getElementById("g-negativeTags").value; if(negativeTags) payload.negativeTags = negativeTags;
                const vocalGender = document.getElementById("g-vocalGender").value; if (vocalGender) payload.vocalGender = vocalGender;
            } else { if (!payload.instrumental) payload.prompt = descriptionInput.value; }
            handleApiCall("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true);
        });
    }

    toggleGeneratorMode();
    updateCharacterLimits(modelValueInput.value);
    handleApiCall("/api/chat/credit", { method: "GET" }, true);
    loadSongsFromServer();
    setupEventListeners();
}

// --- ЗАПУСК ПРИЛОЖЕНИЯ ---
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('access-key-button').addEventListener('click', handleLogin);
    document.getElementById('access-key-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
    if (sessionStorage.getItem('is-authenticated') === 'true') {
        document.getElementById('login-overlay').style.display = 'none';
        const appTemplate = document.getElementById('app-template');
        const appContainer = document.getElementById('app-container');
        appContainer.appendChild(appTemplate.content.cloneNode(true));
        appContainer.style.display = 'block';
        initializeApp();
    }
});

// --- Глобальные функции, не зависящие от инициализации ---
function createPlaceholderCard(taskId) {
    const emptyListMessage = document.getElementById('empty-list-message');
    const songListContainer = document.getElementById('song-list-container');
    if (emptyListMessage) emptyListMessage.style.display = 'none';
    const card = document.createElement('div'); card.className = 'song-card placeholder'; card.id = `placeholder-${taskId}`;
    card.innerHTML = `<div class="song-cover"><div class="song-duration">--:--</div></div><div class="song-info"><span class="song-title">Генерация...</span><span class="song-style">Пожалуйста, подождите</span><div class="progress-bar-container"><div class="progress-bar-inner" id="progress-${taskId}"></div></div></div>`;
    songListContainer.prepend(card);
}
function updateCharCounter(e,t){const o=document.getElementById(t);o&&(o.textContent=`${e.value.length} / ${e.maxLength}`)}
function openTab(event, tabName) {
    if (currentTabName === tabName) return; const currentActiveTab = document.getElementById(currentTabName);
    const newTab = document.getElementById(tabName);
    document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
    event.currentTarget.classList.add("active");
    if (currentActiveTab) {
        currentActiveTab.classList.add('exiting');
        currentActiveTab.addEventListener('animationend', () => {
            currentActiveTab.classList.remove('active', 'exiting'); currentActiveTab.style.display = 'none';
            newTab.style.display = 'block'; newTab.classList.add('active');
            currentTabName = tabName;
        }, { once: true });
    }
    if (tabName === 'logs') document.getElementById('logs-notification-dot').style.display = 'none';
}
async function handleApiCall(endpoint, options, isCreditCheck = false, isGeneration = false) {
    const responseOutput = document.getElementById("response-output");
    const statusContainer = document.getElementById("status-container");
    if(!isCreditCheck) { statusContainer.innerHTML = '<p class="status-message">Ожидание запуска задачи...</p>'; responseOutput.textContent = "Выполняется запрос..."; }
    if (pollingInterval && !isCreditCheck) clearInterval(pollingInterval);
    try {
        const response = await fetch(endpoint, options); const result = await response.json();
        if (response.ok) {
            if(!isCreditCheck) responseOutput.textContent = JSON.stringify(result, null, 2);
            if (isCreditCheck && result.data !== undefined) { document.getElementById("credits-value").textContent = result.data; document.getElementById("credits-container").style.display = "inline-flex"; }
            if (isGeneration && result.data && result.data.taskId) { startPolling(result.data.taskId); } 
            else if (isGeneration) { updateStatus(`🚫 Ошибка запуска: ${result.message || 'Не удалось получить taskId.'}`, false, true); }
        } else {
            if(!isCreditCheck) responseOutput.textContent = `🚫 Ошибка ${response.status}:\n\n${JSON.stringify(result, null, 2)}`;
            updateStatus(`🚫 Ошибка запуска: ${result.message || 'Сервер вернул ошибку.'}`, false, true);
        }
    } catch (error) {
        if(!isCreditCheck) responseOutput.textContent = "💥 Сетевая ошибка или ошибка парсинга JSON:\n\n" + error.message;
        updateStatus(`💥 Критическая ошибка: ${error.message}`, false, true);
    }
}
function validateGenerateForm() {
    const titleInput = document.getElementById('g-title'), styleInput = document.getElementById('g-style'), promptInput = document.getElementById('g-prompt'), descriptionInput = document.getElementById('g-song-description');
    [titleInput, styleInput, promptInput, descriptionInput].forEach(el => el.classList.remove('input-error'));
    const isCustom = document.getElementById("g-customMode").checked, isInstrumental = document.getElementById("g-instrumental").checked; let allValid = true;
    if (isCustom) {
        if (titleInput.value.trim() === '') { titleInput.classList.add('input-error'); allValid = false; }
        if (styleInput.value.trim() === '') { styleInput.classList.add('input-error'); allValid = false; }
        if (!isInstrumental && promptInput.value.trim() === '') { promptInput.classList.add('input-error'); allValid = false; }
    } else { if (!isInstrumental && descriptionInput.value.trim() === '') { descriptionInput.classList.add('input-error'); allValid = false; } }
    return allValid;
}
function toggleGeneratorMode(){ const isCustom = document.getElementById("g-customMode").checked; document.getElementById("simple-mode-fields").style.display = isCustom ? "none" : "flex"; document.getElementById("custom-mode-fields").style.display = isCustom ? "flex" : "none"; togglePromptVisibility(); }
function togglePromptVisibility(){ const isInstrumental = document.getElementById("g-instrumental").checked; document.getElementById("g-prompt-group").style.display = isInstrumental ? "none" : "flex"; document.getElementById("g-song-description-group").style.display = isInstrumental ? "none" : "flex"; }
function updateCharacterLimits(e){const t="V4_5"===e||"V4_5PLUS"===e?{style:1e3,prompt:5e3}:{style:200,prompt:3e3};document.getElementById("g-style").maxLength=t.style;document.getElementById("g-prompt").maxLength=t.prompt;updateCharCounter(document.getElementById("g-style"),"g-style-counter");updateCharCounter(document.getElementById("g-prompt"),"g-prompt-counter")}
function updateStatus(message, isSuccess = false, isError = false) { 
    const statusContainer = document.getElementById("status-container");
    if(statusContainer) statusContainer.innerHTML = `<div class="status-message ${isSuccess ? 'success' : ''} ${isError ? 'error' : ''}">${message}</div>`;
}