const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// 이메일 전송을 위한 nodemailer 설정
const transporter = nodemailer.createTransport({
    host: 'smtp.naver.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// 6자리 랜덤 인증번호 생성
const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// 1. 이메일 중복 확인
router.post('/check-email', async (req, res) => {
    try {
        console.log('[CHECK-EMAIL] 이메일 중복 확인 시도:', {
            email: req.body.email,
            timestamp: new Date().toISOString()
        });

        const { email } = req.body;

        // 입력값 검증
        if (!email) {
            console.log('[CHECK-EMAIL] ERROR: 이메일 누락');
            return res.status(400).json({
                success: false,
                error: 'MISSING_EMAIL',
                message: 'Email is required'
            });
        }

        if (typeof email !== 'string') {
            console.log('[CHECK-EMAIL] ERROR: 잘못된 입력 타입');
            return res.status(400).json({
                success: false,
                error: 'INVALID_INPUT_TYPE',
                message: 'Email must be a string'
            });
        }

        // 이메일 형식 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('[CHECK-EMAIL] ERROR: 잘못된 이메일 형식', { email });
            return res.status(400).json({
                success: false,
                error: 'INVALID_EMAIL_FORMAT',
                message: 'Invalid email format'
            });
        }

        // DB에서 이메일 중복 확인
        console.log('[CHECK-EMAIL] DB 조회 시작:', { email });
        const result = await pool.query(
            'SELECT email FROM users WHERE email = $1',
            [email]
        );
        console.log('[CHECK-EMAIL] DB 조회 완료:', { exists: result.rows.length > 0 });

        const exists = result.rows.length > 0;

        console.log('[CHECK-EMAIL] SUCCESS:', { email, exists });

        res.json({
            success: true,
            exists: exists,
            message: exists ? 'Email already in use' : 'Email is available'
        });

    } catch (error) {
        console.error('[CHECK-EMAIL] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

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

// 2. 인증번호 발송
router.post('/send-verification', async (req, res) => {
    try {
        console.log('[SEND-VERIFICATION] 인증번호 발송 시도:', {
            email: req.body.email,
            timestamp: new Date().toISOString()
        });

        const { email } = req.body;

        // 입력값 검증
        if (!email) {
            console.log('[SEND-VERIFICATION] ERROR: 이메일 누락');
            return res.status(400).json({
                success: false,
                error: 'MISSING_EMAIL',
                message: 'Email is required'
            });
        }

        if (typeof email !== 'string') {
            console.log('[SEND-VERIFICATION] ERROR: 잘못된 입력 타입');
            return res.status(400).json({
                success: false,
                error: 'INVALID_INPUT_TYPE',
                message: 'Email must be a string'
            });
        }

        // 이메일 형식 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('[SEND-VERIFICATION] ERROR: 잘못된 이메일 형식', { email });
            return res.status(400).json({
                success: false,
                error: 'INVALID_EMAIL_FORMAT',
                message: 'Invalid email format'
            });
        }

        // 이메일 중복 확인
        console.log('[SEND-VERIFICATION] 이메일 중복 확인');
        const existingUser = await pool.query(
            'SELECT email FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            console.log('[SEND-VERIFICATION] ERROR: 이미 등록된 이메일', { email });
            return res.status(409).json({
                success: false,
                error: 'EMAIL_ALREADY_EXISTS',
                message: 'Email is already registered'
            });
        }

        // Rate limiting: 1분 이내 재전송 방지
        console.log('[SEND-VERIFICATION] Rate limiting 확인');
        const recentCheck = await pool.query(
            'SELECT * FROM email_verifications WHERE email = $1 AND created_at > NOW() - INTERVAL \'1 minute\' ORDER BY created_at DESC LIMIT 1',
            [email]
        );

        if (recentCheck.rows.length > 0) {
            console.log('[SEND-VERIFICATION] ERROR: 재전송 제한', { email });
            const timeDiff = Math.ceil((60000 - (Date.now() - new Date(recentCheck.rows[0].created_at).getTime())) / 1000);
            return res.status(429).json({
                success: false,
                error: 'TOO_MANY_REQUESTS',
                message: 'Please wait before requesting another code',
                retryAfter: timeDiff
            });
        }

        // 만료된 인증번호 삭제
        console.log('[SEND-VERIFICATION] 만료된 인증번호 삭제');
        await pool.query('SELECT delete_expired_verifications()');

        // 기존 미검증 인증번호 무효화 (verified = true로 표시하여 재사용 방지)
        console.log('[SEND-VERIFICATION] 기존 인증번호 무효화');
        await pool.query(
            'UPDATE email_verifications SET verified = TRUE WHERE email = $1 AND verified = FALSE',
            [email]
        );

        // 6자리 인증번호 생성
        const code = generateVerificationCode();
        console.log('[SEND-VERIFICATION] 인증번호 생성 완료');

        // DB에 저장 (5분 유효)
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        console.log('[SEND-VERIFICATION] DB 저장 시작');
        await pool.query(
            'INSERT INTO email_verifications (email, code, expires_at) VALUES ($1, $2, $3)',
            [email, code, expiresAt]
        );
        console.log('[SEND-VERIFICATION] DB 저장 완료');

        // 이메일 전송
        console.log('[SEND-VERIFICATION] 이메일 전송 시작');
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'MVE Login - 이메일 인증번호',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">이메일 인증</h2>
                    <p>안녕하세요,</p>
                    <p>요청하신 인증번호는 다음과 같습니다:</p>
                    <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
                        <h1 style="color: #4CAF50; margin: 0; letter-spacing: 5px;">${code}</h1>
                    </div>
                    <p>이 인증번호는 <strong>5분간</strong> 유효합니다.</p>
                    <p>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                    <p style="color: #888; font-size: 12px;">MVE Login Server</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('[SEND-VERIFICATION] 이메일 전송 완료');

        console.log('[SEND-VERIFICATION] SUCCESS:', { email });

        res.json({
            success: true,
            message: 'Verification code sent to email',
            expiresIn: 300 // 초 단위
        });

    } catch (error) {
        console.error('[SEND-VERIFICATION] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        // 이메일 전송 오류
        if (error.message && error.message.includes('mail')) {
            return res.status(500).json({
                success: false,
                error: 'EMAIL_SEND_ERROR',
                message: 'Failed to send verification email'
            });
        }

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

// 3. 인증번호 검증
router.post('/verify-code', async (req, res) => {
    try {
        console.log('[VERIFY-CODE] 인증번호 검증 시도:', {
            email: req.body.email,
            timestamp: new Date().toISOString()
        });

        const { email, code } = req.body;

        // 입력값 검증
        if (!email || !code) {
            console.log('[VERIFY-CODE] ERROR: 필수 필드 누락', {
                email: !!email,
                code: !!code
            });
            return res.status(400).json({
                success: false,
                error: 'MISSING_FIELDS',
                message: 'Email and code are required',
                details: {
                    email: !email ? 'Email is required' : 'OK',
                    code: !code ? 'Code is required' : 'OK'
                }
            });
        }

        if (typeof email !== 'string' || typeof code !== 'string') {
            console.log('[VERIFY-CODE] ERROR: 잘못된 입력 타입');
            return res.status(400).json({
                success: false,
                error: 'INVALID_INPUT_TYPE',
                message: 'Email and code must be strings'
            });
        }

        // 인증번호 형식 검증 (6자리 숫자)
        if (!/^\d{6}$/.test(code)) {
            console.log('[VERIFY-CODE] ERROR: 잘못된 인증번호 형식', { code });
            return res.status(400).json({
                success: false,
                error: 'INVALID_CODE_FORMAT',
                message: 'Code must be 6 digits'
            });
        }

        // 만료된 인증번호 삭제
        console.log('[VERIFY-CODE] 만료된 인증번호 삭제');
        await pool.query('SELECT delete_expired_verifications()');

        // DB에서 인증번호 조회
        console.log('[VERIFY-CODE] DB 조회 시작:', { email });
        const result = await pool.query(
            'SELECT * FROM email_verifications WHERE email = $1 AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
            [email]
        );
        console.log('[VERIFY-CODE] DB 조회 완료:', { found: result.rows.length > 0 });

        if (result.rows.length === 0) {
            console.log('[VERIFY-CODE] ERROR: 인증번호 없음', { email });
            return res.status(404).json({
                success: false,
                error: 'CODE_NOT_FOUND',
                message: 'No verification code found for this email'
            });
        }

        const verification = result.rows[0];

        // 만료 확인
        if (new Date() > new Date(verification.expires_at)) {
            console.log('[VERIFY-CODE] ERROR: 인증번호 만료', { email });
            return res.status(410).json({
                success: false,
                error: 'CODE_EXPIRED',
                message: 'Verification code has expired'
            });
        }

        // 시도 횟수 확인
        if (verification.attempts >= 5) {
            console.log('[VERIFY-CODE] ERROR: 시도 횟수 초과', { email, attempts: verification.attempts });
            // 인증번호 무효화
            await pool.query(
                'UPDATE email_verifications SET verified = TRUE WHERE id = $1',
                [verification.id]
            );
            return res.status(429).json({
                success: false,
                error: 'TOO_MANY_ATTEMPTS',
                message: 'Too many failed attempts. Please request a new code.'
            });
        }

        // 인증번호 일치 확인
        if (verification.code !== code) {
            console.log('[VERIFY-CODE] ERROR: 인증번호 불일치', { email, attempts: verification.attempts + 1 });
            // 시도 횟수 증가
            await pool.query(
                'UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1',
                [verification.id]
            );
            return res.status(401).json({
                success: false,
                error: 'INVALID_CODE',
                message: 'Invalid verification code',
                attemptsRemaining: 5 - (verification.attempts + 1)
            });
        }

        // 인증 성공
        console.log('[VERIFY-CODE] 인증번호 검증 성공');
        await pool.query(
            'UPDATE email_verifications SET verified = TRUE WHERE id = $1',
            [verification.id]
        );

        console.log('[VERIFY-CODE] SUCCESS:', { email });

        res.json({
            success: true,
            message: 'Email verified successfully'
        });

    } catch (error) {
        console.error('[VERIFY-CODE] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

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

// 4. 회원가입
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

// 5. 로그인
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

// 6. 로그아웃
router.post('/logout', verifyToken, async (req, res) => {
    try {
        console.log('[LOGOUT] 로그아웃 시도:', {
            userId: req.userId,
            username: req.username,
            timestamp: new Date().toISOString()
        });

        // JWT는 stateless이므로 서버에서 직접 무효화할 수 없음
        // 클라이언트에서 토큰을 삭제하도록 안내
        // 필요시 토큰 블랙리스트를 구현할 수 있음

        console.log('[LOGOUT] SUCCESS: 로그아웃 성공', {
            userId: req.userId,
            username: req.username
        });

        res.json({
            success: true,
            message: 'Logout successful. Please delete the token on client side.'
        });

    } catch (error) {
        console.error('[LOGOUT] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

// 7. 회원 탈퇴
router.delete('/withdraw', verifyToken, async (req, res) => {
    try {
        console.log('[WITHDRAW] 회원 탈퇴 시도:', {
            userId: req.userId,
            username: req.username,
            timestamp: new Date().toISOString()
        });

        const { password } = req.body;

        // 비밀번호 확인 필수
        if (!password) {
            console.log('[WITHDRAW] ERROR: 비밀번호 누락');
            return res.status(400).json({
                success: false,
                error: 'MISSING_PASSWORD',
                message: 'Password is required for account deletion'
            });
        }

        // 사용자 조회
        console.log('[WITHDRAW] 사용자 조회:', { userId: req.userId });
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.userId]
        );

        if (userResult.rows.length === 0) {
            console.log('[WITHDRAW] ERROR: 사용자 없음', { userId: req.userId });
            return res.status(404).json({
                success: false,
                error: 'USER_NOT_FOUND',
                message: 'User not found'
            });
        }

        const user = userResult.rows[0];

        // 비밀번호 검증
        console.log('[WITHDRAW] 비밀번호 검증');
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            console.log('[WITHDRAW] ERROR: 비밀번호 불일치', { userId: req.userId });
            return res.status(401).json({
                success: false,
                error: 'INVALID_PASSWORD',
                message: 'Invalid password'
            });
        }

        // 관련 데이터 삭제 (이메일 인증 기록)
        console.log('[WITHDRAW] 관련 데이터 삭제');
        await pool.query(
            'DELETE FROM email_verifications WHERE email = $1',
            [user.email]
        );

        // 사용자 삭제
        console.log('[WITHDRAW] 사용자 삭제:', { userId: req.userId });
        await pool.query(
            'DELETE FROM users WHERE id = $1',
            [req.userId]
        );

        console.log('[WITHDRAW] SUCCESS: 회원 탈퇴 성공', {
            userId: req.userId,
            username: req.username
        });

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        console.error('[WITHDRAW] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

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

// 8. 보호된 라우트 예시
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