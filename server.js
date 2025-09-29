import express from 'express';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const server = createServer(app);

// --- CONFIGURATION ---
const SUNO_API_TOKEN = process.env.SUNO_API_TOKEN;
const SUNO_API_BASE_URL = 'https://api.kie.ai/api/v1';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- DATABASE SETUP ---
async function setupDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                google_id VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255),
                picture_url TEXT,
                credits INTEGER DEFAULT 0,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Таблица "users" готова.');

        await client.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Таблица "projects" готова.');

        await client.query(`
            CREATE TABLE IF NOT EXISTS songs (
                id VARCHAR(255) PRIMARY KEY,
                song_data JSONB NOT NULL,
                request_params JSONB NOT NULL,
                is_favorite BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                lyrics_data JSONB,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL
            );
        `);
        console.log('Таблица "songs" готова.');

        await client.query(`
            CREATE TABLE IF NOT EXISTS images (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                task_id VARCHAR(255) NOT NULL,
                image_url TEXT NOT NULL,
                prompt_data JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Таблица "images" готова.');

    } catch (err) {
        console.error('Ошибка при настройке базы данных:', err);
    } finally {
        client.release();
    }
}

// --- MIDDLEWARE ---
app.use(express.json());
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
});
app.use(express.static(__dirname));

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Отсутствует токен авторизации' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Неверный или просроченный токен' });
    }
};

// --- AUTH ROUTES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    res.json({ success: true, user: req.user });
});

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    const correctPassword = process.env.SITE_ACCESS_KEY;
    if (password && password === correctPassword) {
        const adminToken = jwt.sign({ id: 0, email: 'admin@local', isAdmin: true, name: 'Admin', picture: '' }, JWT_SECRET, { expiresIn: '1d' });
        res.json({ success: true, token: adminToken });
    } else {
        res.status(401).json({ success: false, message: 'Неверный ключ' });
    }
});

app.post('/api/auth/google', async (req, res) => {
    const { token } = req.body;
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: google_id, email, name, picture: picture_url } = payload;
        let userResult = await pool.query('SELECT * FROM users WHERE google_id = $1', [google_id]);
        let user;
        if (userResult.rows.length === 0) {
            const isAdmin = (email === ADMIN_EMAIL);
            const initialCredits = isAdmin ? 999999 : 0;
            const newUserResult = await pool.query(
                'INSERT INTO users (google_id, email, name, picture_url, is_admin, credits) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                [google_id, email, name, picture_url, isAdmin, initialCredits]
            );
            user = newUserResult.rows[0];
        } else {
            user = userResult.rows[0];
        }
        const sessionToken = jwt.sign(
            { id: user.id, email: user.email, isAdmin: user.is_admin, name: user.name, picture: user.picture_url },
            JWT_SECRET, { expiresIn: '1d' }
        );
        res.json({ success: true, token: sessionToken });
    } catch (error) {
        console.error("Ошибка аутентификации Google:", error);
        res.status(401).json({ success: false, message: 'Не удалось войти через Google' });
    }
});

// --- USER PROFILE & CREDITS ---
app.get('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const userResult = await pool.query('SELECT name, email, picture_url, credits, is_admin FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }
        const user = userResult.rows[0];
        
        let finalCredits = user.credits;

        if (user.is_admin) {
            try {
                const sunoResponse = await axios.get(`${SUNO_API_BASE_URL}/chat/credit`, {
                    headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}` }
                });
                if (sunoResponse.data && sunoResponse.data.code === 200) {
                    finalCredits = sunoResponse.data.data;
                } else {
                    finalCredits = '∞ (ошибка)';
                }
            } catch (apiError) {
                console.error("Ошибка при запросе кредитов у Suno API для профиля:", apiError.message);
                finalCredits = '∞ (ошибка API)';
            }
        }

        res.json({
            name: user.name,
            email: user.email,
            picture: user.picture_url,
            credits: finalCredits
        });

    } catch (error) {
        console.error('Ошибка при получении профиля:', error);
        res.status(500).json({ message: 'Не удалось загрузить данные профиля' });
    }
});

app.get('/api/chat/credit', authMiddleware, async (req, res) => {
    try {
        const userResult = await pool.query('SELECT credits, is_admin FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }
        const user = userResult.rows[0];

        if (user.is_admin) {
            try {
                const sunoResponse = await axios.get(`${SUNO_API_BASE_URL}/chat/credit`, {
                    headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}` }
                });
                
                if (sunoResponse.data && sunoResponse.data.code === 200) {
                    res.json({ data: sunoResponse.data.data });
                } else {
                    throw new Error(sunoResponse.data.msg || 'Suno API вернул ошибку');
                }
            } catch (apiError) {
                console.error("Ошибка при запросе кредитов у Suno API:", apiError.message);
                res.json({ data: '∞ (ошибка API)' });
            }
        } else {
            res.json({ data: user.credits });
        }
    } catch (dbError) {
        console.error("Ошибка при запросе кредитов из БД:", dbError.message);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// --- PROJECTS API ---
app.get('/api/projects', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at ASC', [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: 'Не удалось загрузить проекты' });
    }
});

app.post('/api/projects', authMiddleware, async (req, res) => {
    const { name } = req.body;
    if (!name || name.trim().length === 0) return res.status(400).json({ message: 'Название проекта не может быть пустым' });
    try {
        const result = await pool.query('INSERT INTO projects (name, user_id) VALUES ($1, $2) RETURNING *', [name.trim(), req.user.id]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Не удалось создать проект' });
    }
});

app.delete('/api/projects/:id', authMiddleware, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const projectCheck = await client.query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        if (projectCheck.rows.length === 0) return res.status(403).json({ message: 'Доступ запрещен' });
        await client.query('UPDATE songs SET project_id = NULL WHERE project_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        await client.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        await client.query('COMMIT');
        res.status(200).json({ message: 'Проект удален' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Не удалось удалить проект' });
    } finally {
        client.release();
    }
});

// --- SONGS & IMAGES API ---
app.get('/api/songs', authMiddleware, async (req, res) => {
    const { projectId } = req.query;
    let queryText;
    const params = [req.user.id];
    if (projectId && projectId !== 'null') {
        queryText = 'SELECT id, song_data, request_params, is_favorite FROM songs WHERE user_id = $1 AND project_id = $2 ORDER BY created_at DESC';
        params.push(projectId);
    } else {
        queryText = 'SELECT id, song_data, request_params, is_favorite FROM songs WHERE user_id = $1 AND project_id IS NULL ORDER BY created_at DESC';
    }
    try {
        const result = await pool.query(queryText, params);
        res.json(result.rows.map(row => ({ 
            songData: { ...row.song_data, id: row.id, is_favorite: row.is_favorite }, 
            requestParams: row.request_params 
        })));
    } catch (err) {
        res.status(500).json({ message: 'Не удалось загрузить песни' });
    }
});

// --- ИЗМЕНЕНИЕ: Новый эндпоинт для получения изображений ---
app.get('/api/images', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM images WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        console.error("Ошибка при получении изображений:", err);
        res.status(500).json({ message: 'Не удалось загрузить изображения' });
    }
});

app.put('/api/songs/:id/move', authMiddleware, async (req, res) => {
    const { projectId } = req.body;
    try {
        await pool.query('UPDATE songs SET project_id = $1 WHERE id = $2 AND user_id = $3', [projectId, req.params.id, req.user.id]);
        res.status(200).json({ message: 'Песня перемещена' });
    } catch (err) {
        res.status(500).json({ message: 'Не удалось переместить песню' });
    }
});

app.delete('/api/songs/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM songs WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.status(200).json({ message: 'Песня удалена' });
    } catch (err) {
        res.status(500).json({ message: 'Не удалось удалить песню' });
    }
});

app.put('/api/songs/:id/favorite', authMiddleware, async (req, res) => {
    try {
        await pool.query('UPDATE songs SET is_favorite = $1 WHERE id = $2 AND user_id = $3', [req.body.is_favorite, req.params.id, req.user.id]);
        res.status(200).json({ message: 'Статус избранного обновлен' });
    } catch (err) {
        res.status(500).json({ message: 'Не удалось обновить' });
    }
});

// --- STREAMING & SUNO PROXY ---
app.get('/api/stream/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT song_data FROM songs WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).send('Песня не найдена');
        const audioUrl = result.rows[0].song_data.streamAudioUrl || result.rows[0].song_data.audioUrl;
        if (!audioUrl) return res.status(404).send('URL аудио не найден');
        
        const requestHeaders = {
            'User-Agent': 'Mozilla/5.0'
        };
        if (req.headers.range) {
            requestHeaders['Range'] = req.headers.range;
        }

        const response = await axios({
            method: 'get',
            url: audioUrl,
            responseType: 'stream',
            headers: requestHeaders,
            validateStatus: status => status >= 200 && status < 400
        });

        res.writeHead(response.status, response.headers);
        response.data.pipe(res);

    } catch (error) {
        console.error('Ошибка проксирования аудио:', error.message);
        res.status(500).send('Ошибка сервера при проксировании аудио');
    }
});

app.post('/api/refresh-url', authMiddleware, async (req, res) => {
    const { id } = req.body;
    try {
        const songResult = await pool.query('SELECT request_params FROM songs WHERE id = $1 AND user_id = $2', [id, req.user.id]);
        if (songResult.rows.length === 0) {
            return res.status(403).json({ message: 'Доступ запрещен или песня не найдена' });
        }
        const taskId = songResult.rows[0].request_params?.taskId;
        if (!taskId) {
            throw new Error('Task ID не найден для этой песни в базе данных.');
        }

        const sunoResponse = await axios.get(`${SUNO_API_BASE_URL}/generate/record-info`, {
            params: { taskId },
            headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}` }
        });

        const taskData = sunoResponse.data.data;

        if (taskData?.status !== 'SUCCESS' || !taskData.response?.sunoData) {
            throw new Error('Задача на сервере Suno еще не завершена, не найдена, или ответ имеет неверный формат.');
        }

        const songObject = taskData.response.sunoData.find(song => song.id === id);
        if (!songObject) {
            throw new Error('Аудио с указанным ID не найдено в ответе Suno API.');
        }
        
        const newAudioUrl = songObject.audioUrl;
        if (!newAudioUrl) {
            throw new Error('Новый URL аудио не найден в ответе Suno API.');
        }
        
        await pool.query(
            `UPDATE songs SET song_data = jsonb_set(jsonb_set(song_data, '{audioUrl}', to_jsonb($1::text)), '{streamAudioUrl}', to_jsonb($1::text)) WHERE id = $2`,
            [newAudioUrl, id]
        );
        
        res.json({ newUrl: newAudioUrl });

    } catch (error) {
        console.error("Ошибка при обновлении URL:", error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Не удалось обновить URL: ' + error.message });
    }
});

async function proxySunoRequest(req, res, endpoint, method = 'POST') {
    try {
        const response = await axios({
            method,
            url: `${SUNO_API_BASE_URL}${endpoint}`,
            headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}`, 'Content-Type': 'application/json' },
            data: req.body
        });
        res.json(response.data);
    } catch (error) {
        const status = error.response ? error.response.status : 500;
        const details = error.response ? error.response.data : { message: "API не отвечает." };
        res.status(status).json({ message: `Ошибка при запросе к Suno`, details });
    }
}

app.post('/api/generate', authMiddleware, (req, res) => proxySunoRequest(req, res, '/generate'));
app.post('/api/generate/upload-cover', authMiddleware, (req, res) => proxySunoRequest(req, res, '/generate/upload-cover'));
app.post('/api/generate/upload-extend', authMiddleware, (req, res) => proxySunoRequest(req, res, '/generate/upload-extend'));
app.post('/api/boost-style', authMiddleware, (req, res) => proxySunoRequest(req, res, '/style/generate'));
app.post('/api/mj/generate', authMiddleware, (req, res) => proxySunoRequest(req, res, '/mj/generate'));

app.post('/api/lyrics', authMiddleware, async (req, res) => {
    const { taskId, audioId } = req.body;
    try {
        const dbCheck = await pool.query('SELECT lyrics_data FROM songs WHERE id = $1 AND user_id = $2', [audioId, req.user.id]);
        if (dbCheck.rows.length > 0 && dbCheck.rows[0].lyrics_data) {
            return res.json({ data: dbCheck.rows[0].lyrics_data, source: 'cache' });
        }
        const sunoResponse = await axios.post(`${SUNO_API_BASE_URL}/generate/get-timestamped-lyrics`, { taskId, audioId }, {
            headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}` }
        });
        if (sunoResponse.data?.data?.alignedWords) {
            await pool.query('UPDATE songs SET lyrics_data = $1 WHERE id = $2 AND user_id = $3', [JSON.stringify(sunoResponse.data.data), audioId, req.user.id]);
        }
        res.json(sunoResponse.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ message: `Ошибка при запросе текста` });
    }
});

// --- WebSocket Server ---
const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
    console.log('Клиент подключился по WebSocket');
    let trackingInterval;
    let userId = null;

    const token = req.url.split('?token=')[1];
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            userId = decoded.id;
            console.log(`WebSocket авторизован для пользователя ${userId}`);
        } catch (e) {
            ws.close(); return;
        }
    } else {
        ws.close(); return;
    }

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'trackTask' && data.taskId && userId) {
                const { taskId, taskType } = data;
                if (trackingInterval) clearInterval(trackingInterval);

                trackingInterval = setInterval(async () => {
                    try {
                        let response;
                        if (taskType === 'mj') {
                            response = await axios.get(`${SUNO_API_BASE_URL}/mj/record-info`, {
                                params: { taskId },
                                headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}` }
                            });

                            if (!response.data || !response.data.data) { return; }
                            const taskData = response.data.data;
                            const finalStatuses = [1, 2, 3];

                            if (finalStatuses.includes(taskData.successFlag)) {
                                clearInterval(trackingInterval);
                                if (taskData.successFlag === 1 && taskData.resultInfoJson?.resultUrls) {
                                    for (const image of taskData.resultInfoJson.resultUrls) {
                                        await pool.query(
                                            `INSERT INTO images (user_id, task_id, image_url, prompt_data) VALUES ($1, $2, $3, $4)`,
                                            [userId, taskId, image.resultUrl, { prompt: taskData.prompt }]
                                        );
                                    }
                                }
                                if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(response.data));
                            } else {
                                if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(response.data));
                            }
                        } else {
                            response = await axios.get(`${SUNO_API_BASE_URL}/generate/record-info`, {
                                params: { taskId },
                                headers: { 'Authorization': `Bearer ${SUNO_API_TOKEN}` }
                            });
                            
                            if (!response.data || !response.data.data) { return; }
                            const taskData = response.data.data;
                            const status = taskData.status.toUpperCase();
                            const finalStatuses = ["SUCCESS", "CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"];

                            if (finalStatuses.includes(status)) {
                                clearInterval(trackingInterval);
                                if (status === "SUCCESS" && taskData.response?.sunoData) {
                                    for (const song of taskData.response.sunoData) {
                                        let paramsToSave = taskData.param;
                                        try { if (typeof paramsToSave === 'string') paramsToSave = JSON.parse(paramsToSave); } catch (e) {}
                                        
                                        await pool.query(
                                            `INSERT INTO songs (id, song_data, request_params, user_id) VALUES ($1, $2, $3, $4)
                                             ON CONFLICT (id) DO UPDATE SET song_data = EXCLUDED.song_data, request_params = EXCLUDED.request_params, user_id = EXCLUDED.user_id`,
                                            [song.id, song, { ...paramsToSave, taskId }, userId]
                                        );
                                    }
                                }
                                if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(response.data));
                            } else {
                                if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(response.data));
                            }
                        }
                    } catch (error) {
                        clearInterval(trackingInterval);
                        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ error: true, message: 'Ошибка проверки статуса' }));
                    }
                }, 5000);
            }
        } catch (e) { console.error('Ошибка WebSocket сообщения:', e); }
    });

    ws.on('close', () => {
        if (trackingInterval) clearInterval(trackingInterval);
    });
    ws.on('error', (error) => {
        if (trackingInterval) clearInterval(trackingInterval);
    });
});

// --- SERVER START ---
server.listen(port, async () => {
    await setupDatabase();
    console.log(`Сервер запущен на http://localhost:${port}`);
});