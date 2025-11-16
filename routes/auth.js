const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

// 회원가입
router.post('/signup', async (req, res) => {
    try {
        console.log('[SIGNUP] 회원가입 시도:', {
            username: req.body.username,
            email: req.body.email,
            timestamp: new Date().toISOString()
        });

        const { username, password, email } = req.body;

        // 1. 입력값 유효성 검사
        if (!username || !password || !email) {
            console.log('[SIGNUP] ERROR: 필수 필드 누락', {
                username: !!username,
                password: !!password,
                email: !!email
            });
            return res.status(400).json({
                success: false,
                error: 'MISSING_FIELDS',
                message: 'All fields required',
                details: {
                    username: !username ? 'Username is required' : 'OK',
                    password: !password ? 'Password is required' : 'OK',
                    email: !email ? 'Email is required' : 'OK'
                }
            });
        }

        // 입력값 타입 검증
        if (typeof username !== 'string' || typeof password !== 'string' || typeof email !== 'string') {
            console.log('[SIGNUP] ERROR: 잘못된 입력 타입', {
                usernameType: typeof username,
                passwordType: typeof password,
                emailType: typeof email
            });
            return res.status(400).json({
                success: false,
                error: 'INVALID_INPUT_TYPE',
                message: 'All fields must be strings'
            });
        }

        // 이메일 형식 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('[SIGNUP] ERROR: 잘못된 이메일 형식', { email });
            return res.status(400).json({
                success: false,
                error: 'INVALID_EMAIL_FORMAT',
                message: 'Invalid email format'
            });
        }

        // 비밀번호 길이 검증
        if (password.length < 6) {
            console.log('[SIGNUP] ERROR: 비밀번호 길이 부족', { length: password.length });
            return res.status(400).json({
                success: false,
                error: 'WEAK_PASSWORD',
                message: 'Password must be at least 6 characters long'
            });
        }

        // 사용자명 길이 검증
        if (username.length < 3 || username.length > 20) {
            console.log('[SIGNUP] ERROR: 사용자명 길이 오류', { length: username.length });
            return res.status(400).json({
                success: false,
                error: 'INVALID_USERNAME_LENGTH',
                message: 'Username must be between 3 and 20 characters'
            });
        }

        // 2. 중복 확인
        console.log('[SIGNUP] 중복 확인 시작:', { username, email });
        const userCheck = await pool.query(
            'SELECT username, email FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );
        console.log('[SIGNUP] 중복 확인 완료:', { found: userCheck.rows.length });

        if (userCheck.rows.length > 0) {
            const existingUser = userCheck.rows[0];
            const duplicateField = existingUser.username === username ? 'username' : 'email';
            console.log('[SIGNUP] ERROR: 중복된 사용자', {
                duplicateField,
                value: duplicateField === 'username' ? username : email
            });
            return res.status(409).json({
                success: false,
                error: 'USER_ALREADY_EXISTS',
                message: 'User already exists',
                details: {
                    field: duplicateField,
                    message: `${duplicateField === 'username' ? 'Username' : 'Email'} already in use`
                }
            });
        }

        // 3. 비밀번호 해싱
        console.log('[SIGNUP] 비밀번호 해싱 시작');
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('[SIGNUP] 비밀번호 해싱 완료');

        // 4. DB 저장
        console.log('[SIGNUP] DB 저장 시작');
        const result = await pool.query(
            'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id, username, email',
            [username, hashedPassword, email]
        );
        console.log('[SIGNUP] DB 저장 완료:', { userId: result.rows[0].id });

        console.log('[SIGNUP] SUCCESS: 회원가입 성공', {
            userId: result.rows[0].id,
            username: result.rows[0].username
        });

        res.status(201).json({
            success: true,
            message: 'User created',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('[SIGNUP] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        // DB 연결 오류 구분
        if (error.code) {
            // PostgreSQL 에러 코드별 처리
            if (error.code === '23505') { // Unique violation
                return res.status(409).json({
                    success: false,
                    error: 'DUPLICATE_ENTRY',
                    message: 'Username or email already exists',
                    code: error.code
                });
            }

            return res.status(500).json({
                success: false,
                error: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        // bcrypt 오류 구분
        if (error.message && error.message.includes('bcrypt')) {
            return res.status(500).json({
                success: false,
                error: 'ENCRYPTION_ERROR',
                message: 'Password encryption error'
            });
        }

        res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

// 로그인
router.post('/login', async (req, res) => {
    try {
        console.log('[LOGIN] 로그인 시도:', { username: req.body.username, timestamp: new Date().toISOString() });

        const { username, password } = req.body;

        // 1. 입력값 유효성 검사
        if (!username || !password) {
            console.log('[LOGIN] ERROR: 필수 필드 누락', { username: !!username, password: !!password });
            return res.status(400).json({
                success: false,
                error: 'MISSING_FIELDS',
                message: 'Username and password required',
                details: {
                    username: !username ? 'Username is required' : 'OK',
                    password: !password ? 'Password is required' : 'OK'
                }
            });
        }

        // 입력값 타입 검증
        if (typeof username !== 'string' || typeof password !== 'string') {
            console.log('[LOGIN] ERROR: 잘못된 입력 타입', {
                usernameType: typeof username,
                passwordType: typeof password
            });
            return res.status(400).json({
                success: false,
                error: 'INVALID_INPUT_TYPE',
                message: 'Username and password must be strings'
            });
        }

        // 2. 사용자 조회
        console.log('[LOGIN] DB 조회 시작:', { username });
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        console.log('[LOGIN] DB 조회 완료:', { found: result.rows.length > 0 });

        if (result.rows.length === 0) {
            console.log('[LOGIN] ERROR: 사용자 없음', { username });
            return res.status(401).json({
                success: false,
                error: 'USER_NOT_FOUND',
                message: 'Invalid credentials'
            });
        }

        const user = result.rows[0];

        // 3. 비밀번호 검증
        console.log('[LOGIN] 비밀번호 검증 시작');
        const validPassword = await bcrypt.compare(password, user.password);
        console.log('[LOGIN] 비밀번호 검증 완료:', { valid: validPassword });

        if (!validPassword) {
            console.log('[LOGIN] ERROR: 비밀번호 불일치', { username });
            return res.status(401).json({
                success: false,
                error: 'INVALID_PASSWORD',
                message: 'Invalid credentials'
            });
        }

        // 4. JWT_SECRET 확인
        if (!process.env.JWT_SECRET) {
            console.error('[LOGIN] CRITICAL ERROR: JWT_SECRET 설정되지 않음');
            return res.status(500).json({
                success: false,
                error: 'SERVER_CONFIG_ERROR',
                message: 'Server configuration error'
            });
        }

        // 5. JWT 토큰 생성
        console.log('[LOGIN] JWT 토큰 생성 시작');
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        );
        console.log('[LOGIN] JWT 토큰 생성 완료');

        console.log('[LOGIN] SUCCESS: 로그인 성공', {
            userId: user.id,
            username: user.username
        });

        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('[LOGIN] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            timestamp: new Date().toISOString()
        });

        // DB 연결 오류 구분
        if (error.code) {
            return res.status(500).json({
                success: false,
                error: 'DATABASE_ERROR',
                message: 'Database connection error',
                code: error.code
            });
        }

        // bcrypt 오류 구분
        if (error.message && error.message.includes('bcrypt')) {
            return res.status(500).json({
                success: false,
                error: 'ENCRYPTION_ERROR',
                message: 'Password verification error'
            });
        }

        // JWT 오류 구분
        if (error.message && error.message.includes('jwt')) {
            return res.status(500).json({
                success: false,
                error: 'TOKEN_GENERATION_ERROR',
                message: 'Token generation error'
            });
        }

        res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

// 토큰 검증 미들웨어
const verifyToken = (req, res, next) => {
    console.log('[AUTH] 토큰 검증 시도:', {
        hasAuthHeader: !!req.headers['authorization'],
        timestamp: new Date().toISOString()
    });

    const authHeader = req.headers['authorization'];

    // Authorization 헤더 확인
    if (!authHeader) {
        console.log('[AUTH] ERROR: Authorization 헤더 없음');
        return res.status(403).json({
            success: false,
            error: 'NO_AUTH_HEADER',
            message: 'No authorization header provided'
        });
    }

    // Bearer 토큰 형식 확인
    if (!authHeader.startsWith('Bearer ')) {
        console.log('[AUTH] ERROR: 잘못된 Authorization 헤더 형식', { authHeader });
        return res.status(403).json({
            success: false,
            error: 'INVALID_AUTH_FORMAT',
            message: 'Authorization header must start with "Bearer "'
        });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        console.log('[AUTH] ERROR: 토큰 없음');
        return res.status(403).json({
            success: false,
            error: 'NO_TOKEN',
            message: 'No token provided'
        });
    }

    // JWT_SECRET 확인
    if (!process.env.JWT_SECRET) {
        console.error('[AUTH] CRITICAL ERROR: JWT_SECRET 설정되지 않음');
        return res.status(500).json({
            success: false,
            error: 'SERVER_CONFIG_ERROR',
            message: 'Server configuration error'
        });
    }

    console.log('[AUTH] JWT 검증 시작');

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.log('[AUTH] ERROR: 토큰 검증 실패', {
                error: err.name,
                message: err.message
            });

            // 토큰 만료
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    error: 'TOKEN_EXPIRED',
                    message: 'Token has expired',
                    expiredAt: err.expiredAt
                });
            }

            // 잘못된 토큰
            if (err.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_TOKEN',
                    message: 'Invalid token'
                });
            }

            // 기타 JWT 에러
            return res.status(401).json({
                success: false,
                error: 'TOKEN_VERIFICATION_FAILED',
                message: 'Token verification failed'
            });
        }

        console.log('[AUTH] SUCCESS: 토큰 검증 성공', {
            userId: decoded.userId,
            username: decoded.username
        });

        req.userId = decoded.userId;
        req.username = decoded.username;
        next();
    });
};

// 보호된 라우트 예시
router.get('/profile', verifyToken, async (req, res) => {
    try {
        console.log('[PROFILE] 프로필 조회 시도:', {
            userId: req.userId,
            username: req.username,
            timestamp: new Date().toISOString()
        });

        // DB에서 사용자 정보 조회
        console.log('[PROFILE] DB 조회 시작:', { userId: req.userId });
        const result = await pool.query(
            'SELECT id, username, email, created_at FROM users WHERE id = $1',
            [req.userId]
        );
        console.log('[PROFILE] DB 조회 완료:', { found: result.rows.length > 0 });

        // 사용자가 존재하지 않는 경우 (토큰은 유효하지만 사용자가 삭제된 경우)
        if (result.rows.length === 0) {
            console.log('[PROFILE] ERROR: 사용자 없음', { userId: req.userId });
            return res.status(404).json({
                success: false,
                error: 'USER_NOT_FOUND',
                message: 'User not found'
            });
        }

        console.log('[PROFILE] SUCCESS: 프로필 조회 성공', {
            userId: result.rows[0].id,
            username: result.rows[0].username
        });

        res.json({
            success: true,
            user: result.rows[0]
        });

    } catch (error) {
        console.error('[PROFILE] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        // DB 연결 오류 구분
        if (error.code) {
            return res.status(500).json({
                success: false,
                error: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

module.exports = router;