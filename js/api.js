import { updateStatus } from './ui.js';
import { loadSongsFromServer, fetchImagesFromServer } from './library.js';

let taskWebSocket = null;

export async function handleApiCall(endpoint, options, isCreditCheck = false, isGeneration = false, taskType = 'suno') {
    const responseOutput = document.getElementById("response-output");

    if (taskWebSocket) {
        taskWebSocket.close();
        taskWebSocket = null;
    }

    if (!isCreditCheck) {
        updateStatus('Ожидание запуска задачи...');
        if (responseOutput) {
            responseOutput.textContent = "Выполняется запрос...";
        }
    }

    const token = sessionStorage.getItem('authToken');
    if (token) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
    }

    try {
        const response = await fetch(endpoint, options);

        if (response.status === 401) {
            console.error("Ошибка авторизации. Токен недействителен или отсутствует.");
            sessionStorage.removeItem('authToken');
            window.location.reload();
            return;
        }

        const result = await response.json();

        if (response.ok) {
            if (!isCreditCheck && responseOutput) {
                responseOutput.textContent = JSON.stringify(result, null, 2);
            }
            if (isCreditCheck && result.data !== undefined) {
                const mobileCreditsValue = document.getElementById("mobile-credits-value");
                if (mobileCreditsValue) mobileCreditsValue.textContent = result.data;
                
                const mobileCreditsContainer = document.getElementById("mobile-credits-container");
                if (mobileCreditsContainer) mobileCreditsContainer.style.display = 'inline-flex';
            }
            if (isGeneration && result.data && result.data.taskId) {
                startTaskTracking(result.data.taskId, taskType);
            } else if (isGeneration) {
                updateStatus(`🚫 Ошибка запуска: ${result.message || 'Не удалось получить taskId.'}`, false, true);
            }
        } else {
            if (!isCreditCheck && responseOutput) {
                responseOutput.textContent = `🚫 Ошибка ${response.status}:\n\n${JSON.stringify(result, null, 2)}`;
            }
            updateStatus(`🚫 Ошибка запуска: ${result.message || 'Сервер вернул ошибку.'}`, false, true);
        }
    } catch (error) {
        if (!isCreditCheck && responseOutput) {
            responseOutput.textContent = "💥 Сетевая ошибка:\n\n" + error.message;
        }
        updateStatus(`💥 Критическая ошибка: ${error.message}`, false, true);
    }
}

function createMjPlaceholderCard(taskId, count = 4) {
    const resultsGrid = document.getElementById('image-gallery-grid');
    if(!resultsGrid) return;
    document.getElementById('image-gallery-empty-message').style.display = 'none';

    for (let i = 1; i <= count; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'mj-gallery-item placeholder';
        placeholder.id = `placeholder-${taskId}-${i}`;
        placeholder.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
        resultsGrid.prepend(placeholder);
    }
}

async function startTaskTracking(taskId, taskType) {
    if (taskWebSocket) {
        taskWebSocket.close();
        taskWebSocket = null;
    }
    
    if (taskType === 'suno') {
        const { createPlaceholderCard } = await import('./library.js');
        createPlaceholderCard(taskId);
    } else if (taskType.startsWith('mj')) {
        const isSingleImageTask = taskType === 'mj_upscale' || taskType === 'mj_vary';
        createMjPlaceholderCard(taskId, isSingleImageTask ? 1 : 4);
    }
    
    updateStatus(`⏳ Задача ${taskId.slice(0, 8)}... в очереди.`);

    const token = sessionStorage.getItem('authToken');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?token=${token}`;
    taskWebSocket = new WebSocket(wsUrl);

    taskWebSocket.onopen = () => {
        console.log('WebSocket соединение установлено.');
        taskWebSocket.send(JSON.stringify({ type: 'trackTask', taskId: taskId, taskType: taskType }));
    };

    taskWebSocket.onmessage = async (event) => {
        const responseOutput = document.getElementById("response-output");
        try {
            const result = JSON.parse(event.data);
            if (responseOutput) {
                responseOutput.textContent = JSON.stringify(result, null, 2);
            }

            if (result.error) { throw new Error(result.message || "Сервер вернул ошибку WebSocket"); }
            if (!result.data) { throw new Error(result.message || "Некорректный ответ от API"); }

            const taskData = result.data;

            if (taskType.startsWith('mj')) {
                if ([1, 2, 3].includes(taskData.successFlag)) {
                    if(taskWebSocket) taskWebSocket.close();
                    taskWebSocket = null;
                    document.querySelectorAll(`[id^="placeholder-${taskId}-"]`).forEach(el => el.remove());

                    if (taskData.successFlag === 1) {
                        updateStatus("✅ Изображения сгенерированы!", true);
                        await fetchImagesFromServer(); 
                    } else {
                        throw new Error(taskData.errorMessage || `API вернул статус сбоя: ${taskData.successFlag}`);
                    }
                } else {
                     updateStatus(`⏳ Статус: Генерация...`);
                }

            } else { // Suno logic
                const statusLowerCase = taskData.status.toLowerCase();
                const successStatuses = ["success", "completed"];
                const pendingStatuses = ["pending", "running", "submitted", "queued", "text_success", "first_success"];

                if (successStatuses.includes(statusLowerCase)) {
                    if(taskWebSocket) taskWebSocket.close();
                    taskWebSocket = null;
                    updateStatus("✅ Задача выполнена!", true);
                    document.getElementById(`placeholder-${taskId}-1`)?.remove();
                    document.getElementById(`placeholder-${taskId}-2`)?.remove();
                    await loadSongsFromServer();
                    const token = sessionStorage.getItem('authToken');
                    await handleApiCall("/api/chat/credit", { 
                        method: "GET",
                        headers: { 'Authorization': `Bearer ${token}` }
                    }, true);
                } else if (pendingStatuses.includes(statusLowerCase)) {
                    updateStatus(`⏳ Статус: ${taskData.status}...`);
                } else {
                    throw new Error(taskData.errorMessage || `API вернул статус сбоя: ${taskData.status}`);
                }
            }
        } catch (error) {
            updateStatus(`🚫 Ошибка проверки: ${error.message}`, false, true);
            document.querySelectorAll(`[id^="placeholder-${taskId}-"]`).forEach(el => el.remove());
            if(taskWebSocket) taskWebSocket.close();
            taskWebSocket = null;
        }
    };

    taskWebSocket.onerror = (error) => {
        console.error('WebSocket ошибка:', error);
        updateStatus(`🚫 Ошибка WebSocket соединения.`, false, true);
        document.querySelectorAll(`[id^="placeholder-${taskId}-"]`).forEach(el => el.remove());
        if (taskWebSocket) {
            taskWebSocket.close();
            taskWebSocket = null;
        }
    };

    taskWebSocket.onclose = () => {
        console.log('WebSocket соединение закрыто.');
        taskWebSocket = null;
    };
}