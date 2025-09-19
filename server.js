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
        await client.query(`
            CREATE TABLE IF NOT EXISTS songs (
                id VARCHAR(255) PRIMARY KEY,
                song_data JSONB NOT NULL,
                request_params JSONB NOT NULL,
                is_favorite BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Таблица "songs" готова.');
    } catch (err) {
        console.error('Ошибка при настройке таблицы:', err);
    } finally {
        client.release();
    }
}

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- API для Песен ---
app.get('/api/songs', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, song_data, request_params, is_favorite FROM songs ORDER BY created_at DESC');
        res.json(result.rows.map(row => ({ 
            songData: { ...row.song_data, id: row.id, is_favorite: row.is_favorite }, 
            requestParams: row.request_params 
        })));
    } catch (err) {
        console.error('Ошибка при получении песен:', err);
        res.status(500).json({ message: 'Не удалось загрузить песни' });
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

app.post('/api/generate', (req, res) => {
    const payload = { ...req.body, callBackUrl: 'https://api.example.com/callback' };
    proxyRequest(res, 'POST', '/generate', payload);
});

app.post('/api/generate/extend', (req, res) => proxyRequest(res, 'POST', '/generate/extend', req.body));
app.post('/api/generate/upload-cover', (req, res) => proxyRequest(res, 'POST', '/generate/upload-cover', req.body));
app.post('/api/generate/upload-extend', (req, res) => proxyRequest(res, 'POST', '/generate/upload-extend', req.body));
app.post('/api/lyrics', (req, res) => proxyRequest(res, 'POST', '/generate/get-timestamped-lyrics', req.body));
// НОВЫЙ ЭНДПОИНТ
app.post('/api/boost-style', (req, res) => proxyRequest(res, 'POST', '/generate/boost-music-style', req.body));


app.get('/api/task-status/:taskId', async (req, res) => {
    const { taskId } = req.params;
    const endpoint = `/generate/record-info?taskId=${taskId}`;
    try {
        const response = await axios.get(`${SUNO_API_BASE_URL}${endpoint}`, { headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}` } });
        const taskData = response.data.data;
        if (taskData && (taskData.status.toLowerCase() === 'success' || taskData.status.toLowerCase() === 'completed')) {
            if (taskData.response && Array.isArray(taskData.response.sunoData)) {
                for (const song of taskData.response.sunoData) {
                    if (song.audioUrl) {
                        song.streamAudioUrl = song.audioUrl;
                    }
                    await pool.query('INSERT INTO songs (id, song_data, request_params) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [song.id, song, taskData.param]);
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