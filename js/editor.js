// Этот модуль содержит всю логику, связанную с аудио-редактором,
// который появляется при выборе "Расширить" или "Кавер" для существующего трека.
import { showView, formatTime } from './ui.js';

let songToEdit = null;
let editorAudio = null;

export function getSongToEdit() {
    return songToEdit;
}

export function setupExtendView(songInfo) {
    songToEdit = songInfo;
    showView('upload-extend', true);
    
    document.getElementById('ue-title').value = songInfo.songData.title || '';
    document.getElementById('ue-style').value = songInfo.songData.tags || '';
    
    document.getElementById('ue-url-group').style.display = 'none';
    document.getElementById('ue-continueAt-group').style.display = 'none';
    const editor = document.getElementById('ue-audio-editor');
    editor.style.display = 'flex';
    renderAudioEditor('extend', songInfo, editor);
}

export function setupCoverView(songInfo) {
    songToEdit = songInfo;
    showView('upload', true);

    document.getElementById('uc-title').value = songInfo.songData.title || '';
    document.getElementById('uc-style').value = songInfo.songData.tags || '';
    document.getElementById('uc-prompt').value = songInfo.songData.prompt || '';

    document.getElementById('uc-url-group').style.display = 'none';
    const editor = document.getElementById('uc-audio-editor');
    editor.style.display = 'flex';
    renderAudioEditor('cover', songInfo, editor);
}

export function resetEditViews() {
    songToEdit = null;
    
    if (editorAudio) {
        editorAudio.pause();
        editorAudio.removeAttribute('src');
        editorAudio.load();
        editorAudio = null;
    }

    document.getElementById('ue-url-group').style.display = 'flex';
    document.getElementById('ue-continueAt-group').style.display = 'flex';
    document.getElementById('ue-audio-editor').style.display = 'none';
    document.getElementById('ue-audio-editor').innerHTML = '';

    document.getElementById('uc-url-group').style.display = 'flex';
    document.getElementById('uc-audio-editor').style.display = 'none';
    document.getElementById('uc-audio-editor').innerHTML = '';
}

function renderAudioEditor(mode, songInfo, container) {
    const { songData } = songInfo;
    const isExtend = mode === 'extend';

    container.innerHTML = `
        <div class="editor-info">
            <div class="editor-cover-container">
                <img src="${songData.imageUrl}" class="editor-cover" alt="cover">
                ${isExtend ? '<div class="editor-play-icon"><i class="fas fa-play"></i></div>' : ''}
            </div>
            <div class="editor-details">
                <div class="editor-title">${songData.title}</div>
                <div class="editor-time">0:00 / ${formatTime(songData.duration)}</div>
            </div>
        </div>
        <div class="waveform-container">
            <canvas class="waveform-canvas"></canvas>
            ${isExtend ? '<div class="waveform-playback-progress"></div>' : ''}
            ${isExtend ? '<div class="waveform-progress"></div><div class="waveform-handle"></div>' : ''}
        </div>
        ${isExtend ? '<div class="extend-time-label">Расширить с 0:00</div>' : ''}
    `;

    const canvas = container.querySelector('.waveform-canvas');
    drawSimulatedWaveform(canvas, isExtend ? '#8B949E' : '#E1AFD1');
    
    if (isExtend) {
        const updateExtendUI = (percent) => {
            const { duration } = songInfo.songData;
            const handle = container.querySelector('.waveform-handle');
            const progress = container.querySelector('.waveform-progress');
            const timeLabel = container.querySelector('.extend-time-label');
            const continueAtInput = document.getElementById('ue-continueAt');

            percent = Math.max(0, Math.min(1, percent));
            const currentTime = duration * percent;

            handle.style.left = `${percent * 100}%`;
            progress.style.width = `${percent * 100}%`;
            timeLabel.textContent = `Расширить с ${formatTime(currentTime)}`;
            continueAtInput.value = Math.round(currentTime);
        };

        initExtendHandle(songInfo, container, updateExtendUI);
        initEditorPlayer(songInfo, container, updateExtendUI);
    }
}

function drawSimulatedWaveform(canvas, color) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const barWidth = 2;
    const gap = 1;
    const numBars = Math.floor(width / (barWidth + gap));
    
    ctx.fillStyle = color;
    for (let i = 0; i < numBars; i++) {
        const barHeight = Math.random() * height * 0.8 + height * 0.1;
        const y = (height - barHeight) / 2;
        ctx.fillRect(i * (barWidth + gap), y, barWidth, barHeight);
    }
}

function initEditorPlayer(songInfo, container, updateExtendUI) {
    const { songData } = songInfo;
    const coverContainer = container.querySelector('.editor-cover-container');
    const playIcon = container.querySelector('.editor-play-icon i');
    const timeDisplay = container.querySelector('.editor-time');
    const playbackProgress = container.querySelector('.waveform-playback-progress');
    const waveformContainer = container.querySelector('.waveform-container');

    if (editorAudio) {
        editorAudio.pause();
        editorAudio.removeAttribute('src');
    }
    editorAudio = new Audio(`/api/stream/${songData.id}`);

    const updatePlayIcon = () => {
        playIcon.className = editorAudio.paused ? 'fas fa-play' : 'fas fa-pause';
    };

    coverContainer.addEventListener('click', () => {
        if (editorAudio.paused) {
            editorAudio.play();
        } else {
            editorAudio.pause();
        }
    });

    editorAudio.addEventListener('play', updatePlayIcon);
    editorAudio.addEventListener('pause', updatePlayIcon);
    editorAudio.addEventListener('ended', () => {
        updatePlayIcon();
        playbackProgress.style.width = '0%';
        timeDisplay.textContent = `0:00 / ${formatTime(songData.duration)}`;
        editorAudio.currentTime = 0;
    });

    editorAudio.addEventListener('timeupdate', () => {
        const { currentTime, duration } = editorAudio;
        if (isNaN(duration) || duration === 0) return;
        const progressPercent = (currentTime / duration) * 100;
        playbackProgress.style.width = `${progressPercent}%`;
        timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    });
    
    const seek = (e) => {
        if (!editorAudio.duration) return;
        const rect = waveformContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        editorAudio.currentTime = editorAudio.duration * percent;
        
        if (updateExtendUI) {
            updateExtendUI(percent);
        }
    };

    let isSeeking = false;
    waveformContainer.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('waveform-handle')) {
            return;
        }
        isSeeking = true;
        seek(e);
    });
    document.addEventListener('mousemove', (e) => {
        if (isSeeking) {
            seek(e);
        }
    });
    document.addEventListener('mouseup', () => {
        isSeeking = false;
    });
}

function initExtendHandle(songInfo, container, updateUI) {
    const { duration } = songInfo.songData;
    const handle = container.querySelector('.waveform-handle');
    const waveformContainer = container.querySelector('.waveform-container');

    let isDragging = false;

    const updatePositionFromDrag = (clientX) => {
        const rect = waveformContainer.getBoundingClientRect();
        let x = clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        
        updateUI(percent);

        if (editorAudio && editorAudio.duration) {
            editorAudio.currentTime = duration * percent;
        }
    };
    
    updateUI(1);

    handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isDragging = true;
        document.body.style.cursor = 'ew-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            updatePositionFromDrag(e.clientX);
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
        }
    });
}