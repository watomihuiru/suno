import { modelLimits, extendModelLimits } from './config.js';

let currentViewName = 'generate';

export function formatTime(seconds) {
    if (isNaN(seconds) || seconds === null || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function updateStatus(message, isSuccess = false, isError = false) {
    const statusContainer = document.getElementById("status-container");
    if (statusContainer) {
        statusContainer.innerHTML = `<div class="status-message ${isSuccess ? 'success' : ''} ${isError ? 'error' : ''}">${message}</div>`;
    }
}

export function showView(viewName) {
    if (currentViewName === viewName) return;
    document.querySelectorAll('.main-content .view-content').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav .nav-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(viewName).classList.add('active');
    document.querySelector(`.nav-button[data-view="${viewName}"]`).classList.add('active');
    currentViewName = viewName;
    
    const { resetEditViews } = import('./editor.js');
    resetEditViews();
}

export function setupSliderListeners() {
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        const valueSpan = slider.nextElementSibling;
        if (valueSpan && valueSpan.classList.contains('slider-value')) {
            slider.addEventListener('input', () => {
                valueSpan.textContent = slider.value;
            });
        }
    });
}

function updateCountersUI(element, limit) {
    const counter = document.getElementById(`${element.id}-counter`);
    if (counter) {
        const length = element.value.length;
        counter.textContent = `${length}/${limit}`;
        counter.classList.toggle('limit-exceeded', length > limit);
    }
}

export function updateAllLimits() {
    // Generate Form
    const g_model = document.getElementById('g-model-value').value;
    const g_limits = modelLimits[g_model] || modelLimits['V4_5PLUS'];
    const g_fields = [
        { id: 'g-title', limit: modelLimits.title },
        { id: 'g-song-description', limit: modelLimits.songDescription },
        { id: 'g-style', limit: g_limits.style },
        { id: 'g-prompt', limit: g_limits.prompt }
    ];
    g_fields.forEach(field => {
        const element = document.getElementById(field.id);
        if (element) {
            element.maxLength = field.limit;
            updateCountersUI(element, field.limit);
        }
    });

    // Upload Cover Form
    const uc_model = document.getElementById('uc-model-value').value;
    const uc_limits = modelLimits[uc_model] || modelLimits['V4_5PLUS'];
    const uc_fields = [
        { id: 'uc-title', limit: modelLimits.title },
        { id: 'uc-song-description', limit: modelLimits.songDescription },
        { id: 'uc-style', limit: uc_limits.style },
        { id: 'uc-prompt', limit: uc_limits.prompt }
    ];
    uc_fields.forEach(field => {
        const element = document.getElementById(field.id);
        if (element) {
            element.maxLength = field.limit;
            updateCountersUI(element, field.limit);
        }
    });

    // Upload Extend Form
    const ue_model = document.getElementById('ue-model-value').value;
    const ue_limits = extendModelLimits[ue_model] || extendModelLimits['V4_5PLUS'];
    const ue_fields = [
        { id: 'ue-title', limit: ue_limits.title },
        { id: 'ue-style', limit: ue_limits.style },
        { id: 'ue-prompt', limit: ue_limits.prompt },
        { id: 'ue-prompt-simple', limit: ue_limits.prompt }
    ];
    ue_fields.forEach(field => {
        const element = document.getElementById(field.id);
        if (element) {
            element.maxLength = field.limit;
            updateCountersUI(element, field.limit);
        }
    });
}

export function setupCharCounters() {
    ['g-title', 'g-song-description', 'g-style', 'g-prompt', 'uc-title', 'uc-song-description', 'uc-style', 'uc-prompt', 'ue-title', 'ue-style', 'ue-prompt', 'ue-prompt-simple'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => updateCountersUI(element, element.maxLength));
        }
    });
}

export function setupCustomSelect(buttonId, dropdownId, valueInputId) {
    const selectButton = document.getElementById(buttonId);
    const selectDropdown = document.getElementById(dropdownId);
    const valueInput = document.getElementById(valueInputId);

    selectButton.addEventListener("click", e => { e.stopPropagation(); selectDropdown.classList.toggle("open"); });
    selectDropdown.addEventListener("click", e => {
        if (e.target.classList.contains("select-option")) {
            const currentSelected = selectDropdown.querySelector('.select-option.selected');
            if (currentSelected) currentSelected.classList.remove('selected');
            e.target.classList.add('selected');
            valueInput.value = e.target.dataset.value;
            selectButton.textContent = e.target.textContent;
            selectDropdown.classList.remove("open");
            updateAllLimits();
        }
    });
}

export function setupInstrumentalToggle(toggleId, promptGroupId, vocalGenderGroupId) {
    const instrumentalToggle = document.getElementById(toggleId);
    const promptGroup = document.getElementById(promptGroupId);
    const vocalGenderGroup = document.getElementById(vocalGenderGroupId);

    function toggleFields() {
        const isInstrumental = instrumentalToggle.checked;
        if (promptGroup) promptGroup.style.display = isInstrumental ? 'none' : 'flex';
        if (vocalGenderGroup) vocalGenderGroup.style.display = isInstrumental ? 'none' : 'flex';
    }
    instrumentalToggle.addEventListener('change', toggleFields);
    toggleFields();
}

export function copyToClipboard(text, element) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = element.textContent;
        element.textContent = 'Скопировано!';
        element.style.color = 'var(--accent-green)';
        setTimeout(() => {
            element.textContent = originalText;
            element.style.color = '';
        }, 1500);
    });
}

export function validateField(field) {
    if (!field || !field.value.trim()) {
        if (field) {
            field.classList.add('input-error');
            setTimeout(() => field.classList.remove('input-error'), 1000);
        }
        return false;
    }
    return true;
}