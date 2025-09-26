import { updateStatus } from './ui.js';
import { loadSongsFromServer } from './library.js';

let taskWebSocket = null;

export async function handleApiCall(endpoint, options, isCreditCheck = false, isGeneration = false) {
    const responseOutput = document.getElementById("response-output");
    if (!isCreditCheck) {
        updateStatus('Ожидание запуска задачи...');
        responseOutput.textContent = "Выполняется запрос...";
    }
    if (taskWebSocket && !isCreditCheck) {
        taskWebSocket.close();
        taskWebSocket = null;
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
            if (!isCreditCheck) responseOutput.textContent = JSON.stringify(result, null, 2);
            if (isCreditCheck && result.data !== undefined) {
                document.getElementById("credits-value").textContent = result.data;
                document.getElementById("credits-container").style.display = 'inline-flex';
                document.getElementById("mobile-credits-value").textContent = result.data;
                document.getElementById("mobile-credits-container").style.display = 'inline-flex';
            }
            if (isGeneration && result.data && result.data.taskId) {
                startTaskTracking(result.data.taskId);
            } else if (isGeneration) {
                updateStatus(`🚫 Ошибка запуска: ${result.message || 'Не удалось получить taskId.'}`, false, true);
            }
        } else {
            if (!isCreditCheck) responseOutput.textContent = `🚫 Ошибка ${response.status}:\n\n${JSON.stringify(result, null, 2)}`;
            updateStatus(`🚫 Ошибка запуска: ${result.message || 'Сервер вернул ошибку.'}`, false, true);
        }
    } catch (error) {
        if (!isCreditCheck) responseOutput.textContent = "💥 Сетевая ошибка:\n\n" + error.message;
        updateStatus(`💥 Критическая ошибка: ${error.message}`, false, true);
    }
}

async function startTaskTracking(taskId) {
    if (taskWebSocket) {
        taskWebSocket.close();
    }
    
    const { createPlaceholderCard } = await import('./library.js');
    createPlaceholderCard(taskId);
    
    updateStatus(`⏳ Задача ${taskId.slice(0, 8)}... в очереди.`);

    const token = sessionStorage.getItem('authToken');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?token=${token}`;
    taskWebSocket = new WebSocket(wsUrl);

    taskWebSocket.onopen = () => {
        console.log('WebSocket соединение установлено.');
        taskWebSocket.send(JSON.stringify({ type: 'trackTask', taskId: taskId }));
    };

    taskWebSocket.onmessage = async (event) => {
        try {
            const result = JSON.parse(event.data);
            document.getElementById("response-output").textContent = JSON.stringify(result, null, 2);

            if (result.error) {
                throw new Error(result.message || "Сервер вернул ошибку WebSocket");
            }
            
            if (!result.data) {
                 throw new Error(result.message || "Некорректный ответ от API");
            }

            const taskData = result.data;
            const statusLowerCase = taskData.status.toLowerCase();
            const successStatuses = ["success", "completed"];
            const pendingStatuses = ["pending", "running", "submitted", "queued", "text_success", "first_success"];

            if (successStatuses.includes(statusLowerCase)) {
                taskWebSocket.close();
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
        } catch (error) {
            taskWebSocket.close();
            updateStatus(`🚫 Ошибка проверки: ${error.message}`, false, true);
            document.getElementById(`placeholder-${taskId}-1`)?.remove();
            document.getElementById(`placeholder-${taskId}-2`)?.remove();
        }
    };

    taskWebSocket.onerror = (error) => {
        console.error('WebSocket ошибка:', error);
        updateStatus(`🚫 Ошибка WebSocket соединения.`, false, true);
        document.getElementById(`placeholder-${taskId}-1`)?.remove();
        document.getElementById(`placeholder-${taskId}-2`)?.remove();
    };

    taskWebSocket.onclose = () => {
        console.log('WebSocket соединение закрыто.');
        taskWebSocket = null;
    };
}