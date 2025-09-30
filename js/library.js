// Этот модуль отвечает за управление библиотекой треков:
// загрузка с сервера, рендеринг списка, добавление, удаление,
// добавление в избранное и другие действия с песнями.
import { modelMap } from './config.js';
import { formatTime, copyToClipboard, showConfirmationModal } from './ui.js';
import { playSongById, getPlayerState, showSimpleLyrics, showTimestampedLyrics, updateAllPlayIcons } from './player.js';
import { setupExtendView, setupCoverView } from './editor.js';
import { handleApiCall } from './api.js';
import { openImageLightbox } from './app.js';

let playlist = [];
let projects = [];
let activeProjectId = null;
let currentLibraryTab = 'all';

let songLibraryContainer, imageGalleryContainer;
let songListContainer, emptyListMessage, projectListContainer;
let imageGrid, imageEmptyMessage;


function getAuthHeaders() {
    const token = sessionStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

export function initializeLibrary() {
    songLibraryContainer = document.getElementById('song-library-container');
    imageGalleryContainer = document.getElementById('image-gallery-container');
    songListContainer = document.getElementById('song-list-container');
    emptyListMessage = document.getElementById('empty-list-message');
    projectListContainer = document.getElementById('project-list');
    imageGrid = document.getElementById('image-gallery-grid');
    imageEmptyMessage = document.getElementById('image-gallery-empty-message');

    // Загружаем данные один раз при инициализации
    fetchProjects();
    fetchImagesFromServer();
}

// --- ИЗМЕНЕНИЕ ЗДЕСЬ: Функция больше не загружает данные, а только переключает видимость ---
export function toggleLibraryView(viewType) {
    if (viewType === 'songs') {
        songLibraryContainer.style.display = 'flex';
        imageGalleryContainer.style.display = 'none';
    } else if (viewType === 'images') {
        songLibraryContainer.style.display = 'none';
        imageGalleryContainer.style.display = 'flex';
    }
}

export async function fetchImagesFromServer() {
    try {
        const response = await fetch('/api/images', { headers: getAuthHeaders() });
        if (!response.ok) throw new Error('Network response was not ok');
        const images = await response.json();
        renderImageGallery(images);
    } catch (e) {
        console.error("Не удалось загрузить изображения с сервера", e);
        imageGrid.innerHTML = '<p id="image-gallery-empty-message" style="color: var(--accent-red);">Ошибка загрузки.</p>';
    }
}

async function deleteImage(imageId, cardElement) {
    try {
        const response = await fetch(`/api/images/${imageId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            throw new Error('Ошибка при удалении на сервере');
        }
        cardElement.style.transition = 'opacity 0.3s, transform 0.3s';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.9)';
        setTimeout(() => {
            cardElement.remove();
            if (imageGrid.children.length === 0) {
                imageEmptyMessage.style.display = 'block';
            }
        }, 300);
    } catch (e) {
        console.error("Не удалось удалить изображение", e);
    }
}


function renderImageGallery(images) {
    imageGrid.innerHTML = '';
    if (images.length > 0) {
        imageEmptyMessage.style.display = 'none';
        images.forEach(image => {
            const item = document.createElement('div');
            item.className = 'mj-gallery-item';
            item.id = `mj-item-${image.id}`;

            const img = document.createElement('img');
            img.src = image.image_url;
            img.alt = image.prompt_data?.prompt || 'Generated image';
            img.addEventListener('click', () => {
                openImageLightbox(image.image_url, image.prompt_data?.prompt, image.prompt_data?.version);
            });
            item.appendChild(img);

            const overlay = document.createElement('div');
            overlay.className = 'mj-gallery-item-overlay';

            if (image.image_type === 'grid') {
                overlay.innerHTML += `
                    <div class="mj-gallery-actions">
                        <button class="mj-action-button" data-action="upscale" data-task-id="${image.task_id}" data-index="0">U1</button>
                        <button class="mj-action-button" data-action="upscale" data-task-id="${image.task_id}" data-index="1">U2</button>
                        <button class="mj-action-button" data-action="upscale" data-task-id="${image.task_id}" data-index="2">U3</button>
                        <button class="mj-action-button" data-action="upscale" data-task-id="${image.task_id}" data-index="3">U4</button>
                    </div>
                    <div class="mj-gallery-actions">
                        <button class="mj-action-button" data-action="vary" data-task-id="${image.task_id}" data-index="0">V1</button>
                        <button class="mj-action-button" data-action="vary" data-task-id="${image.task_id}" data-index="1">V2</button>
                        <button class="mj-action-button" data-action="vary" data-task-id="${image.task_id}" data-index="2">V3</button>
                        <button class="mj-action-button" data-action="vary" data-task-id="${image.task_id}" data-index="3">V4</button>
                    </div>
                `;
            }

            const deleteButton = document.createElement('button');
            deleteButton.className = 'mj-delete-button';
            deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
            deleteButton.title = 'Удалить изображение';
            deleteButton.addEventListener('click', () => {
                showConfirmationModal(
                    'Вы уверены, что хотите удалить это изображение?',
                    () => deleteImage(image.id, item)
                );
            });
            overlay.appendChild(deleteButton);

            item.appendChild(overlay);
            imageGrid.appendChild(item);
        });

        imageGrid.querySelectorAll('.mj-action-button').forEach(button => {
            button.addEventListener('click', handleMjAction);
        });
    } else {
        imageEmptyMessage.style.display = 'block';
    }
}

function handleMjAction(event) {
    const button = event.currentTarget;
    const { action, taskId, index } = button.dataset;
    
    let endpoint, payload, taskType;

    if (action === 'upscale') {
        endpoint = '/api/mj/upscale';
        payload = { taskId, imageIndex: parseInt(index) };
        taskType = 'mj_upscale';
    } else if (action === 'vary') {
        endpoint = '/api/mj/vary';
        payload = { taskId, imageIndex: parseInt(index) };
        taskType = 'mj_vary';
    } else {
        return;
    }

    handleApiCall(endpoint, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }, false, true, taskType);
}


export function getPlaylist() { return playlist; }
export function getSongById(songId) { return playlist.find(p => p.songData.id === songId); }

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
        await fetch(`/api/songs/${songId}`, { 
            method: 'DELETE',
            headers: getAuthHeaders() 
        });
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
        await fetch(`/api/songs/${songId}/favorite`, { 
            method: 'PUT', 
            headers: getAuthHeaders(), 
            body: JSON.stringify({ is_favorite: newStatus }) 
        });
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

async function moveSongToProject(songId, newProjectId, cardElement) {
    try {
        await fetch(`/api/songs/${songId}/move`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ projectId: newProjectId })
        });
        cardElement.style.transition = 'opacity 0.3s ease';
        cardElement.style.opacity = '0';
        setTimeout(() => {
            cardElement.remove();
            playlist = playlist.filter(p => p.songData.id !== songId);
            if (playlist.length === 0) {
                renderLibrary();
            }
        }, 300);
    } catch (error) {
        console.error('Ошибка при перемещении песни:', error);
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
    
    card.querySelector('.song-cover').onclick = () => {
        const { player, currentSongId } = getPlayerState();
        if (currentSongId === songData.id && player.audio.src) {
            if (player.audio.paused) { player.audio.play(); } else { player.audio.pause(); }
        } else { playSongById(songData.id); }
    };

    card.querySelector('.song-title').onclick = () => copyToClipboard(songData.id, card.querySelector('.song-title'));
    const menu = card.querySelector('.song-menu');
    
    card.querySelector('.menu-trigger').onclick = (e) => {
        e.stopPropagation();
        const menuTrigger = e.currentTarget;
        const isCurrentlyActive = menu.classList.contains('active');

        document.querySelectorAll('.song-menu.active').forEach(m => {
            m.classList.remove('active');
            m.closest('.song-card').classList.remove('menu-is-active');
        });

        if (!isCurrentlyActive) {
            const containerRect = songListContainer.getBoundingClientRect();
            const triggerRect = menuTrigger.getBoundingClientRect();
            const spaceBelow = containerRect.bottom - triggerRect.bottom;
            const menuHeight = 220;

            if (spaceBelow < menuHeight) { menu.classList.add('opens-up'); } else { menu.classList.remove('opens-up'); }
            menu.classList.add('active');
            card.classList.add('menu-is-active');
        }
    };
    
    const moveSubMenu = document.createElement('ul');
    moveSubMenu.className = 'move-to-project-submenu';
    
    const moveMenuItem = document.createElement('li');
    moveMenuItem.className = 'menu-item move-to-project-action';
    moveMenuItem.innerHTML = `<i class="fas fa-folder-plus"></i> Переместить`;
    moveMenuItem.appendChild(moveSubMenu);
    moveMenuItem.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) { e.stopPropagation(); moveSubMenu.classList.toggle('is-open'); }
    });

    const menuItems = [ 
        { icon: 'fas fa-angles-right', text: 'Расширить', action: () => { setupExtendView(songInfo); } },
        { icon: 'fas fa-sync', text: 'Кавер', action: () => { setupCoverView(songInfo); } },
        { icon: 'fas fa-file-alt', text: 'Текст', action: () => showSimpleLyrics(songData.id) },
        { icon: 'fas fa-microphone-alt', text: 'Караоке', action: () => showTimestampedLyrics(songData.id) },
        moveMenuItem,
        { icon: 'fas fa-download', text: 'Скачать', action: (e) => downloadSong(e, downloadUrl, filename) }, 
        { icon: songData.is_favorite ? 'fas fa-heart' : 'far fa-heart', text: songData.is_favorite ? 'Убрать из избранного' : 'В избранное', action: () => toggleFavorite(songData.id, card), className: 'favorite-action' }, 
        { icon: 'fas fa-trash', text: 'Удалить', action: () => showConfirmationModal(`Вы уверены, что хотите удалить песню "${songData.title}"?`, () => deleteSong(songData.id, card)), className: 'delete' } 
    ];

    menuItems.forEach(item => { 
        if (item.nodeName) { menu.appendChild(item); } else {
            const li = document.createElement('li'); 
            li.className = 'menu-item ' + (item.className || ''); 
            li.innerHTML = `<i class="${item.icon}"></i> ${item.text}`; 
            li.onclick = item.action; 
            menu.appendChild(li);
        }
    });

    const projectsForMenu = [{ id: null, name: 'Без проекта' }, ...projects];
    projectsForMenu.forEach(p => {
        const subItem = document.createElement('li');
        subItem.className = 'menu-item';
        subItem.textContent = p.name;
        subItem.onclick = (e) => { e.stopPropagation(); moveSongToProject(songData.id, p.id, card); menu.classList.remove('active'); };
        moveSubMenu.appendChild(subItem);
    });

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

export async function loadSongsFromServer(projectId = null) {
    try {
        const url = projectId ? `/api/songs?projectId=${projectId}` : '/api/songs';
        const response = await fetch(url, { headers: getAuthHeaders() });
        if (!response.ok) throw new Error('Network response was not ok');
        playlist = await response.json();
        renderLibrary();
    } catch (e) {
        console.error("Не удалось загрузить песни с сервера", e);
        songListContainer.innerHTML = '<p id="empty-list-message" style="color: var(--accent-red);">Ошибка загрузки песен.</p>';
    }
}

export function createPlaceholderCard(taskId) {
    for (let i = 1; i <= 2; i++) {
        const card = document.createElement('div');
        card.className = 'song-card placeholder';
        card.id = `placeholder-${taskId}-${i}`;
        card.innerHTML = `<div class="song-cover"><div class="song-duration">--:--</div><div class="play-icon"><i class="fas fa-play"></i></div></div><div class="song-info"><span class="song-title">Генерация...</span><span class="song-style">Пожалуйста, подождите</span><div class="progress-bar-container"><div class="progress-bar-inner"></div></div></div>`;
        songListContainer.prepend(card);
    }
    updateAllPlayIcons();
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

async function handleDeleteProject(projectId, projectName) {
    showConfirmationModal(
        `Вы уверены, что хотите удалить проект "${projectName}"? Все песни из него будут перемещены в "Без проекта".`,
        async () => {
            try {
                const response = await fetch(`/api/projects/${projectId}`, { 
                    method: 'DELETE',
                    headers: getAuthHeaders()
                });
                if (response.ok) {
                    activeProjectId = null;
                    fetchProjects();
                } else {
                    const result = await response.json();
                    console.error('Не удалось удалить проект:', result.message);
                }
            } catch (error) {
                console.error('Ошибка при удалении проекта:', error);
            }
        }
    );
}

export async function fetchProjects() {
    try {
        const response = await fetch('/api/projects', { headers: getAuthHeaders() });
        if (!response.ok) {
            if (response.status === 401) {
                sessionStorage.removeItem('authToken');
                window.location.reload();
                return;
            }
            throw new Error('Server responded with an error');
        }
        projects = await response.json();
        renderProjects();
        loadSongsFromServer(activeProjectId);
    } catch (error) {
        console.error('Не удалось загрузить проекты:', error);
    }
}

function renderProjects() {
    projectListContainer.innerHTML = '';
    
    const uncategorizedBtn = document.createElement('button');
    uncategorizedBtn.className = 'project-item';
    uncategorizedBtn.textContent = 'Без проекта';
    uncategorizedBtn.dataset.projectId = 'null';
    if (activeProjectId === null) {
        uncategorizedBtn.classList.add('active');
    }
    uncategorizedBtn.onclick = () => {
        activeProjectId = null;
        loadSongsFromServer(null);
        renderProjects();
    };
    projectListContainer.appendChild(uncategorizedBtn);

    projects.forEach(project => {
        const projectBtn = document.createElement('button');
        projectBtn.className = 'project-item';
        projectBtn.dataset.projectId = project.id;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = project.name;
        projectBtn.appendChild(nameSpan);

        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-times delete-project-icon';
        projectBtn.appendChild(deleteIcon);

        if (activeProjectId === project.id) {
            projectBtn.classList.add('active');
        }

        projectBtn.addEventListener('click', (e) => {
            if (e.target === deleteIcon) return;
            activeProjectId = project.id;
            loadSongsFromServer(project.id);
            renderProjects();
        });

        deleteIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            handleDeleteProject(project.id, project.name);
        });

        projectListContainer.appendChild(projectBtn);
    });
}