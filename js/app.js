// Это главный JS-файл вашего приложения.
// Он импортирует функции из других модулей и связывает их вместе,
// инициализирует приложение и устанавливает основные обработчики событий.

import { handleApiCall } from './api.js';
import { initializeLibrary, loadSongsFromServer, setupLibraryTabs, fetchProjects, toggleLibraryView, fetchImagesFromServer } from './library.js';
import { initializePlayer, getPlayerState, showSimpleLyrics } from './player.js';
import { getSongToEdit, resetEditViews } from './editor.js';
import { 
    showView, 
    showLibraryView,
    setupSliderListeners, 
    setupCharCounters, 
    updateAllLimits, 
    setupCustomSelect, 
    setupInstrumentalToggle,
    validateField,
    updateStatus,
    setupConfirmationModal
} from './ui.js';

// --- ГЛОБАЛЬНАЯ ПЕРЕМЕННАЯ ДЛЯ КОЛЛБЭКА GOOGLE ---
window.handleGoogleCredentialResponse = handleGoogleCredentialResponse;

// --- НОВАЯ ФУНКЦИЯ ДЛЯ ЗАГРУЗКИ СКРИПТА GOOGLE ---
function loadGoogleGSI() {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

// --- ФУНКЦИИ УПРАВЛЕНИЯ ИНТЕРФЕЙСОМ ---
function loadUserProfile() {
    const token = sessionStorage.getItem('authToken');
    if (!token) return;

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        document.getElementById('profile-avatar').src = payload.picture || 'https://via.placeholder.com/40';
        document.getElementById('profile-name').textContent = payload.name || 'Профиль';
    } catch (e) {
        console.error('Не удалось декодировать токен:', e);
    }
}

function showApp() {
    document.getElementById('landing-page').style.display = 'none';
    const appContainer = document.getElementById('app-container');
    const appTemplate = document.getElementById('app-template');
    if (appContainer.children.length === 0) {
        appContainer.appendChild(appTemplate.content.cloneNode(true));
    }
    appContainer.style.display = 'block';
    document.body.style.overflow = '';
    initializeApp();
}

// --- ГЛАВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ ---
function initializeApp() {
    try {
        const token = sessionStorage.getItem('authToken');
        const payload = JSON.parse(atob(token.split('.')[1]));
        const isAdmin = payload.isAdmin === true;
        const logsNavButton = document.getElementById('logs-nav-button');
        if (logsNavButton && !isAdmin) {
            logsNavButton.style.display = 'none';
        }
    } catch (e) {
        console.error('Не удалось проверить права администратора, скрываем логи по умолчанию.', e);
        const logsNavButton = document.getElementById('logs-nav-button');
        if(logsNavButton) {
            logsNavButton.style.display = 'none';
        }
    }

    loadUserProfile();
    initializeLibrary();
    initializePlayer();
    setupEventListeners();
    handleApiCall("/api/chat/credit", { method: "GET" }, true);
}

// --- ЛОГИКА АВТОРИЗАЦИИ ---
async function handleGoogleCredentialResponse(response) {
    const loginError = document.getElementById('login-error-message');
    try {
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential })
        });
        const result = await res.json();
        if (res.ok && result.success) {
            sessionStorage.setItem('authToken', result.token);
            document.getElementById('login-overlay').style.display = 'none';
            showApp();
        } else {
            loginError.textContent = result.message || 'Ошибка входа через Google';
        }
    } catch (error) {
        console.error('Ошибка при входе через Google:', error);
        loginError.textContent = 'Сетевая ошибка. Попробуйте снова.';
    }
}

async function handleLogin() {
    const loginElements = { 
        overlay: document.getElementById('login-overlay'), 
        input: document.getElementById('access-key-input'), 
        error: document.getElementById('login-error-message') 
    };

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: loginElements.input.value })
        });

        const result = await response.json();
        if (response.ok && result.success) {
            sessionStorage.setItem('authToken', result.token);
            loginElements.overlay.style.display = 'none';
            showApp();
        } else {
            loginElements.error.textContent = result.message || 'Неверный ключ'; 
            loginElements.input.value = '';
        }
    } catch (error) {
        console.error('Ошибка при входе:', error);
        loginElements.error.textContent = 'Ошибка сети. Попробуйте снова.';
    }
}

function setupEventListeners() {
    const mobileLibraryBtn = document.getElementById('mobile-library-btn');
    const mobileNavViewBtns = document.querySelectorAll('.mobile-nav-btn[data-view]');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const globalPlayer = document.getElementById('global-player');

    const toggleSidebar = () => { sidebar.classList.toggle('is-open'); sidebarOverlay.classList.toggle('is-visible'); };
    document.getElementById('mobile-menu-toggle').addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', toggleSidebar);

    mobileNavViewBtns.forEach(button => {
        button.addEventListener('click', () => showView(button.dataset.view));
    });

    mobileLibraryBtn.addEventListener('click', showLibraryView);

    document.getElementById('profile-container').addEventListener('click', () => {
        showView('profile');
    });

    document.querySelectorAll('.sidebar-nav .nav-button').forEach(button => {
        button.addEventListener('click', () => {
            const viewName = button.dataset.view;
            if (viewName) {
                showView(viewName);
            }
        });
    });

    document.getElementById('logout-button').addEventListener('click', () => {
        sessionStorage.removeItem('authToken');
        window.location.reload();
    });

    globalPlayer.addEventListener('click', (e) => {
        if (window.innerWidth > 768 || e.target.closest('button') || e.target.closest('input[type="range"]')) return;
        const { currentSongId } = getPlayerState();
        if (currentSongId) showSimpleLyrics(currentSongId);
    });

    setupSliderListeners();
    setupCharCounters();
    updateAllLimits();
    setupLibraryTabs();

    const projectModal = document.getElementById('project-modal-overlay');
    document.getElementById('add-project-btn').addEventListener('click', () => projectModal.style.display = 'flex');
    document.getElementById('project-modal-close-btn').addEventListener('click', () => projectModal.style.display = 'none');
    projectModal.addEventListener('click', (e) => { if(e.target === projectModal) projectModal.style.display = 'none'; });
    document.getElementById('create-project-submit-btn').addEventListener('click', handleCreateProject);

    setupConfirmationModal();

    document.getElementById("g-customMode").addEventListener('change', () => {
        const isCustom = document.getElementById('g-customMode').checked;
        document.getElementById('simple-mode-fields').style.display = isCustom ? 'none' : 'flex';
        document.getElementById('custom-mode-fields').style.display = isCustom ? 'flex' : 'none';
    });
    document.getElementById("uc-customMode").addEventListener('change', () => {
        const isCustom = document.getElementById('uc-customMode').checked;
        document.getElementById('uc-simple-mode-fields').style.display = isCustom ? 'none' : 'flex';
        document.getElementById('uc-custom-mode-fields').style.display = isCustom ? 'flex' : 'none';
    });
    document.getElementById("ue-customMode").addEventListener('change', () => {
        const isCustom = document.getElementById('ue-customMode').checked;
        document.getElementById('ue-simple-mode-fields').style.display = isCustom ? 'none' : 'flex';
        document.getElementById('ue-custom-mode-fields').style.display = isCustom ? 'flex' : 'none';
    });

    setupInstrumentalToggle('g-instrumental', 'g-prompt-group', 'g-vocalGender-group');
    setupInstrumentalToggle('uc-instrumental', 'uc-prompt-group', 'uc-vocalGender-group');
    setupInstrumentalToggle('ue-instrumental', 'ue-prompt-group', 'ue-vocalGender-group');
    
    setupCustomSelect('select-model-button', 'select-model-dropdown', 'g-model-value');
    setupCustomSelect('select-model-button-uc', 'select-model-dropdown-uc', 'uc-model-value');
    setupCustomSelect('select-model-button-ue', 'select-model-dropdown-ue', 'ue-model-value');

    document.getElementById("generate-music-form").addEventListener("submit", handleGenerateSubmit);
    document.getElementById("upload-cover-form").addEventListener("submit", handleCoverSubmit);
    document.getElementById("upload-extend-form").addEventListener("submit", handleExtendSubmit);
    document.getElementById("midjourney-form").addEventListener("submit", handleMidjourneySubmit);
    
    document.getElementById('boost-style-button').addEventListener('click', handleBoostStyle);

    window.addEventListener("click", () => { 
        document.querySelectorAll('.select-dropdown.open').forEach(d => d.classList.remove('open'));
        document.querySelectorAll('.song-menu.active').forEach(menu => {
            menu.classList.remove('active');
            menu.closest('.song-card').classList.remove('menu-is-active');
        }); 
        document.querySelectorAll('.move-to-project-submenu.is-open').forEach(menu => menu.classList.remove('is-open'));
    });
}

// --- FORM VALIDATION ---
function validateGenerateForm() {
    const isCustom = document.getElementById("g-customMode").checked;
    if (isCustom) {
        const isInstrumental = document.getElementById("g-instrumental").checked;
        let valid = validateField(document.getElementById('g-title')) && validateField(document.getElementById('g-style'));
        if (!isInstrumental) {
            valid = valid && validateField(document.getElementById('g-prompt'));
        }
        return valid;
    } else {
        return validateField(document.getElementById('g-song-description'));
    }
}

function validateUploadCoverForm() {
    const songToEdit = getSongToEdit();
    const url = songToEdit ? songToEdit.songData.audioUrl : document.getElementById('uc-uploadUrl').value;
    if (!url || !url.trim()) {
        const field = document.getElementById('uc-uploadUrl');
        field.classList.add('input-error');
        setTimeout(() => field.classList.remove('input-error'), 1000);
        return false;
    }

    const isCustom = document.getElementById("uc-customMode").checked;
    if (isCustom) {
        const isInstrumental = document.getElementById("uc-instrumental").checked;
        let valid = validateField(document.getElementById('uc-title')) && validateField(document.getElementById('uc-style'));
        if (!isInstrumental) {
            valid = valid && validateField(document.getElementById('uc-prompt'));
        }
        return valid;
    } else {
        return validateField(document.getElementById('uc-song-description'));
    }
}

function validateUploadExtendForm() {
    const songToEdit = getSongToEdit();
    const url = songToEdit ? songToEdit.songData.audioUrl : document.getElementById('ue-uploadUrl').value;
    if (!url || !url.trim()) {
        const field = document.getElementById('ue-uploadUrl');
        field.classList.add('input-error');
        setTimeout(() => field.classList.remove('input-error'), 1000);
        return false;
    }

    const isCustom = document.getElementById("ue-customMode").checked;
    if (isCustom) {
        const isInstrumental = document.getElementById("ue-instrumental").checked;
        let valid = validateField(document.getElementById('ue-continueAt')) && validateField(document.getElementById('ue-title')) && validateField(document.getElementById('ue-style'));
        if (!isInstrumental) {
            valid = valid && validateField(document.getElementById('ue-prompt'));
        }
        return valid;
    } else {
        return validateField(document.getElementById('ue-prompt-simple'));
    }
}

// --- FORM SUBMIT HANDLERS ---
function handleGenerateSubmit(e) {
    e.preventDefault();
    if (!validateGenerateForm()) return;
    const isCustom = document.getElementById("g-customMode").checked;
    const model = document.getElementById("g-model-value").value;
    
    let payload = {
        model,
        customMode: isCustom,
        callBackUrl: "https://api.example.com/callback"
    };

    if (isCustom) {
        const isInstrumental = document.getElementById("g-instrumental").checked;
        payload.title = document.getElementById('g-title').value;
        payload.style = document.getElementById('g-style').value;
        payload.instrumental = isInstrumental;
        payload.negativeTags = document.getElementById('g-negativeTags').value;
        payload.styleWeight = parseFloat(document.getElementById('g-styleWeight').value);
        payload.weirdnessConstraint = parseFloat(document.getElementById('g-weirdnessConstraint').value);

        if (!isInstrumental) {
            payload.prompt = document.getElementById('g-prompt').value;
            const vocalGender = document.getElementById('g-vocalGender').value;
            if (vocalGender) payload.vocalGender = vocalGender;
        }
    } else {
        payload.prompt = document.getElementById('g-song-description').value;
        payload.instrumental = document.getElementById('g-instrumental-simple').checked;
    }
    handleApiCall("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true, 'suno');
}

function handleMidjourneySubmit(e) {
    e.preventDefault();
    if (!validateField(document.getElementById('mj-prompt'))) return;

    const payload = {
        taskType: "mj_txt2img",
        prompt: document.getElementById('mj-prompt').value,
        version: document.getElementById('mj-version').value,
        aspectRatio: document.getElementById('mj-aspect-ratio').value,
        speed: document.getElementById('mj-speed').value,
        stylization: parseInt(document.getElementById('mj-stylization').value, 10),
        weirdness: parseInt(document.getElementById('mj-weirdness').value, 10),
        variety: parseInt(document.getElementById('mj-variety').value, 10),
    };

    handleApiCall("/api/mj/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true, 'mj');
}

function handleCoverSubmit(e) {
    e.preventDefault();
    if (!validateUploadCoverForm()) return;
    const songToEdit = getSongToEdit();
    const isCustom = document.getElementById("uc-customMode").checked;
    const model = document.getElementById('uc-model-value').value;
    const uploadUrl = songToEdit ? songToEdit.songData.audioUrl : document.getElementById("uc-uploadUrl").value;

    let payload = {
        model: model,
        customMode: isCustom,
        uploadUrl: uploadUrl,
        callBackUrl: "https://api.example.com/callback"
    };

    if (isCustom) {
        const isInstrumental = document.getElementById("uc-instrumental").checked;
        payload.title = document.getElementById('uc-title').value;
        payload.style = document.getElementById('uc-style').value;
        payload.instrumental = isInstrumental;
        
        const optionalFields = { negativeTags: 'uc-negativeTags', styleWeight: 'uc-styleWeight', weirdnessConstraint: 'uc-weirdnessConstraint', audioWeight: 'uc-audioWeight' };
        for (const key in optionalFields) {
            const element = document.getElementById(optionalFields[key]);
            if (element.value) { payload[key] = (element.type === 'range') ? parseFloat(element.value) : element.value; }
        }

        if (!isInstrumental) {
            payload.prompt = document.getElementById('uc-prompt').value;
            const vocalGender = document.getElementById('uc-vocalGender').value;
            if (vocalGender) payload.vocalGender = vocalGender;
        }
    } else {
        payload.prompt = document.getElementById('uc-song-description').value;
    }
    handleApiCall("/api/generate/upload-cover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true, 'suno');
    resetEditViews();
}

function handleExtendSubmit(e) {
    e.preventDefault();
    if (!validateUploadExtendForm()) return;
    const songToEdit = getSongToEdit();
    const isCustom = document.getElementById("ue-customMode").checked;
    const model = document.getElementById('ue-model-value').value;
    const uploadUrl = songToEdit ? songToEdit.songData.audioUrl : document.getElementById("ue-uploadUrl").value;

    let payload = {
        model: model,
        defaultParamFlag: isCustom,
        uploadUrl: uploadUrl,
        callBackUrl: "https://api.example.com/callback"
    };

    if (isCustom) {
        const isInstrumental = document.getElementById("ue-instrumental").checked;
        payload.title = document.getElementById('ue-title').value;
        payload.style = document.getElementById('ue-style').value;
        payload.continueAt = document.getElementById('ue-continueAt').value;
        payload.instrumental = isInstrumental;

        const optionalFields = { negativeTags: 'ue-negativeTags', styleWeight: 'ue-styleWeight', weirdnessConstraint: 'ue-weirdnessConstraint', audioWeight: 'ue-audioWeight' };
        for (const key in optionalFields) {
            const element = document.getElementById(optionalFields[key]);
            if (element.value) { payload[key] = (element.type === 'range') ? parseFloat(element.value) : element.value; }
        }

        if (!isInstrumental) {
            payload.prompt = document.getElementById('ue-prompt').value;
            const vocalGender = document.getElementById('ue-vocalGender').value;
            if (vocalGender) payload.vocalGender = vocalGender;
        }
    } else {
        payload.prompt = document.getElementById('ue-prompt-simple').value;
    }
    handleApiCall("/api/generate/upload-extend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false, true, 'suno');
    resetEditViews();
}

async function handleBoostStyle(e) {
    e.preventDefault();
    const styleTextarea = document.getElementById('g-style');
    const currentStyle = styleTextarea.value.trim();
    if (!currentStyle) {
        styleTextarea.classList.add('input-error');
        setTimeout(() => styleTextarea.classList.remove('input-error'), 1000);
        return;
    }

    const boostButton = document.getElementById('boost-style-button');
    boostButton.disabled = true;
    boostButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const response = await fetch('/api/boost-style', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: currentStyle })
        });
        const result = await response.json();
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
}

async function handleCreateProject() {
    const input = document.getElementById('project-name-input');
    const errorMsg = document.getElementById('project-error-message');
    const name = input.value.trim();

    if (!name) {
        errorMsg.textContent = 'Название не может быть пустым.';
        return;
    }

    try {
        const response = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (response.ok) {
            input.value = '';
            errorMsg.textContent = '';
            document.getElementById('project-modal-overlay').style.display = 'none';
            fetchProjects(); 
        } else {
            const result = await response.json();
            errorMsg.textContent = result.message || 'Ошибка сервера';
        }
    } catch (error) {
        errorMsg.textContent = 'Сетевая ошибка. Попробуйте снова.';
    }
}

// --- ЗАПУСК ПРИЛОЖЕНИЯ (ФИНАЛЬНАЯ ВЕРСИЯ) ---
async function verifyUserSession() {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        return false;
    }
    try {
        const response = await fetch('/api/auth/verify', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            return true;
        } else {
            sessionStorage.removeItem('authToken');
            return false;
        }
    } catch (error) {
        console.error("Ошибка проверки сессии:", error);
        return false;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const loginOverlay = document.getElementById('login-overlay');
    const loginCloseButton = document.getElementById('login-close-button');
    const landingPage = document.getElementById('landing-page');
    const appContainer = document.getElementById('app-container');

    const showLogin = () => loginOverlay.style.display = 'flex';
    const hideLogin = () => loginOverlay.style.display = 'none';

    document.querySelectorAll('.dashboard-card:not(.disabled)').forEach(card => {
        card.addEventListener('click', showLogin);
    });

    loginCloseButton.addEventListener('click', hideLogin);
    loginOverlay.addEventListener('click', (e) => {
        if (e.target === loginOverlay) hideLogin();
    });
    document.getElementById('access-key-button').addEventListener('click', handleLogin);
    document.getElementById('access-key-input').addEventListener('keydown', (e) => { 
        if (e.key === 'Enter') handleLogin(); 
    });

    const isLoggedIn = await verifyUserSession();

    if (isLoggedIn) {
        showApp();
    } else {
        landingPage.style.display = 'block';
        appContainer.style.display = 'none';
        loadGoogleGSI();
    }
});