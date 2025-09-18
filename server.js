import express from 'express';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// ИЗМЕНЕНО: Сервер теперь берет порт из окружения Render
const port = process.env.PORT || 3000;

// ИЗМЕНЕНО: Токен и URL теперь берутся из переменных окружения
const SUNO_API_TOKEN = process.env.SUNO_API_TOKEN;
const SUNO_API_BASE_URL = 'https://api.kie.ai/api/v1';

// ИЗМЕНЕНО: Подключение к базе данных PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Функция для создания таблицы, если она не существует
async function setupDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS songs (
                id VARCHAR(255) PRIMARY KEY,
                song_data JSONB NOT NULL,
                request_params JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Таблица "songs" готова.');
    } catch (err) {
        console.error('Ошибка при создании таблицы:', err);
    } finally {
        client.release();
    }
}


app.use(express.json());

// Отдаем наш HTML-файл как главную страницу
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- НОВЫЕ РОУТЫ ДЛЯ РАБОТЫ С БД ---

// Получить все песни из БД
app.get('/api/songs', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT song_data, request_params FROM songs ORDER BY created_at DESC');
        res.json(result.rows.map(row => ({ songData: row.song_data, requestParams: row.request_params })));
        client.release();
    } catch (err) {
        console.error('Ошибка при получении песен из БД:', err);
        res.status(500).json({ message: 'Не удалось загрузить песни' });
    }
});


// --- СТАРЫЕ РОУТЫ (немного изменены) ---

// Генерация
app.post('/api/generate', (req, res) => {
    const payload = { ...req.body, callBackUrl: 'https://api.example.com/callback' };
    proxyRequest(res, 'POST', '/generate', payload);
});

// Проверка статуса задачи
app.get('/api/task-status/:taskId', async (req, res) => {
    const { taskId } = req.params;
    const endpoint = `/generate/record-info?taskId=${taskId}`;
    
    try {
        const response = await axios.get(`${SUNO_API_BASE_URL}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}` }
        });

        // ИЗМЕНЕНО: Если задача выполнена, сохраняем песни в БД
        const taskData = response.data.data;
        if (taskData && (taskData.status.toLowerCase() === 'success' || taskData.status.toLowerCase() === 'completed')) {
            if (taskData.response && Array.isArray(taskData.response.sunoData)) {
                const client = await pool.connect();
                try {
                    for (const song of taskData.response.sunoData) {
                        await client.query(
                            'INSERT INTO songs (id, song_data, request_params) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
                            [song.id, song, taskData.param]
                        );
                    }
                } finally {
                    client.release();
                }
            }
        }

        res.json(response.data);
    } catch (error) {
        const status = error.response ? error.response.status : 500;
        const details = error.response ? error.response.data : { message: "Ошибка сети." };
        res.status(status).json({ message: "Не удалось получить статус задачи", details });
    }
});

// Универсальная функция для прокси-запросов (без изменений)
async function proxyRequest(res, method, endpoint, data) {
    try {
        const response = await axios({ method, url: `${SUNO_API_BASE_URL}${endpoint}`, headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}`, 'Content-Type': 'application/json' }, data });
        res.json(response.data);
    } catch (error) {
        const status = error.response ? error.response.status : 500;
        const details = error.response ? error.response.data : { message: "Сервер API не отвечает." };
        res.status(status).json({ message: `Ошибка при запросе к эндпоинту: ${endpoint}`, details });
    }
}

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
app.listen(port, async () => {
    await setupDatabase(); // Сначала настраиваем БД
    console.log(`Сервер запущен! Откройте в браузере http://localhost:${port}`);
});