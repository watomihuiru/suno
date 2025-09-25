import { updateStatus, formatTime } from './ui.js';
import { getPlaylist, getSongById } from './library.js';

let globalPlayer;
let currentTrackIndex = -1;
let isShuffled = false;
let isRepeatOne = false;
let currentLyrics = [];
let lastActiveLyricIndex = -1;
let lastActiveElement = null; 
let isUserScrollingLyrics = false;
let isProgrammaticScroll = false;
let lyricsScrollTimeout;
let lyricsAnimationId;

function checkLyricsScrollability() {
    const lyricsContent = globalPlayer.fsLyricsContent;
    if (lyricsContent.scrollHeight > lyricsContent.clientHeight) {
        lyricsContent.classList.add('is-scrollable');
    } else {
        lyricsContent.classList.remove('is-scrollable');
    }
}

export function initializePlayer() {
    globalPlayer = { 
        container: document.getElementById("global-player"), 
        audio: document.createElement('audio'), 
        cover: document.getElementById("player-cover"), 
        title: document.getElementById("player-title"), 
        subtitle: document.getElementById("player-subtitle"),
        seekBar: document.getElementById("seek-bar"), 
        seekBarMobile: document.getElementById("seek-bar-mobile"),
        playPauseBtn: document.getElementById("play-pause-btn"), 
        currentTime: document.getElementById("current-time"), 
        totalDuration: document.getElementById("total-duration"), 
        prevBtn: document.getElementById('prev-btn'), 
        nextBtn: document.getElementById('next-btn'), 
        shuffleBtn: document.getElementById('shuffle-btn'), 
        repeatBtn: document.getElementById('repeat-btn'), 
        closeBtn: document.getElementById('close-player-btn'), 
        currentSongId: null,

        fsOverlay: document.getElementById('fullscreen-player-overlay'),
        fsCover: document.getElementById('fs-cover'),
        fsTitle: document.getElementById('fs-title'),
        fsSubtitle: document.getElementById('fs-subtitle'),
        fsLyricsContent: document.getElementById('fs-lyrics-content'),
        fsCurrentTime: document.getElementById('fs-current-time'),
        fsTotalDuration: document.getElementById('fs-total-duration'),
        fsSeekBar: document.getElementById('fs-seek-bar'),
        fsPlayPauseBtn: document.getElementById('fs-play-pause-btn'),
        fsPrevBtn: document.getElementById('fs-prev-btn'),
        fsNextBtn: document.getElementById('fs-next-btn'),
        fsShuffleBtn: document.getElementById('fs-shuffle-btn'),
        fsRepeatBtn: document.getElementById('fs-repeat-btn'),
        fsCloseBtn: document.getElementById('fs-close-btn'),
    };
    setupPlayerListeners();
    window.addEventListener('resize', checkLyricsScrollability);
}

function openFullscreenPlayer() {
    if (globalPlayer.currentSongId) {
        const songInfo = getSongById(globalPlayer.currentSongId);
        if (songInfo) {
            updatePlayerBackground(songInfo.songData.imageUrl);
        }
        globalPlayer.fsOverlay.classList.add('is-open');
    }
}

function closeFullscreenPlayer() {
    globalPlayer.fsOverlay.classList.remove('is-open');
    globalPlayer.fsOverlay.style.setProperty('--adaptive-gradient', 'transparent');
    stopLyricsAnimationLoop();
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

function updatePlayerBackground(imageUrl) {
    const playerOverlay = document.getElementById('fullscreen-player-overlay');
    if (!playerOverlay || !imageUrl) return;

    playerOverlay.style.setProperty('--adaptive-gradient', 'transparent');

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;

    img.onload = () => {
        const colorThief = new ColorThief();
        try {
            const palette = colorThief.getPalette(img, 2);
            if (palette && palette.length >= 2) {
                const color1 = `rgb(${palette[0].join(',')})`;
                const color2 = `rgb(${palette[1].join(',')})`;
                const gradient = `linear-gradient(270deg, ${color1}, ${color2})`;
                playerOverlay.style.setProperty('--adaptive-gradient', gradient);
            }
        } catch (e) {
            console.error("ColorThief error:", e);
            playerOverlay.style.setProperty('--adaptive-gradient', 'transparent');
        }
    };

    img.onerror = (e) => {
        console.error("Error loading image for color extraction:", e);
        playerOverlay.style.setProperty('--adaptive-gradient', 'transparent');
    }
}

function setupPlayerListeners() {
    globalPlayer.audio.onerror = (e) => { console.error("Ошибка аудио:", e); if (globalPlayer.currentSongId) { refreshAudioUrlAndPlay(globalPlayer.currentSongId); } };
    
    const togglePlayPause = () => { if (globalPlayer.audio.src) { if (globalPlayer.audio.paused) globalPlayer.audio.play(); else globalPlayer.audio.pause(); } };
    globalPlayer.playPauseBtn.onclick = togglePlayPause;
    globalPlayer.fsPlayPauseBtn.onclick = togglePlayPause;

    globalPlayer.audio.onplay = () => { 
        globalPlayer.playPauseBtn.innerHTML = `<i class="fas fa-pause"></i>`; 
        globalPlayer.fsPlayPauseBtn.innerHTML = `<i class="fas fa-pause"></i>`;
        updateAllPlayIcons();
        if (globalPlayer.fsOverlay.classList.contains('is-open') && currentLyrics.length > 0) {
            startLyricsAnimationLoop();
        }
    };
    globalPlayer.audio.onpause = () => { 
        globalPlayer.playPauseBtn.innerHTML = `<i class="fas fa-play"></i>`; 
        globalPlayer.fsPlayPauseBtn.innerHTML = `<i class="fas fa-play"></i>`;
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

    globalPlayer.audio.onloadedmetadata = () => { 
        const duration = globalPlayer.audio.duration;
        globalPlayer.seekBar.max = duration;
        globalPlayer.seekBarMobile.max = duration;
        globalPlayer.fsSeekBar.max = duration;
        globalPlayer.totalDuration.textContent = formatTime(duration);
        globalPlayer.fsTotalDuration.textContent = formatTime(duration);
    };
    globalPlayer.audio.ontimeupdate = () => {
        const currentTime = globalPlayer.audio.currentTime;
        const duration = globalPlayer.audio.duration;
        globalPlayer.seekBar.value = currentTime;
        globalPlayer.seekBarMobile.value = currentTime;
        globalPlayer.fsSeekBar.value = currentTime;
        globalPlayer.currentTime.textContent = formatTime(currentTime);
        globalPlayer.fsCurrentTime.textContent = formatTime(currentTime);
        const progressPercent = (currentTime / duration) * 100;
        globalPlayer.seekBar.style.setProperty('--seek-before-width', `${progressPercent}%`);
        globalPlayer.seekBarMobile.style.setProperty('--seek-before-width', `${progressPercent}%`);
        globalPlayer.fsSeekBar.style.setProperty('--seek-before-width', `${progressPercent}%`);
    };
    
    const seek = (value) => {
        globalPlayer.audio.currentTime = value;
    };
    globalPlayer.seekBar.addEventListener('input', (e) => seek(e.target.value));
    globalPlayer.seekBarMobile.addEventListener('input', (e) => seek(e.target.value));
    globalPlayer.fsSeekBar.addEventListener('input', (e) => seek(e.target.value));
    
    globalPlayer.nextBtn.onclick = playNext;
    globalPlayer.fsNextBtn.onclick = playNext;
    globalPlayer.prevBtn.onclick = playPrevious;
    globalPlayer.fsPrevBtn.onclick = playPrevious;

    const toggleShuffle = () => { isShuffled = !isShuffled; globalPlayer.shuffleBtn.classList.toggle('active', isShuffled); globalPlayer.fsShuffleBtn.classList.toggle('active', isShuffled); };
    globalPlayer.shuffleBtn.onclick = toggleShuffle;
    globalPlayer.fsShuffleBtn.onclick = toggleShuffle;

    const toggleRepeat = () => { isRepeatOne = !isRepeatOne; globalPlayer.repeatBtn.classList.toggle('active', isRepeatOne); globalPlayer.fsRepeatBtn.classList.toggle('active', isRepeatOne); };
    globalPlayer.repeatBtn.onclick = toggleRepeat;
    globalPlayer.fsRepeatBtn.onclick = toggleRepeat;
    
    globalPlayer.closeBtn.onclick = () => {
        globalPlayer.audio.pause();
        globalPlayer.audio.src = '';
        globalPlayer.currentSongId = null;
        globalPlayer.container.style.display = 'none';
        updateAllPlayIcons();
    };

    globalPlayer.fsCloseBtn.onclick = closeFullscreenPlayer;

    globalPlayer.fsLyricsContent.addEventListener('scroll', () => {
        if (isProgrammaticScroll) {
            isProgrammaticScroll = false;
            return;
        }
        if (currentLyrics.length === 0) return;
        isUserScrollingLyrics = true;
        clearTimeout(lyricsScrollTimeout);
        lyricsScrollTimeout = setTimeout(() => {
            isUserScrollingLyrics = false;
        }, 4000);
    });

    globalPlayer.fsLyricsContent.addEventListener('click', (e) => {
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
    globalPlayer.subtitle.textContent = songData.tags || '';
    
    globalPlayer.fsCover.src = songData.imageUrl || 'placeholder.png';
    globalPlayer.fsTitle.textContent = songData.title || 'Без названия';
    globalPlayer.fsSubtitle.textContent = songData.tags || '';

    if (globalPlayer.fsOverlay.classList.contains('is-open')) {
        updatePlayerBackground(songData.imageUrl);
    }

    globalPlayer.audio.src = `/api/stream/${songData.id}`;
    globalPlayer.audio.play().catch(e => { if (e.name !== 'AbortError') { console.error("Ошибка воспроизведения:", e); } });
    globalPlayer.container.style.display = 'flex';
    updateAllPlayIcons();
    
    if (globalPlayer.fsOverlay.classList.contains('is-open')) {
        showTimestampedLyrics(globalPlayer.currentSongId);
    }
}

export function playSongById(songId) {
    const playlist = getPlaylist();
    const songIndex = playlist.findIndex(p => p.songData.id === songId);
    if (songIndex !== -1) {
        playSongByIndex(songIndex);
    } else {
        console.error(`Песня с ID ${songId} не найдена в плейлисте.`);
    }
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
    openFullscreenPlayer();
    const songInfo = getSongById(songId);
    if (!songInfo) return;
    const rawText = songInfo.songData.prompt || "Текст для этой песни не найден.";
    
    let processedText = rawText
        .replace(/\s*(\[.*?\]|\(.*?\))\s*/g, '\n\n') 
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    
    globalPlayer.fsLyricsContent.innerHTML = `<div class="lyrics-paragraph">${processedText.replace(/\n/g, '<br>')}</div>`;
    currentLyrics = [];
    stopLyricsAnimationLoop();
    checkLyricsScrollability();
}

export async function showTimestampedLyrics(songId) {
    openFullscreenPlayer();
    const lyricsContainer = globalPlayer.fsLyricsContent;
    lyricsContainer.innerHTML = '<p class="lyrics-placeholder">Загрузка караоке...</p>';
    
    currentLyrics = [];
    lastActiveLyricIndex = -1;
    lastActiveElement = null;
    isUserScrollingLyrics = false;
    stopLyricsAnimationLoop();

    try {
        const songInfo = getSongById(songId);
        if (!songInfo || !songInfo.requestParams || !songInfo.requestParams.taskId) {
            lyricsContainer.innerHTML = '<p class="lyrics-placeholder">Ошибка: ID задачи для этой песни не найден. Караоке недоступно.</p>';
            checkLyricsScrollability();
            return;
        }

        const payload = { audioId: songId, taskId: songInfo.requestParams.taskId };
        const response = await fetch('/api/lyrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        
        document.getElementById("response-output").textContent = JSON.stringify(result, null, 2);

        const lyricsData = result.data;
        if (!response.ok || !lyricsData || !Array.isArray(lyricsData.alignedWords) || lyricsData.alignedWords.length === 0) {
            showSimpleLyrics(songId);
            return;
        }

        currentLyrics = lyricsData.alignedWords;
        lyricsContainer.innerHTML = '';
        
        const parsedSegments = [];
        let isInSquareTag = false;
        let isInParenTag = false;

        currentLyrics.forEach((segment, index) => {
            let currentPart = segment.word;
            let partsToRender = [];
            
            while (currentPart.length > 0) {
                if (isInSquareTag) {
                    const endBracketIndex = currentPart.indexOf(']');
                    if (endBracketIndex !== -1) {
                        isInSquareTag = false;
                        currentPart = currentPart.substring(endBracketIndex + 1);
                    } else {
                        currentPart = '';
                    }
                } else if (isInParenTag) {
                    const endParenIndex = currentPart.indexOf(')');
                    if (endParenIndex !== -1) {
                        isInParenTag = false;
                        currentPart = currentPart.substring(endParenIndex + 1);
                    } else {
                        currentPart = '';
                    }
                } else {
                    const startBracketIndex = currentPart.indexOf('[');
                    const startParenIndex = currentPart.indexOf('(');

                    let firstTagIndex = -1;
                    if (startBracketIndex !== -1 && startParenIndex !== -1) {
                        firstTagIndex = Math.min(startBracketIndex, startParenIndex);
                    } else {
                        firstTagIndex = Math.max(startBracketIndex, startParenIndex);
                    }

                    if (firstTagIndex !== -1) {
                        const textBeforeTag = currentPart.substring(0, firstTagIndex);
                        if (textBeforeTag.trim()) {
                            partsToRender.push(textBeforeTag);
                        }
                        isInSquareTag = currentPart[firstTagIndex] === '[';
                        isInParenTag = currentPart[firstTagIndex] === '(';
                        currentPart = currentPart.substring(firstTagIndex);
                    } else {
                        if (currentPart.trim()) {
                            partsToRender.push(currentPart);
                        }
                        currentPart = '';
                    }
                }
            }

            if (partsToRender.length > 0) {
                 parsedSegments.push({
                    text: partsToRender.join(''),
                    index: index,
                    startTime: segment.startS // ИСПРАВЛЕНИЕ: Использовать startS
                });
            } else if (parsedSegments.length > 0 && !parsedSegments[parsedSegments.length-1].isBreak) {
                 parsedSegments.push({ isBreak: true });
            }
        });
        
        const paragraph = document.createElement('div');
        paragraph.className = 'lyrics-paragraph';
        let currentLineDiv = document.createElement('div');
        paragraph.appendChild(currentLineDiv);

        parsedSegments.forEach(seg => {
            if (seg.isBreak) {
                if (currentLineDiv.hasChildNodes()) {
                    currentLineDiv = document.createElement('div');
                    paragraph.appendChild(currentLineDiv);
                }
                const breakDiv = document.createElement('div');
                breakDiv.innerHTML = '&nbsp;';
                paragraph.appendChild(breakDiv);
                currentLineDiv = document.createElement('div');
                paragraph.appendChild(currentLineDiv);
            } else {
                const textParts = seg.text.split('\n');
                textParts.forEach((part, i) => {
                    const cleanedPart = part.trim();
                    if (cleanedPart) {
                        const span = document.createElement('span');
                        span.textContent = cleanedPart + ' ';
                        span.className = 'lyric-segment';
                        span.dataset.index = seg.index;
                        span.dataset.startTime = seg.startTime; // ИСПРАВЛЕНИЕ: startTime теперь корректно
                        currentLineDiv.appendChild(span);
                    }
                    if (i < textParts.length - 1 && currentLineDiv.hasChildNodes()) {
                        currentLineDiv = document.createElement('div');
                        paragraph.appendChild(currentLineDiv);
                    }
                });
            }
        });
        
        while (paragraph.lastChild && !paragraph.lastChild.hasChildNodes() && paragraph.lastChild.textContent.trim() === '') {
            paragraph.removeChild(paragraph.lastChild);
        }

        lyricsContainer.appendChild(paragraph);
        lyricsContainer.scrollTop = 0;
        checkLyricsScrollability();
        
        if (!globalPlayer.audio.paused) {
            startLyricsAnimationLoop();
        }

    } catch (error) {
        console.error("Критическая ошибка при загрузке караоке:", error);
        lyricsContainer.innerHTML = '<p class="lyrics-placeholder">Не удалось загрузить караоке из-за ошибки.</p>';
        checkLyricsScrollability();
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
            const prevActiveElements = document.querySelectorAll(`.lyric-segment[data-index="${lastActiveLyricIndex}"]`);
            if (prevActiveElements) prevActiveElements.forEach(el => el.classList.remove('active'));
        }
        
        if (activeSegmentIndex > -1) {
            const activeElements = document.querySelectorAll(`.lyric-segment[data-index="${activeSegmentIndex}"]`);
            if (activeElements && activeElements.length > 0) {
                activeElements.forEach(el => el.classList.add('active'));
                
                const newFirstActiveElement = activeElements[0];

                if (!isUserScrollingLyrics && (!lastActiveElement || newFirstActiveElement.offsetTop !== lastActiveElement.offsetTop)) {
                    isProgrammaticScroll = true;
                    newFirstActiveElement.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                
                lastActiveElement = newFirstActiveElement;
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