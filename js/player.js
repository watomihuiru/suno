import { updateStatus, formatTime } from './ui.js';
import { getPlaylist, getSongById } from './library.js';

let globalPlayer;
let currentTrackIndex = -1;
let isShuffled = false;
let isRepeatOne = false;
let currentLyrics = [];
let lastActiveLyricIndex = -1;
let isUserScrollingLyrics = false;
let lyricsScrollTimeout;
let lyricsAnimationId;
let lyricsModal;

export function initializePlayer() {
    globalPlayer = { 
        container: document.getElementById("global-player"), 
        audio: document.createElement('audio'), 
        cover: document.getElementById("player-cover"), 
        title: document.getElementById("player-title"), 
        seekBar: document.getElementById("seek-bar"), 
        playPauseBtn: document.getElementById("play-pause-btn"), 
        currentTime: document.getElementById("current-time"), 
        totalDuration: document.getElementById("total-duration"), 
        prevBtn: document.getElementById('prev-btn'), 
        nextBtn: document.getElementById('next-btn'), 
        shuffleBtn: document.getElementById('shuffle-btn'), 
        repeatBtn: document.getElementById('repeat-btn'), 
        closeBtn: document.getElementById('close-player-btn'), 
        currentSongId: null 
    };
    lyricsModal = { 
        overlay: document.getElementById('lyrics-modal-overlay'), 
        content: document.getElementById('lyrics-modal-content'), 
        closeBtn: document.getElementById('lyrics-modal-close'), 
        returnBtn: document.getElementById('return-to-active-lyric-btn') 
    };
    setupPlayerListeners();
}

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

function startLyricsAnimationLoop() {
    if (lyricsAnimationId) cancelAnimationFrame(lyricsAnimationId);
    function loop() {
        updateActiveLyric(globalPlayer.audio.currentTime);
        lyricsAnimationId = requestAnimationFrame(loop);
    }
    lyricsAnimationId = requestAnimationFrame(loop);
}

function stopLyricsAnimationLoop() {
    if (lyricsAnimationId) {
        cancelAnimationFrame(lyricsAnimationId);
        lyricsAnimationId = null;
    }
}

function setupPlayerListeners() {
    globalPlayer.audio.onerror = (e) => { console.error("Ошибка аудио:", e); if (globalPlayer.currentSongId) { refreshAudioUrlAndPlay(globalPlayer.currentSongId); } };
    globalPlayer.playPauseBtn.onclick = () => { if (globalPlayer.audio.src) { if (globalPlayer.audio.paused) globalPlayer.audio.play(); else globalPlayer.audio.pause(); } };
    
    globalPlayer.audio.onplay = () => { 
        globalPlayer.playPauseBtn.innerHTML = `<i class="fas fa-pause"></i>`; 
        updateAllPlayIcons();
        if (lyricsModal.overlay.style.display === 'flex' && currentLyrics.length > 0) {
            startLyricsAnimationLoop();
        }
    };
    globalPlayer.audio.onpause = () => { 
        globalPlayer.playPauseBtn.innerHTML = `<i class="fas fa-play"></i>`; 
        updateAllPlayIcons();
        stopLyricsAnimationLoop();
    };
    globalPlayer.audio.onended = () => {
        stopLyricsAnimationLoop();
        if (isRepeatOne) {
            globalPlayer.audio.currentTime = 0;
            globalPlayer.audio.play();
        } else {
            playNext();
        }
    };

    globalPlayer.audio.onloadedmetadata = () => { globalPlayer.seekBar.max = globalPlayer.audio.duration; globalPlayer.totalDuration.textContent = formatTime(globalPlayer.audio.duration); };
    globalPlayer.audio.ontimeupdate = () => {
        globalPlayer.seekBar.value = globalPlayer.audio.currentTime;
        globalPlayer.currentTime.textContent = formatTime(globalPlayer.audio.currentTime);
        const progressPercent = (globalPlayer.audio.currentTime / globalPlayer.audio.duration) * 100;
        globalPlayer.seekBar.style.setProperty('--seek-before-width', `${progressPercent}%`);
    };
    globalPlayer.seekBar.addEventListener('input', () => {
        globalPlayer.audio.currentTime = globalPlayer.seekBar.value;
        const progressPercent = (globalPlayer.audio.currentTime / globalPlayer.audio.duration) * 100;
        globalPlayer.seekBar.style.setProperty('--seek-before-width', `${progressPercent}%`);
    });
    
    globalPlayer.nextBtn.onclick = playNext;
    globalPlayer.prevBtn.onclick = playPrevious;
    globalPlayer.shuffleBtn.onclick = () => { isShuffled = !isShuffled; globalPlayer.shuffleBtn.classList.toggle('active', isShuffled); };
    globalPlayer.repeatBtn.onclick = () => { isRepeatOne = !isRepeatOne; globalPlayer.repeatBtn.classList.toggle('active', isRepeatOne); };
    
    const closeModal = () => {
        lyricsModal.overlay.style.display = 'none';
        lyricsModal.returnBtn.classList.remove('visible');
        currentLyrics = [];
        lastActiveLyricIndex = -1;
        isUserScrollingLyrics = false;
        clearTimeout(lyricsScrollTimeout);
        stopLyricsAnimationLoop();
    };
    lyricsModal.closeBtn.onclick = closeModal;
    lyricsModal.overlay.onclick = (e) => { if (e.target === lyricsModal.overlay) closeModal(); };

    globalPlayer.closeBtn.onclick = () => {
        globalPlayer.audio.pause();
        globalPlayer.audio.src = '';
        globalPlayer.currentSongId = null;
        globalPlayer.container.style.display = 'none';
        updateAllPlayIcons();
    };

    lyricsModal.content.addEventListener('scroll', () => {
        if (currentLyrics.length === 0) return;
        isUserScrollingLyrics = true;
        lyricsModal.returnBtn.classList.add('visible');
        clearTimeout(lyricsScrollTimeout);
        lyricsScrollTimeout = setTimeout(() => {
            isUserScrollingLyrics = false;
            lyricsModal.returnBtn.classList.remove('visible');
        }, 4000);
    });

    lyricsModal.returnBtn.addEventListener('click', () => {
        clearTimeout(lyricsScrollTimeout);
        isUserScrollingLyrics = false;
        lyricsModal.returnBtn.classList.remove('visible');
        const activeElement = document.querySelector(`.lyric-segment[data-index="${lastActiveLyricIndex}"]`);
        if (activeElement) {
            activeElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
    });

    lyricsModal.content.addEventListener('click', (e) => {
        const targetSegment = e.target.closest('.lyric-segment');
        if (targetSegment && !targetSegment.classList.contains('lyric-tag')) {
            const seekTime = parseFloat(targetSegment.dataset.startTime);
            if (!isNaN(seekTime) && globalPlayer.audio.src) {
                globalPlayer.audio.currentTime = seekTime;
                if (globalPlayer.audio.paused) {
                    globalPlayer.audio.play();
                }
            }
        }
    });
}

export function playSongByIndex(index) {
    const playlist = getPlaylist();
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

function playNext() { 
    const playlist = getPlaylist();
    if (playlist.length === 0) return; 
    let nextIndex; 
    if (isShuffled) { 
        nextIndex = Math.floor(Math.random() * playlist.length); 
    } else { 
        nextIndex = (currentTrackIndex + 1) % playlist.length; 
    } 
    playSongByIndex(nextIndex); 
}

function playPrevious() { 
    const playlist = getPlaylist();
    if (playlist.length === 0) return; 
    let prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length; 
    playSongByIndex(prevIndex); 
}

export function updateAllPlayIcons() {
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

export function showSimpleLyrics(songId) {
    const songInfo = getSongById(songId);
    if (!songInfo) return;
    const rawText = songInfo.songData.prompt || "Текст для этой песни не найден.";
    
    lyricsModal.content.innerHTML = `<div class="lyrics-paragraph">${rawText}</div>`;
    lyricsModal.overlay.style.display = 'flex';
    currentLyrics = [];
    stopLyricsAnimationLoop();
}

export async function showTimestampedLyrics(songId) {
    lyricsModal.content.innerHTML = '<p>Загрузка караоке...</p>';
    lyricsModal.overlay.style.display = 'flex';
    currentLyrics = [];
    lastActiveLyricIndex = -1;
    isUserScrollingLyrics = false;
    lyricsModal.returnBtn.classList.remove('visible');
    stopLyricsAnimationLoop();

    try {
        const songInfo = getSongById(songId);
        if (!songInfo || !songInfo.requestParams || !songInfo.requestParams.taskId) {
            lyricsModal.content.textContent = "Ошибка: ID задачи для этой песни не найден. Караоке недоступно.";
            return;
        }

        const payload = { audioId: songId, taskId: songInfo.requestParams.taskId };
        const response = await fetch('/api/lyrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        
        document.getElementById("response-output").textContent = JSON.stringify(result, null, 2);

        const lyricsData = result.data;
        if (!response.ok || !lyricsData || !Array.isArray(lyricsData.alignedWords) || lyricsData.alignedWords.length === 0) {
            lyricsModal.content.textContent = "Текст с временными метками недоступен. Попробуйте сгенерировать песню заново.";
            return;
        }

        currentLyrics = lyricsData.alignedWords;
        
        lyricsModal.content.innerHTML = '';
        const lyricsContainer = document.createElement('div');
        lyricsContainer.className = 'lyrics-paragraph';

        currentLyrics.forEach((segment, index) => {
            if (typeof segment.word !== 'string') return;

            const span = document.createElement('span');
            span.textContent = segment.word;
            span.className = 'lyric-segment';
            span.dataset.index = index;
            span.dataset.startTime = segment.startS;

            if (segment.word.startsWith('[') && segment.word.endsWith(']')) {
                span.classList.add('lyric-tag');
            }
            lyricsContainer.appendChild(span);
        });
        lyricsModal.content.appendChild(lyricsContainer);

        if (!globalPlayer.audio.paused) {
            startLyricsAnimationLoop();
        }

    } catch (error) {
        console.error("Критическая ошибка при загрузке караоке:", error);
        lyricsModal.content.textContent = "Не удалось загрузить караоке из-за ошибки.";
    }
}

function updateActiveLyric(currentTime) {
    if (currentLyrics.length === 0) return;

    let activeSegmentIndex = -1;
    for (let i = 0; i < currentLyrics.length; i++) {
        if (currentTime >= currentLyrics[i].startS) {
            activeSegmentIndex = i;
        } else {
            break;
        }
    }

    if (activeSegmentIndex !== lastActiveLyricIndex) {
        if (lastActiveLyricIndex > -1) {
            const prevActiveElement = document.querySelector(`.lyric-segment[data-index="${lastActiveLyricIndex}"]`);
            if (prevActiveElement) prevActiveElement.classList.remove('active');
        }
        if (activeSegmentIndex > -1) {
            const activeElement = document.querySelector(`.lyric-segment[data-index="${activeSegmentIndex}"]`);
            if (activeElement) {
                activeElement.classList.add('active');
                if (!isUserScrollingLyrics) {
                    activeElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                }
            }
        }
        lastActiveLyricIndex = activeSegmentIndex;
    }
}

export function getPlayerState() {
    return {
        player: globalPlayer,
        isPlaying: globalPlayer.audio && !globalPlayer.audio.paused,
        currentSongId: globalPlayer.currentSongId
    };
}