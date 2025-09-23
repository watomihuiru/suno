import { updateStatus } from './ui.js';
import { loadSongsFromServer } from './library.js';

let pollingInterval;

export async function handleApiCall(endpoint, options, isCreditCheck = false, isGeneration = false) {
    const responseOutput = document.getElementById("response-output");
    if (!isCreditCheck) {
        updateStatus('Ожидание запуска задачи...');
        responseOutput.textContent = "Выполняется запрос...";
    }
    if (pollingInterval && !isCreditCheck) clearInterval(pollingInterval);

    try {
        const response = await fetch(endpoint, options);
        const result = await response.json();

        if (response.ok) {
            if (!isCreditCheck) responseOutput.textContent = JSON.stringify(result, null, 2);
            if (isCreditCheck && result.data !== undefined) {
                document.getElementById("credits-value").textContent = result.data;
                document.getElementById("credits-container").style.display = 'inline-flex';
            }
            if (isGeneration && result.data && result.data.taskId) {
                startPolling(result.data.taskId);
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

async function startPolling(taskId) {
    if (pollingInterval) clearInterval(pollingInterval);
    
    const { createPlaceholderCard } = await import('./library.js');
    createPlaceholderCard(taskId);
    
    updateStatus(`⏳ Задача ${taskId.slice(0, 8)}... в очереди.`);

    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/task-status/${taskId}`);
            const result = await response.json();
            document.getElementById("response-output").textContent = JSON.stringify(result, null, 2);

            if (!response.ok || !result.data) {
                throw new Error(result.message || "Некорректный ответ от API");
            }

            const taskData = result.data;
            const statusLowerCase = taskData.status.toLowerCase();
            const successStatuses = ["success", "completed", "text_success", "first_success"];
            const pendingStatuses = ["pending", "running", "submitted", "queued"];

            if (successStatuses.includes(statusLowerCase)) {
                if (statusLowerCase === 'success' || statusLowerCase === 'completed') {
                    clearInterval(pollingInterval);
                    updateStatus("✅ Задача выполнена!", true);
                    document.getElementById(`placeholder-${taskId}`)?.remove();
                    await loadSongsFromServer();
                    await handleApiCall("/api/chat/credit", { method: "GET" }, true);
                } else {
                    updateStatus(`⏳ Статус: ${taskData.status}...`);
                }
            } else if (pendingStatuses.includes(statusLowerCase)) {
                updateStatus(`⏳ Статус: ${taskData.status}...`);
            } else {
                throw new Error(taskData.errorMessage || `API вернул статус сбоя: ${taskData.status}`);
            }
        } catch (error) {
            clearInterval(pollingInterval);
            updateStatus(`🚫 Ошибка проверки: ${error.message}`, false, true);
            document.getElementById(`placeholder-${taskId}`)?.remove();
        }
    }, 10000);
}