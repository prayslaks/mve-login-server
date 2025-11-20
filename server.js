const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
require('dotenv').config();

const authRoutes = require('./routes/auth');

const app = express();

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 라우트
app.use('/api/auth', authRoutes);

// 헬스 체크
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// HTTP 서버 (개발용)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// HTTPS 서버 (프로덕션용)
// const httpsOptions = {
//     key: fs.readFileSync('./ssl/private.key'),
//     cert: fs.readFileSync('./ssl/certificate.crt')
// };
// https.createServer(httpsOptions, app).listen(443);