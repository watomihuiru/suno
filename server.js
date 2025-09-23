import express from 'express';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

const SUNO_API_TOKEN = process.env.SUNO_API_TOKEN;
const SUNO_API_BASE_URL = 'https://api.kie.ai/api/v1';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function setupDatabase() {
    const client = await pool.connect();
    try {
        // Создаем таблицу для проектов
        await client.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Таблица "projects" готова.');

        // Создаем таблицу для песен, если ее нет
        await client.query(`
            CREATE TABLE IF NOT EXISTS songs (
                id VARCHAR(255) PRIMARY KEY,
                song_data JSONB NOT NULL,
                request_params JSONB NOT NULL,
                is_favorite BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                lyrics_data JSONB
            );
        `);
        console.log('Таблица "songs" готова.');

        // Добавляем колонку project_id в таблицу songs, если ее нет
        const columns = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name='songs' AND column_name='project_id'
        `);
        if (columns.rows.length === 0) {
            await client.query(`
                ALTER TABLE songs 
                ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
            `);
            console.log('Колонка "project_id" добавлена в таблицу "songs".');
        }

    } catch (err) {
        console.error('Ошибка при настройке базы данных:', err);
    } finally {
        client.release();
    }
}

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    const correctPassword = process.env.SITE_ACCESS_KEY;

    if (password && password === correctPassword) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Неверный ключ' });
    }
});

// --- API для Проектов ---
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM projects ORDER BY created_at ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка при получении проектов:', err);
        res.status(500).json({ message: 'Не удалось загрузить проекты' });
    }
});

app.post('/api/projects', async (req, res) => {
    const { name } = req.body;
    if (!name || name.trim().length === 0) {
        return res.status(400).json({ message: 'Название проекта не может быть пустым' });
    }
    try {
        const result = await pool.query('INSERT INTO projects (name) VALUES ($1) RETURNING *', [name.trim()]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка при создании проекта:', err);
        res.status(500).json({ message: 'Не удалось создать проект' });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Перемещаем песни из проекта в "Без проекта"
        await client.query('UPDATE songs SET project_id = NULL WHERE project_id = $1', [req.params.id]);
        // Удаляем сам проект
        await client.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
        await client.query('COMMIT');
        res.status(200).json({ message: 'Проект удален, песни перемещены' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка при удалении проекта:', err);
        res.status(500).json({ message: 'Не удалось удалить проект' });
    } finally {
        client.release();
    }
});


// --- API для Песен ---
app.get('/api/songs', async (req, res) => {
    const { projectId } = req.query;
    let queryText;
    const params = [];

    if (projectId && projectId !== 'null') {
        queryText = 'SELECT id, song_data, request_params, is_favorite FROM songs WHERE project_id = $1 ORDER BY created_at DESC';
        params.push(projectId);
    } else {
        // Если projectId не указан или 'null', получаем песни без проекта
        queryText = 'SELECT id, song_data, request_params, is_favorite FROM songs WHERE project_id IS NULL ORDER BY created_at DESC';
    }

    try {
        const result = await pool.query(queryText, params);
        res.json(result.rows.map(row => ({ 
            songData: { ...row.song_data, id: row.id, is_favorite: row.is_favorite }, 
            requestParams: row.request_params 
        })));
    } catch (err) {
        console.error('Ошибка при получении песен:', err);
        res.status(500).json({ message: 'Не удалось загрузить песни' });
    }
});

app.put('/api/songs/:id/move', async (req, res) => {
    const { projectId } = req.body; // projectId может быть null
    const { id } = req.params;
    try {
        await pool.query('UPDATE songs SET project_id = $1 WHERE id = $2', [projectId, id]);
        res.status(200).json({ message: 'Песня перемещена' });
    } catch (err) {
        console.error('Ошибка при перемещении песни:', err);
        res.status(500).json({ message: 'Не удалось переместить песню' });
    }
});

app.delete('/api/songs/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM songs WHERE id = $1', [req.params.id]);
        res.status(200).json({ message: 'Песня удалена' });
    } catch (err) {
        console.error('Ошибка при удалении песни:', err);
        res.status(500).json({ message: 'Не удалось удалить песню' });
    }
});

app.put('/api/songs/:id/favorite', async (req, res) => {
    try {
        await pool.query('UPDATE songs SET is_favorite = $1 WHERE id = $2', [req.body.is_favorite, req.params.id]);
        res.status(200).json({ message: 'Статус избранного обновлен' });
    } catch (err) {
        console.error('Ошибка при обновлении избранного:', err);
        res.status(500).json({ message: 'Не удалось обновить' });
    }
});

app.get('/api/stream/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT song_data FROM songs WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).send('Песня не найдена в базе данных');
        }

        const audioUrl = result.rows[0].song_data.streamAudioUrl || result.rows[0].song_data.audioUrl;
        if (!audioUrl) {
            return res.status(404).send('URL аудио для этой песни не найден');
        }

        const headResponse = await axios.head(audioUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        const totalSize = headResponse.headers['content-length'];
        const contentType = headResponse.headers['content-type'] || 'audio/mpeg';
        
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
            const chunksize = (end - start) + 1;

            const audioResponse = await axios({
                method: 'get',
                url: audioUrl,
                responseType: 'stream',
                headers: {
                    'Range': `bytes=${start}-${end}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
            });
            audioResponse.data.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': totalSize,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
            });

            const audioResponse = await axios({
                method: 'get',
                url: audioUrl,
                responseType: 'stream',
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
            });
            audioResponse.data.pipe(res);
        }
    } catch (error) {
        const songId = req.params.id;
        if (error.response) {
            console.error(`Ошибка проксирования аудио (ID: ${songId}): Сервер Suno ответил со статусом ${error.response.status}`);
            res.status(error.response.status).send(`Не удалось получить аудио от источника: Статус ${error.response.status}`);
        } else if (error.request) {
            console.error(`Ошибка проксирования аудио (ID: ${songId}): Нет ответа от сервера Suno.`);
            res.status(504).send('Таймаут шлюза: Нет ответа от источника аудио');
        } else {
            console.error(`Внутренняя ошибка проксирования аудио (ID: ${songId}): ${error.message}`);
            res.status(500).send('Внутренняя ошибка сервера при обработке аудиопотока');
        }
    }
});


app.post('/api/refresh-url', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: 'ID песни не предоставлен' });
    try {
        const sunoResponse = await axios.post(`${SUNO_API_BASE_URL}/common/download-url`, { musicId: id }, {
            headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}` }
        });
        const newAudioUrl = sunoResponse.data.data;
        if (newAudioUrl) {
            await pool.query(
                `UPDATE songs SET song_data = jsonb_set(jsonb_set(song_data, '{audioUrl}', $1::jsonb), '{streamAudioUrl}', $1::jsonb) WHERE id = $2`,
                [JSON.stringify(newAudioUrl), id]
            );
            res.json({ newUrl: newAudioUrl });
        } else { throw new Error('Не удалось получить новый URL'); }
    } catch (error) {
        console.error('Ошибка при обновлении URL:', error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Не удалось обновить URL' });
    }
});

// --- Прокси для Suno API ---
async function proxyRequest(res, method, endpoint, data) {
    try {
        const response = await axios({ method, url: `${SUNO_API_BASE_URL}${endpoint}`, headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}`, 'Content-Type': 'application/json' }, data });
        res.json(response.data);
    } catch (error) {
        const status = error.response ? error.response.status : 500;
        const details = error.response ? error.response.data : { message: "Сервер API не отвечает." };
        console.error(`Ошибка при запросе к ${endpoint}:`, details);
        res.status(status).json({ message: `Ошибка при запросе к ${endpoint}`, details });
    }
}

app.post('/api/generate', (req, res) => { const payload = { ...req.body, callBackUrl: 'https://api.example.com/callback' }; proxyRequest(res, 'POST', '/generate', payload); });
app.post('/api/generate/upload-cover', (req, res) => proxyRequest(res, 'POST', '/generate/upload-cover', req.body));
app.post('/api/generate/upload-extend', (req, res) => proxyRequest(res, 'POST', '/generate/upload-extend', req.body));
app.post('/api/lyrics', async (req, res) => {
    const { taskId, audioId } = req.body;

    try {
        const dbCheck = await pool.query('SELECT lyrics_data FROM songs WHERE id = $1', [audioId]);
        if (dbCheck.rows.length > 0 && dbCheck.rows[0].lyrics_data) {
            console.log(`[Lyrics] Отдаем кэшированный текст для ${audioId}`);
            return res.json({ data: dbCheck.rows[0].lyrics_data, source: 'cache' });
        }

        console.log(`[Lyrics] Кэш не найден для ${audioId}. Запрашиваем API...`);
        const sunoResponse = await axios.post(`${SUNO_API_BASE_URL}/generate/get-timestamped-lyrics`, { taskId, audioId }, {
            headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}` }
        });

        if (sunoResponse.data && sunoResponse.data.data && Array.isArray(sunoResponse.data.data.alignedWords)) {
            console.log(`[Lyrics] Получен успешный ответ от API для ${audioId}. Сохраняем в кэш.`);
            await pool.query('UPDATE songs SET lyrics_data = $1 WHERE id = $2', [sunoResponse.data.data, audioId]);
        }

        res.json(sunoResponse.data);

    } catch (error) {
        const status = error.response ? error.response.status : 500;
        const details = error.response ? error.response.data : { message: "Сервер API не отвечает." };
        console.error(`[Lyrics] Ошибка при получении текста для ${audioId}:`, details);
        res.status(status).json({ message: `Ошибка при запросе текста`, details });
    }
});
app.post('/api/boost-style', (req, res) => proxyRequest(res, 'POST', '/style/generate', req.body));

app.get('/api/task-status/:taskId', async (req, res) => {
    const { taskId } = req.params;
    const endpoint = `/generate/record-info?taskId=${taskId}`;
    try {
        const response = await axios.get(`${SUNO_API_BASE_URL}${endpoint}`, { headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}` } });
        const taskData = response.data.data;
        const successStatuses = ['success', 'completed', 'text_success', 'first_success'];

        if (taskData && successStatuses.includes(taskData.status.toLowerCase())) {
            if (taskData.response && Array.isArray(taskData.response.sunoData)) {
                for (const song of taskData.response.sunoData) {
                    if (song.audioUrl) { song.streamAudioUrl = song.audioUrl; }

                    let paramsToSave = taskData.param;
                    if (typeof paramsToSave === 'string') {
                        try { paramsToSave = JSON.parse(paramsToSave); } catch (e) { console.warn(`Не удалось распарсить taskData.param для taskId ${taskId}.`); }
                    }

                    const finalRequestParams = (typeof paramsToSave === 'object' && paramsToSave !== null)
                        ? { ...paramsToSave, taskId: taskData.taskId }
                        : { rawParam: paramsToSave, taskId: taskData.taskId };

                    await pool.query(
                        `INSERT INTO songs (id, song_data, request_params) 
                         VALUES ($1, $2, $3) 
                         ON CONFLICT (id) DO UPDATE SET 
                            song_data = EXCLUDED.song_data, 
                            request_params = EXCLUDED.request_params`,
                        [song.id, song, finalRequestParams]
                    );
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

app.get('/api/chat/credit', (req, res) => proxyRequest(res, 'GET', '/chat/credit', null));

app.listen(port, async () => {
    await setupDatabase();
    console.log(`Сервер запущен! Откройте в браузере http://localhost:${port}`);
});