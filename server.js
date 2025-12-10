const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
require('dotenv').config();

// 서버 내 라우트 경로
const redisClient = require('./redis-client');
const authRoutes = require('./routes/auth');

const app = express();

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 라우트
app.use('/api/auth', authRoutes);

// 헬스 체크
app.get('/health/login', async (req, res) => {
    try {
        const redisPing = await redisClient.ping();
        const redisConnected = redisPing === 'PONG';

        // Redis 연결 실패 시 503 Service Unavailable 반환
        if (!redisConnected) {
            return res.status(503).json({
                success: false,
                code: 'REDIS_UNAVAILABLE',
                message: 'Redis connection failed',
                server: 'mve-login-server',
                redis: 'disconnected',
                timestamp: new Date().toISOString()
            });
        }

        res.status(200).json({
            success: true,
            code: 'HEALTH_CHECK_OK',
            message: 'Login server is healthy',
            server: 'mve-login-server',
            redis: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        // 예외 발생 시 503 Service Unavailable 반환
        res.status(503).json({
            success: false,
            code: 'HEALTH_CHECK_FAILED',
            message: 'Health check failed',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// HTTP 서버 (개발용)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`MVE Login Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`DB: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    console.log(`Redis: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
});

// HTTPS 서버 (프로덕션용)
// const httpsOptions = {
//     key: fs.readFileSync('./ssl/private.key'),
//     cert: fs.readFileSync('./ssl/certificate.crt')
// };
// https.createServer(httpsOptions, app).listen(443);