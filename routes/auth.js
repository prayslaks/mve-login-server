const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../db');
const redisClient = require('../redis-client');
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

/**
 * @swagger
 * /api/auth/check-email:
 *   post:
 *     summary: 이메일 중복 확인
 *     description: 회원가입 전 이메일 중복 여부를 확인합니다
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "test@example.com"
 *     responses:
 *       200:
 *         description: 이메일 사용 가능 또는 중복
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 code:
 *                   type: string
 *                   example: "EMAIL_AVAILABLE"
 *                   description: "EMAIL_AVAILABLE (사용 가능) 또는 EMAIL_ALREADY_EXISTS (중복)"
 *                 message:
 *                   type: string
 *                   example: "Email is available"
 *                 exists:
 *                   type: boolean
 *                   example: false
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INVALID_EMAIL_FORMAT"
 *                 message:
 *                   type: string
 *                   example: "Invalid email format"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INTERNAL_SERVER_ERROR"
 *                 message:
 *                   type: string
 *                   example: "Server error"
 */
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
                code: 'MISSING_EMAIL',
                message: 'Email is required'
            });
        }

        if (typeof email !== 'string') {
            console.log('[CHECK-EMAIL] ERROR: 잘못된 입력 타입');
            return res.status(400).json({
                success: false,
                code: 'INVALID_INPUT_TYPE',
                message: 'Email must be a string'
            });
        }

        // 이메일 형식 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('[CHECK-EMAIL] ERROR: 잘못된 이메일 형식', { email });
            return res.status(400).json({
                success: false,
                code: 'INVALID_EMAIL_FORMAT',
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

        res.status(200).json({
            success: !exists,
            code: exists ? 'EMAIL_ALREADY_EXISTS' : 'EMAIL_AVAILABLE',
            message: exists ? 'Email already in use' : 'Email is available',
            exists: exists
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
                code: 'DATABASE_ERROR',
                message: 'Database error',
                dbCode: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/auth/send-verification:
 *   post:
 *     summary: 이메일 인증번호 발송
 *     description: 회원가입 시 이메일로 6자리 인증번호를 발송합니다 (5분 유효, 1분 내 재전송 제한)
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "test@example.com"
 *     responses:
 *       200:
 *         description: 인증번호 발송 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 code:
 *                   type: string
 *                   example: "VERIFICATION_CODE_SENT"
 *                 message:
 *                   type: string
 *                   example: "Verification code sent to email"
 *                 expiresIn:
 *                   type: integer
 *                   description: 유효 시간 (초)
 *                   example: 300
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INVALID_EMAIL_FORMAT"
 *                 message:
 *                   type: string
 *                   example: "Invalid email format"
 *       409:
 *         description: 이미 등록된 이메일
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "EMAIL_ALREADY_EXISTS"
 *                 message:
 *                   type: string
 *                   example: "Email is already registered"
 *       429:
 *         description: 재전송 제한 (1분 이내)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "TOO_MANY_REQUESTS"
 *                 message:
 *                   type: string
 *                   example: "Please wait before requesting another code"
 *                 retryAfter:
 *                   type: integer
 *                   example: 60
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INTERNAL_SERVER_ERROR"
 *                 message:
 *                   type: string
 *                   example: "Server error"
 */
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
                code: 'MISSING_EMAIL',
                message: 'Email is required'
            });
        }

        if (typeof email !== 'string') {
            console.log('[SEND-VERIFICATION] ERROR: 잘못된 입력 타입');
            return res.status(400).json({
                success: false,
                code: 'INVALID_INPUT_TYPE',
                message: 'Email must be a string'
            });
        }

        // 이메일 형식 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('[SEND-VERIFICATION] ERROR: 잘못된 이메일 형식', { email });
            return res.status(400).json({
                success: false,
                code: 'INVALID_EMAIL_FORMAT',
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
                code: 'EMAIL_ALREADY_EXISTS',
                message: 'Email is already registered'
            });
        }

        // Rate limiting: 1분 이내 재전송 방지 (Redis 사용)
        console.log('[SEND-VERIFICATION] Rate limiting 확인');
        const rateLimitKey = `email:ratelimit:${email}`;
        const rateLimitExists = await redisClient.exists(rateLimitKey);

        if (rateLimitExists) {
            console.log('[SEND-VERIFICATION] ERROR: 재전송 제한', { email });
            const ttl = await redisClient.ttl(rateLimitKey);
            return res.status(429).json({
                success: false,
                code: 'TOO_MANY_REQUESTS',
                message: 'Please wait before requesting another code',
                retryAfter: ttl > 0 ? ttl : 60
            });
        }

        // 6자리 인증번호 생성
        const code = generateVerificationCode();
        console.log('[SEND-VERIFICATION] 인증번호 생성 완료');

        // Redis에 저장 (5분 TTL, 자동 만료)
        const verificationKey = `email:verification:${email}`;
        const verificationData = JSON.stringify({
            code: code,
            attempts: 0,
            createdAt: Date.now()
        });

        console.log('[SEND-VERIFICATION] Redis 저장 시작');
        await redisClient.setEx(verificationKey, 300, verificationData); // 5분 = 300초

        // Rate limit 키 설정 (1분 TTL)
        await redisClient.setEx(rateLimitKey, 60, Date.now().toString());
        console.log('[SEND-VERIFICATION] Redis 저장 완료');

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

        res.status(200).json({
            success: true,
            code: 'VERIFICATION_CODE_SENT',
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
                code: 'EMAIL_SEND_ERROR',
                message: 'Failed to send verification email'
            });
        }

        if (error.code) {
            return res.status(500).json({
                success: false,
                code: 'DATABASE_ERROR',
                message: 'Database error',
                dbCode: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/auth/verify-code:
 *   post:
 *     summary: 인증번호 검증
 *     description: 이메일로 받은 6자리 인증번호를 검증합니다 (최대 5회 시도)
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "test@example.com"
 *               code:
 *                 type: string
 *                 pattern: '^\d{6}$'
 *                 description: 6자리 인증번호
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: 인증번호 검증 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 code:
 *                   type: string
 *                   example: "EMAIL_VERIFIED"
 *                 message:
 *                   type: string
 *                   example: "Email verified successfully"
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INVALID_CODE_FORMAT"
 *                 message:
 *                   type: string
 *                   example: "Code must be 6 digits"
 *       401:
 *         description: 인증번호 불일치
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INVALID_CODE"
 *                 message:
 *                   type: string
 *                   example: "Invalid verification code"
 *                 attemptsRemaining:
 *                   type: integer
 *                   example: 4
 *       404:
 *         description: 인증번호 없음 또는 만료됨
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "CODE_NOT_FOUND"
 *                 message:
 *                   type: string
 *                   example: "No verification code found or expired"
 *       429:
 *         description: 시도 횟수 초과
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "TOO_MANY_ATTEMPTS"
 *                 message:
 *                   type: string
 *                   example: "Too many failed attempts. Please request a new code."
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INTERNAL_SERVER_ERROR"
 *                 message:
 *                   type: string
 *                   example: "Server error"
 */
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
                code: 'MISSING_FIELDS',
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
                code: 'INVALID_INPUT_TYPE',
                message: 'Email and code must be strings'
            });
        }

        // 인증번호 형식 검증 (6자리 숫자)
        if (!/^\d{6}$/.test(code)) {
            console.log('[VERIFY-CODE] ERROR: 잘못된 인증번호 형식', { code });
            return res.status(400).json({
                success: false,
                code: 'INVALID_CODE_FORMAT',
                message: 'Code must be 6 digits'
            });
        }

        // Redis에서 인증번호 조회
        console.log('[VERIFY-CODE] Redis 조회 시작:', { email });
        const verificationKey = `email:verification:${email}`;
        const verificationData = await redisClient.get(verificationKey);

        if (!verificationData) {
            console.log('[VERIFY-CODE] ERROR: 인증번호 없음 또는 만료됨', { email });
            return res.status(404).json({
                success: false,
                code: 'CODE_NOT_FOUND',
                message: 'No verification code found or expired'
            });
        }

        const verification = JSON.parse(verificationData);
        console.log('[VERIFY-CODE] Redis 조회 완료:', { found: true, attempts: verification.attempts });

        // 시도 횟수 확인
        if (verification.attempts >= 5) {
            console.log('[VERIFY-CODE] ERROR: 시도 횟수 초과', { email, attempts: verification.attempts });
            // 인증번호 무효화 (Redis에서 삭제)
            await redisClient.del(verificationKey);
            return res.status(429).json({
                success: false,
                code: 'TOO_MANY_ATTEMPTS',
                message: 'Too many failed attempts. Please request a new code.'
            });
        }

        // 인증번호 일치 확인
        if (verification.code !== code) {
            console.log('[VERIFY-CODE] ERROR: 인증번호 불일치', { email, attempts: verification.attempts + 1 });

            // 시도 횟수 증가 (TTL 유지)
            verification.attempts += 1;
            const ttl = await redisClient.ttl(verificationKey);
            await redisClient.setEx(verificationKey, ttl > 0 ? ttl : 300, JSON.stringify(verification));

            return res.status(401).json({
                success: false,
                code: 'INVALID_CODE',
                message: 'Invalid verification code',
                attemptsRemaining: 5 - verification.attempts
            });
        }

        // 인증 성공 - Redis는 유지 (회원가입 시 사용)
        console.log('[VERIFY-CODE] 인증번호 검증 성공 (Redis 유지)');

        console.log('[VERIFY-CODE] SUCCESS:', { email });

        res.status(200).json({
            success: true,
            code: 'EMAIL_VERIFIED',
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
                code: 'DATABASE_ERROR',
                message: 'Database error',
                dbCode: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     summary: 회원가입
 *     description: 이메일 인증 후 새 사용자 계정을 생성합니다
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "test@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: "password123"
 *               code:
 *                 type: string
 *                 pattern: '^\d{6}$'
 *                 description: 이메일로 받은 6자리 인증번호
 *                 example: "123456"
 *     responses:
 *       201:
 *         description: 회원가입 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SignupResponse'
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "WEAK_PASSWORD"
 *                 message:
 *                   type: string
 *                   example: "Password must be at least 6 characters long"
 *       401:
 *         description: 인증번호 불일치
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INVALID_CODE"
 *                 message:
 *                   type: string
 *                   example: "Invalid verification code"
 *       404:
 *         description: 인증번호 없음 또는 만료됨
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "CODE_NOT_FOUND"
 *                 message:
 *                   type: string
 *                   example: "No verification code found or expired. Please request a new code."
 *       409:
 *         description: 이메일 중복
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "USER_ALREADY_EXISTS"
 *                 message:
 *                   type: string
 *                   example: "Email already in use"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INTERNAL_SERVER_ERROR"
 *                 message:
 *                   type: string
 *                   example: "Server error"
 */
// 4. 회원가입
router.post('/signup', async (req, res) => {
    try {
        console.log('[SIGNUP] 회원가입 시도:', {
            email: req.body.email,
            timestamp: new Date().toISOString()
        });

        const { password, email, code } = req.body;

        // 1. 입력값 유효성 검사
        if (!password || !email || !code) {
            console.log('[SIGNUP] ERROR: 필수 필드 누락', {
                password: !!password,
                email: !!email,
                code: !!code
            });
            return res.status(400).json({
                success: false,
                code: 'MISSING_FIELDS',
                message: 'All fields required',
                details: {
                    password: !password ? 'Password is required' : 'OK',
                    email: !email ? 'Email is required' : 'OK',
                    code: !code ? 'Verification code is required' : 'OK'
                }
            });
        }

        // 입력값 타입 검증
        if (typeof password !== 'string' || typeof email !== 'string' || typeof code !== 'string') {
            console.log('[SIGNUP] ERROR: 잘못된 입력 타입', {
                passwordType: typeof password,
                emailType: typeof email,
                codeType: typeof code
            });
            return res.status(400).json({
                success: false,
                code: 'INVALID_INPUT_TYPE',
                message: 'All fields must be strings'
            });
        }

        // 이메일 형식 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('[SIGNUP] ERROR: 잘못된 이메일 형식', { email });
            return res.status(400).json({
                success: false,
                code: 'INVALID_EMAIL_FORMAT',
                message: 'Invalid email format'
            });
        }

        // 인증번호 형식 검증 (6자리 숫자)
        if (!/^\d{6}$/.test(code)) {
            console.log('[SIGNUP] ERROR: 잘못된 인증번호 형식', { code });
            return res.status(400).json({
                success: false,
                code: 'INVALID_CODE_FORMAT',
                message: 'Code must be 6 digits'
            });
        }

        // 비밀번호 길이 검증
        if (password.length < 6) {
            console.log('[SIGNUP] ERROR: 비밀번호 길이 부족', { length: password.length });
            return res.status(400).json({
                success: false,
                code: 'WEAK_PASSWORD',
                message: 'Password must be at least 6 characters long'
            });
        }

        // 2. 이메일 인증번호 확인
        console.log('[SIGNUP] 이메일 인증번호 확인 시작:', { email });
        const verificationKey = `email:verification:${email}`;
        const verificationData = await redisClient.get(verificationKey);

        if (!verificationData) {
            console.log('[SIGNUP] ERROR: 인증번호 없음 또는 만료됨', { email });
            return res.status(404).json({
                success: false,
                code: 'CODE_NOT_FOUND',
                message: 'No verification code found or expired. Please request a new code.'
            });
        }

        const verification = JSON.parse(verificationData);

        // 인증번호 일치 확인
        if (verification.code !== code) {
            console.log('[SIGNUP] ERROR: 인증번호 불일치', { email });
            return res.status(401).json({
                success: false,
                code: 'INVALID_CODE',
                message: 'Invalid verification code'
            });
        }

        console.log('[SIGNUP] 이메일 인증 확인 완료:', { email });

        // 3. 중복 확인
        console.log('[SIGNUP] 중복 확인 시작:', { email });
        const userCheck = await pool.query(
            'SELECT email FROM users WHERE email = $1',
            [email]
        );
        console.log('[SIGNUP] 중복 확인 완료:', { found: userCheck.rows.length });

        if (userCheck.rows.length > 0) {
            console.log('[SIGNUP] ERROR: 중복된 이메일', { email });
            return res.status(409).json({
                success: false,
                code: 'USER_ALREADY_EXISTS',
                message: 'Email already in use'
            });
        }

        // 4. 비밀번호 해싱
        console.log('[SIGNUP] 비밀번호 해싱 시작');
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('[SIGNUP] 비밀번호 해싱 완료');

        // 5. DB 저장
        console.log('[SIGNUP] DB 저장 시작');
        const result = await pool.query(
            'INSERT INTO users (password, email) VALUES ($1, $2) RETURNING id, email',
            [hashedPassword, email]
        );
        console.log('[SIGNUP] DB 저장 완료:', { userId: result.rows[0].id });

        // 6. 인증번호 Redis에서 삭제 (회원가입 완료)
        await redisClient.del(verificationKey);
        console.log('[SIGNUP] 인증번호 Redis 삭제 완료:', { email });

        console.log('[SIGNUP] SUCCESS: 회원가입 성공', {
            userId: result.rows[0].id,
            email: result.rows[0].email
        });

        res.status(201).json({
            success: true,
            code: 'USER_CREATED',
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
                    code: 'DUPLICATE_ENTRY',
                    message: 'Email already exists',
                    dbCode: error.code
                });
            }

            return res.status(500).json({
                success: false,
                code: 'DATABASE_ERROR',
                message: 'Database error',
                dbCode: error.code
            });
        }

        // bcrypt 오류 구분
        if (error.message && error.message.includes('bcrypt')) {
            return res.status(500).json({
                success: false,
                code: 'ENCRYPTION_ERROR',
                message: 'Password encryption error'
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: 로그인
 *     description: 이메일과 비밀번호로 로그인하여 JWT 토큰을 발급받습니다
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "test@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 인증 실패 (잘못된 이메일 또는 비밀번호)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// 5. 로그인
router.post('/login', async (req, res) => {
    try {
        console.log('[LOGIN] 로그인 시도:', { email: req.body.email, timestamp: new Date().toISOString() });

        const { email, password } = req.body;

        // 1. 입력값 유효성 검사
        if (!email || !password) {
            console.log('[LOGIN] ERROR: 필수 필드 누락', { email: !!email, password: !!password });
            return res.status(400).json({
                success: false,
                code: 'MISSING_FIELDS',
                message: 'Email and password required',
                details: {
                    email: !email ? 'Email is required' : 'OK',
                    password: !password ? 'Password is required' : 'OK'
                }
            });
        }

        // 입력값 타입 검증
        if (typeof email !== 'string' || typeof password !== 'string') {
            console.log('[LOGIN] ERROR: 잘못된 입력 타입', {
                emailType: typeof email,
                passwordType: typeof password
            });
            return res.status(400).json({
                success: false,
                code: 'INVALID_INPUT_TYPE',
                message: 'Email and password must be strings'
            });
        }

        // 2. 사용자 조회
        console.log('[LOGIN] DB 조회 시작:', { email });
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        console.log('[LOGIN] DB 조회 완료:', { found: result.rows.length > 0 });

        if (result.rows.length === 0) {
            console.log('[LOGIN] ERROR: 사용자 없음', { email });
            return res.status(401).json({
                success: false,
                code: 'USER_NOT_FOUND',
                message: 'Invalid credentials'
            });
        }

        const user = result.rows[0];

        // 3. 비밀번호 검증
        console.log('[LOGIN] 비밀번호 검증 시작');
        const validPassword = await bcrypt.compare(password, user.password);
        console.log('[LOGIN] 비밀번호 검증 완료:', { valid: validPassword });

        if (!validPassword) {
            console.log('[LOGIN] ERROR: 비밀번호 불일치', { email });
            return res.status(401).json({
                success: false,
                code: 'INVALID_PASSWORD',
                message: 'Invalid credentials'
            });
        }

        // 4. JWT_SECRET 확인
        if (!process.env.JWT_SECRET) {
            console.error('[LOGIN] CRITICAL ERROR: JWT_SECRET 설정되지 않음');
            return res.status(500).json({
                success: false,
                code: 'SERVER_CONFIG_ERROR',
                message: 'Server configuration error'
            });
        }

        // 5. JWT 토큰 생성
        console.log('[LOGIN] JWT 토큰 생성 시작');
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        );
        console.log('[LOGIN] JWT 토큰 생성 완료');

        console.log('[LOGIN] SUCCESS: 로그인 성공', {
            userId: user.id,
            email: user.email
        });

        res.status(200).json({
            success: true,
            code: 'LOGIN_SUCCESS',
            message: 'Login successful',
            token: token,
            user: {
                id: user.id,
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
                code: 'DATABASE_ERROR',
                message: 'Database connection error',
                code: error.code
            });
        }

        // bcrypt 오류 구분
        if (error.message && error.message.includes('bcrypt')) {
            return res.status(500).json({
                success: false,
                code: 'ENCRYPTION_ERROR',
                message: 'Password verification error'
            });
        }

        // JWT 오류 구분
        if (error.message && error.message.includes('jwt')) {
            return res.status(500).json({
                success: false,
                code: 'TOKEN_GENERATION_ERROR',
                message: 'Token generation error'
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: 로그아웃
 *     description: 로그아웃을 수행합니다 (클라이언트에서 토큰 삭제 필요)
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 로그아웃 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 code:
 *                   type: string
 *                   example: "LOGOUT_SUCCESS"
 *                 message:
 *                   type: string
 *                   example: "Logout successful. Please delete the token on client side."
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "UNAUTHORIZED"
 *                 message:
 *                   type: string
 *                   example: "Access denied"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INTERNAL_SERVER_ERROR"
 *                 message:
 *                   type: string
 *                   example: "Server error"
 */
// 6. 로그아웃
router.post('/logout', verifyToken, async (req, res) => {
    try {
        console.log('[LOGOUT] 로그아웃 시도:', {
            userId: req.userId,
            email: req.email,
            timestamp: new Date().toISOString()
        });

        // JWT는 stateless이므로 서버에서 직접 무효화할 수 없음
        // 클라이언트에서 토큰을 삭제하도록 안내
        // 필요시 토큰 블랙리스트를 구현할 수 있음

        console.log('[LOGOUT] SUCCESS: 로그아웃 성공', {
            userId: req.userId,
            email: req.email
        });

        res.status(200).json({
            success: true,
            code: 'LOGOUT_SUCCESS',
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
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/auth/withdraw:
 *   delete:
 *     summary: 회원 탈퇴
 *     description: 비밀번호 확인 후 계정을 삭제합니다 (복구 불가능)
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 description: 현재 비밀번호
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: 회원 탈퇴 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 code:
 *                   type: string
 *                   example: "ACCOUNT_DELETED"
 *                 message:
 *                   type: string
 *                   example: "Account deleted successfully"
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "MISSING_PASSWORD"
 *                 message:
 *                   type: string
 *                   example: "Password is required for account deletion"
 *       401:
 *         description: 비밀번호 불일치 또는 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INVALID_PASSWORD"
 *                 message:
 *                   type: string
 *                   example: "Invalid password"
 *       404:
 *         description: 사용자 없음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "USER_NOT_FOUND"
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INTERNAL_SERVER_ERROR"
 *                 message:
 *                   type: string
 *                   example: "Server error"
 */
// 7. 회원 탈퇴
router.delete('/withdraw', verifyToken, async (req, res) => {
    try {
        console.log('[WITHDRAW] 회원 탈퇴 시도:', {
            userId: req.userId,
            email: req.email,
            timestamp: new Date().toISOString()
        });

        const { password } = req.body;

        // 비밀번호 확인 필수
        if (!password) {
            console.log('[WITHDRAW] ERROR: 비밀번호 누락');
            return res.status(400).json({
                success: false,
                code: 'MISSING_PASSWORD',
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
                code: 'USER_NOT_FOUND',
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
                code: 'INVALID_PASSWORD',
                message: 'Invalid password'
            });
        }

        // 관련 데이터 삭제 (Redis의 이메일 인증 기록)
        console.log('[WITHDRAW] 관련 데이터 삭제');
        const verificationKey = `email:verification:${user.email}`;
        const rateLimitKey = `email:ratelimit:${user.email}`;
        await redisClient.del([verificationKey, rateLimitKey]);

        // 사용자 삭제
        console.log('[WITHDRAW] 사용자 삭제:', { userId: req.userId });
        await pool.query(
            'DELETE FROM users WHERE id = $1',
            [req.userId]
        );

        console.log('[WITHDRAW] SUCCESS: 회원 탈퇴 성공', {
            userId: req.userId,
            email: req.email
        });

        res.status(200).json({
            success: true,
            code: 'ACCOUNT_DELETED',
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
                code: 'DATABASE_ERROR',
                message: 'Database error',
                dbCode: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: 프로필 조회
 *     description: 로그인한 사용자의 프로필 정보를 조회합니다
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 프로필 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProfileResponse'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "UNAUTHORIZED"
 *                 message:
 *                   type: string
 *                   example: "Access denied"
 *       404:
 *         description: 사용자 없음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "USER_NOT_FOUND"
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INTERNAL_SERVER_ERROR"
 *                 message:
 *                   type: string
 *                   example: "Server error"
 */
// 8. 보호된 라우트 예시
router.get('/profile', verifyToken, async (req, res) => {
    try {
        console.log('[PROFILE] 프로필 조회 시도:', {
            userId: req.userId,
            email: req.email,
            timestamp: new Date().toISOString()
        });

        // DB에서 사용자 정보 조회
        console.log('[PROFILE] DB 조회 시작:', { userId: req.userId });
        const result = await pool.query(
            'SELECT id, email, created_at FROM users WHERE id = $1',
            [req.userId]
        );
        console.log('[PROFILE] DB 조회 완료:', { found: result.rows.length > 0 });

        // 사용자가 존재하지 않는 경우 (토큰은 유효하지만 사용자가 삭제된 경우)
        if (result.rows.length === 0) {
            console.log('[PROFILE] ERROR: 사용자 없음', { userId: req.userId });
            return res.status(404).json({
                success: false,
                code: 'USER_NOT_FOUND',
                message: 'User not found'
            });
        }

        console.log('[PROFILE] SUCCESS: 프로필 조회 성공', {
            userId: result.rows[0].id,
            email: result.rows[0].email
        });

        const user = result.rows[0];
        res.status(200).json({
            success: true,
            code: 'PROFILE_RETRIEVED',
            message: 'Profile retrieved successfully',
            user: {
                id: user.id,
                email: user.email,
                createdAt: user.created_at
            }
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
                code: 'DATABASE_ERROR',
                message: 'Database error',
                dbCode: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

module.exports = router;