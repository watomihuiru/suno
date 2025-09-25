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

// --- НОВАЯ ЛОГИКА ОТРИСОВКИ И ВЗАИМОДЕЙСТВИЯ ---

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
            ${isExtend ? '<canvas class="waveform-canvas-base"></canvas><canvas class="waveform-canvas-top"></canvas>' : '<canvas class="waveform-canvas-base"></canvas>'}
            ${isExtend ? '<div class="waveform-progress"></div><div class="waveform-handle"></div>' : ''}
        </div>
        ${isExtend ? '<div class="extend-time-label">Расширить с 0:00</div>' : ''}
    `;

    const canvasBase = container.querySelector('.waveform-canvas-base');
    const canvasTop = container.querySelector('.waveform-canvas-top');

    // 1. Генерируем данные для волны ОДИН РАЗ
    const waveData = generateSimulatedWaveformData(canvasBase);

    if (isExtend) {
        // 2. Рисуем два идентичных графика разными цветами
        drawWaveformFromData(canvasBase, waveData, '#E6EDF3'); // "Проигранный" цвет (белый)
        drawWaveformFromData(canvasTop, waveData, '#8B949E'); // "Непроигранный" цвет (серый)

        const updateExtendUI = (percent) => {
            const { duration } = songInfo.songData;
            const handle = container.querySelector('.waveform-handle');
            const progress = container.querySelector('.waveform-progress');
            const timeLabel = container.querySelector('.extend-time-label');
            const continueAtInput = document.getElementById('ue-continueAt');

            percent = Math.max(0, Math.min(1, percent));
            const currentTime = duration * percent;

            handle.style.left = `${percent * 100}%`;
            progress.style.left = `${percent * 100}%`;
            
            timeLabel.textContent = `Расширить с ${formatTime(currentTime)}`;
            continueAtInput.value = Math.round(currentTime);
        };

        initExtendHandle(songInfo, container, updateExtendUI);
        initEditorPlayer(songInfo, container);
    } else {
        drawWaveformFromData(canvasBase, waveData, '#E1AFD1'); 
    }
}

function generateSimulatedWaveformData(canvas) {
    if (!canvas) return [];
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width * dpr;
    const height = rect.height * dpr;
    const barWidth = 2 * dpr;
    const gap = 1 * dpr;
    const numBars = Math.floor(width / (barWidth + gap));
    
    const data = [];
    for (let i = 0; i < numBars; i++) {
        data.push(Math.random() * height * 0.8 + height * 0.1);
    }
    return data;
}

function drawWaveformFromData(canvas, data, color) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const height = canvas.height;
    const barWidth = 2 * dpr;
    const gap = 1 * dpr;
    
    ctx.fillStyle = color;
    data.forEach((barHeight, i) => {
        const y = (height - barHeight) / 2;
        ctx.fillRect(i * (barWidth + gap), y, barWidth, barHeight);
    });
}

function initEditorPlayer(songInfo, container) {
    const { songData } = songInfo;
    const coverContainer = container.querySelector('.editor-cover-container');
    const playIcon = container.querySelector('.editor-play-icon i');
    const timeDisplay = container.querySelector('.editor-time');
    const waveformContainer = container.querySelector('.waveform-container');
    const canvasTop = container.querySelector('.waveform-canvas-top');

    if (editorAudio) {
        editorAudio.pause();
        editorAudio.removeAttribute('src');
    }
    editorAudio = new Audio(`/api/stream/${songData.id}`);

    const updatePlayIcon = () => {
        playIcon.className = editorAudio.paused ? 'fas fa-play' : 'fas fa-pause';
    };

    coverContainer.addEventListener('click', () => {
        if (editorAudio.paused) editorAudio.play();
        else editorAudio.pause();
    });

    editorAudio.addEventListener('play', updatePlayIcon);
    editorAudio.addEventListener('pause', updatePlayIcon);
    editorAudio.addEventListener('ended', () => {
        updatePlayIcon();
        if (canvasTop) canvasTop.style.clipPath = 'inset(0 0 0 0)';
        timeDisplay.textContent = `0:00 / ${formatTime(songData.duration)}`;
        editorAudio.currentTime = 0;
    });

    editorAudio.addEventListener('timeupdate', () => {
        const { currentTime, duration } = editorAudio;
        if (isNaN(duration) || duration === 0) return;
        const progressPercent = (currentTime / duration) * 100;
        
        if (canvasTop) canvasTop.style.clipPath = `inset(0 0 0 ${progressPercent}%)`;
        timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    });
    
    // Логика перемотки по клику
    waveformContainer.addEventListener('click', (e) => {
        if (!editorAudio.duration) return;
        const rect = waveformContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        editorAudio.currentTime = editorAudio.duration * percent;
    });
}

function initExtendHandle(songInfo, container, updateUI) {
    const { duration } = songInfo.songData;
    const handle = container.querySelector('.waveform-handle');
    const waveformContainer = container.querySelector('.waveform-container');

    let isDragging = false;

    const onDrag = (clientX) => {
        const rect = waveformContainer.getBoundingClientRect();
        const x = clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        
        updateUI(percent);

        // Обновляем позицию плеера во время перетаскивания для превью
        if (editorAudio && editorAudio.duration) {
            editorAudio.currentTime = duration * percent;
        }
    };
    
    // Устанавливаем ручку в конец по умолчанию
    updateUI(1);

    handle.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // Предотвращаем клик по контейнеру
        isDragging = true;
        document.body.style.cursor = 'ew-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            onDrag(e.clientX);
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
        }
    });
}