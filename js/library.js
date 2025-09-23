import { modelMap } from './config.js';
import { formatTime, copyToClipboard } from './ui.js';
import { playSongByIndex, getPlayerState, showSimpleLyrics, showTimestampedLyrics } from './player.js';
import { setupExtendView, setupCoverView } from './editor.js';

let playlist = [];
let currentLibraryTab = 'all';
let songListContainer, emptyListMessage;

export function initializeLibrary() {
    songListContainer = document.getElementById('song-list-container');
    emptyListMessage = document.getElementById('empty-list-message');
}

export function getPlaylist() {
    return playlist;
}

export function getSongById(songId) {
    return playlist.find(p => p.songData.id === songId);
}

async function downloadSong(event, url, filename) {
    event.preventDefault();
    const button = event.currentTarget;
    const originalHTML = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Скачивание...';
    button.style.cursor = 'wait';
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        a.remove();
    } catch (error) {
        console.error('Download failed:', error);
        button.innerHTML = '<i class="fas fa-exclamation-circle"></i> Ошибка';
    } finally {
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.style.cursor = 'pointer';
        }, 1500);
    }
}

async function deleteSong(songId, cardElement) {
    try {
        await fetch(`/api/songs/${songId}`, { method: 'DELETE' });
        cardElement.style.transition = 'opacity 0.3s, transform 0.3s';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'translateX(-20px)';
        setTimeout(() => {
            cardElement.remove();
            playlist = playlist.filter(p => p.songData.id !== songId);
            if (songListContainer.children.length === 1 && songListContainer.querySelector('#empty-list-message')) {
                emptyListMessage.style.display = 'block';
            } else if (songListContainer.children.length === 0) {
                emptyListMessage.style.display = 'block';
            }
        }, 300);
    } catch (e) {
        console.error("Could not delete song", e);
    }
}

async function toggleFavorite(songId, cardElement) {
    const songInfo = playlist.find(p => p.songData.id === songId);
    if (!songInfo) return;
    const newStatus = !songInfo.songData.is_favorite;
    try {
        await fetch(`/api/songs/${songId}/favorite`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_favorite: newStatus }) });
        songInfo.songData.is_favorite = newStatus;
        cardElement.classList.toggle('is-favorite', newStatus);
        const favButton = cardElement.querySelector('.favorite-action');
        if (favButton) {
            favButton.innerHTML = `<i class="${newStatus ? 'fas fa-heart' : 'far fa-heart'}"></i> ${newStatus ? 'Убрать из избранного' : 'В избранное'}`;
        }
    } catch (e) {
        console.error("Could not update favorite status", e);
    }
}

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
    
    card.querySelector('.song-cover').onclick = () => {
        const { player, currentSongId } = getPlayerState();
        if (currentSongId === songData.id && player.audio.src) {
            if (player.audio.paused) {
                player.audio.play();
            } else {
                player.audio.pause();
            }
        } else {
            playSongByIndex(songIndex);
        }
    };

    card.querySelector('.song-title').onclick = () => copyToClipboard(songData.id, card.querySelector('.song-title'));
    const menu = card.querySelector('.song-menu');
    card.querySelector('.menu-trigger').onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.song-menu.active').forEach(m => { if (m !== menu) m.classList.remove('active') }); menu.classList.toggle('active'); };
    
    const closeMobileLibrary = () => {
        const libraryCard = document.querySelector('.library-card');
        const libraryOverlay = document.getElementById('library-overlay');
        if (window.innerWidth <= 768 && libraryCard.classList.contains('is-open')) {
            libraryCard.classList.remove('is-open');
            libraryOverlay.classList.remove('is-visible');
        }
    };

    const menuItems = [ 
        { icon: 'fas fa-clone', text: 'Расширить', action: () => { setupExtendView(songInfo); closeMobileLibrary(); } },
        { icon: 'fas fa-microphone-alt', text: 'Кавер', action: () => { setupCoverView(songInfo); closeMobileLibrary(); } },
        { icon: 'fas fa-download', text: 'Скачать', action: (e) => downloadSong(e, downloadUrl, filename) }, 
        { icon: 'fas fa-file-alt', text: 'Текст', action: () => showSimpleLyrics(songData.id) },
        { icon: 'fas fa-microphone-alt', text: 'Караоке', action: () => showTimestampedLyrics(songData.id) },
        { icon: songData.is_favorite ? 'fas fa-heart' : 'far fa-heart', text: songData.is_favorite ? 'Убрать из избранного' : 'В избранное', action: () => toggleFavorite(songData.id, card), className: 'favorite-action' }, 
        { icon: 'fas fa-trash', text: 'Удалить', action: () => deleteSong(songData.id, card), className: 'delete' } 
    ];
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

export function renderLibrary() {
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

export async function loadSongsFromServer() {
    try {
        const response = await fetch('/api/songs');
        if (!response.ok) throw new Error('Network response was not ok');
        playlist = await response.json();
        renderLibrary();
    } catch (e) {
        console.error("Не удалось загрузить песни с сервера", e);
        songListContainer.innerHTML = '<p id="empty-list-message" style="color: var(--accent-red);">Ошибка загрузки песен. Проверьте консоль.</p>';
    }
}

export function createPlaceholderCard(taskId) {
    const card = document.createElement('div');
    card.className = 'song-card placeholder';
    card.id = `placeholder-${taskId}`;
    card.innerHTML = `<div class="song-cover"><div class="song-duration">--:--</div></div><div class="song-info"><span class="song-title">Генерация...</span><span class="song-style">Пожалуйста, подождите</span><div class="progress-bar-container"><div class="progress-bar-inner"></div></div></div>`;
    songListContainer.prepend(card);
}

export function setupLibraryTabs() {
    document.querySelectorAll('#library-tabs .tab-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const filter = button.dataset.filter;
            currentLibraryTab = filter;
            document.querySelectorAll('#library-tabs .tab-button').forEach(btn => btn.classList.remove('active'));
            event.currentTarget.classList.add('active');
            renderLibrary();
        });
    });
}