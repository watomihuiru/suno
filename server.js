import express from 'express';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const SUNO_API_TOKEN = process.env.SUNO_API_TOKEN;
const SUNO_API_BASE_URL = 'https://api.kie.ai/api/v1';

app.use(express.json());

// Универсальная функция для отправки запросов к Suno API
async function proxyRequest(res, method, endpoint, data) {
    try {
        const response = await axios({
            method: method,
            url: `${SUNO_API_BASE_URL}${endpoint}`,
            headers: {
                'Authorization': `Bearer ${SUNO_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: data
        });
        res.json(response.data);
    } catch (error) {
        const status = error.response ? error.response.status : 500;
        const details = error.response ? error.response.data : { message: "Сервер API не отвечает или произошла сетевая ошибка." };
        console.error(`Ошибка при запросе к ${endpoint}:`, details);
        res.status(status).json({
            message: `Ошибка при запросе к эндпоинту: ${endpoint}`,
            details: details
        });
    }
}

// Отдаем наш HTML-файл как главную страницу
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- РОУТЫ API ---

// Генерация
app.post('/api/generate', (req, res) => {
    const payload = { ...req.body, callBackUrl: 'https://api.example.com/callback' };
    proxyRequest(res, 'POST', '/generate', payload);
});

// --- НОВЫЙ РОУТ ДЛЯ ПРОВЕРКИ СТАТУСА ---
app.get('/api/task-status/:taskId', async (req, res) => {
    const { taskId } = req.params;
    // API endpoint для проверки статуса - это GET /generate/record-info, но с query параметром taskId
    const endpoint = `/generate/record-info?taskId=${taskId}`;
    
    // Используем GET запрос. Данные не нужны.
    try {
        const response = await axios.get(`${SUNO_API_BASE_URL}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}` }
        });
        res.json(response.data);
    } catch (error) {
        const status = error.response ? error.response.status : 500;
        const details = error.response ? error.response.data : { message: "Ошибка сети." };
        res.status(status).json({ message: "Не удалось получить статус задачи", details });
    }
});


// Остальные роуты
app.post('/api/generate/extend', (req, res) => {
    const payload = { ...req.body, callBackUrl: 'https://api.example.com/callback' };
    proxyRequest(res, 'POST', '/generate/extend', payload);
});
app.post('/api/generate/upload-cover', (req, res) => {
    const payload = { ...req.body, callBackUrl: 'https://api.example.com/callback' };
    proxyRequest(res, 'POST', '/generate/upload-cover', payload);
});
app.post('/api/generate/upload-extend', (req, res) => {
    const payload = { ...req.body, callBackUrl: 'https://api.example.com/callback' };
    proxyRequest(res, 'POST', '/generate/upload-extend', payload);
});
app.post('/api/style/generate', (req, res) => proxyRequest(res, 'POST', '/style/generate', req.body));
app.get('/api/generate/record-info', (req, res) => proxyRequest(res, 'GET', '/generate/record-info', null));
app.post('/api/common/download-url', (req, res) => proxyRequest(res, 'POST', '/common/download-url', req.body));
app.get('/api/chat/credit', (req, res) => proxyRequest(res, 'GET', '/chat/credit', null));

// Запускаем сервер
app.listen(port, () => {
    console.log(`Сервер запущен! Откройте в браузере http://localhost:${port}`);
});