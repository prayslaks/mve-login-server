# MVE Login Server

원티드 포텐업 [언리얼 & AI] 최종 프로젝트의 **인증 전용** 서버입니다.<br>
PostgreSQL와 이메일 인증 및 JWT 토큰을 사용하는 Node.js 인증 API 서버입니다.<br>
Amazon Web Services EC2 Instance Ubuntu에 프로젝트를 배포하는 걸 상정합니다.<br>
단, 로컬 시스템에서도 각종 인증 기능은 localhost를 통해서 테스트할 수 있습니다.<br>

> **참고**: 이 서버는 인증(회원가입, 로그인, 토큰 발급)만 담당합니다. 게임 데이터 및 리소스는 별도의 [mve-resource-server](../mve-resource-server)에서 관리됩니다. 두 서버는 동일한 JWT_SECRET을 공유하여 토큰 검증을 수행합니다.

**⚠️ 주의** : Claude Code 바이브 코딩으로 개발했으므로, 함부로 실제 서비스에 사용하다 보안 문제가 발생해도 책임지지 않습니다.

---

## 목차

- [기능](#기능)
- [설치 방법](#설치-방법)
- [환경 설정](#환경-설정)
- [서버 실행](#서버-실행)
- [API 엔드포인트](#api-엔드포인트)
- [빠른 시작](#빠른-시작)
- [프로젝트 구조](#프로젝트-구조)
- [보안 고려사항](#보안-고려사항)
- [기술 스택](#기술-스택)
- [문서](#문서)

---

## 기능

- ✅ JWT 기반 인증
- ✅ 이메일 인증 시스템 (6자리 인증번호)
- ✅ bcrypt 비밀번호 해싱
- ✅ PostgreSQL 데이터베이스
- ✅ 상세한 오류 처리 및 디버깅 로그
- ✅ CORS 지원
- ✅ 입력값 유효성 검증
- ✅ Rate limiting (인증번호 발송 제한)

---

## 설치 방법

### 1. 저장소 클론

```bash
git clone <repository-url>
cd mve-login-server
```

### 2. 의존성 설치

**로컬 Windows 시스템:**
```powershell
npm install
```

**AWS EC2 Ubuntu 인스턴스:**
```bash
# 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# Node.js 20.x 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL 설치
sudo apt install -y postgresql postgresql-contrib

# Git 설치
sudo apt install -y git

# 버전 확인
node --version
npm --version
psql --version
```

### 3. PostgreSQL 설정

**Ubuntu 서버:**
```bash
# PostgreSQL 서비스 시작
sudo systemctl start postgresql
sudo systemctl enable postgresql

# postgres 사용자로 전환
sudo -u postgres psql
```

**PostgreSQL 명령:**
```sql
-- 데이터베이스 생성
CREATE DATABASE logindb;

-- logindb 연결
\c logindb

-- .sql 파일 실행하여 테이블 생성
\i init.sql
```

**로컬 Windows 명령줄 (관리자 권한 실행):**

**신규 설치 (처음 설정하는 경우):**
```powershell
psql -U postgres -d logindb -f init.sql
```

**기존 데이터베이스 업데이트 (이미 users 테이블이 있는 경우):**
```powershell
# 이메일 인증 기능만 추가
psql -U postgres -d logindb -f migration_add_email_verification.sql
```

**⚠️ 중요**:
- `init.sql`은 **신규 설치 전용**입니다. 기존 테이블이 있으면 건너뜁니다.
- 프로덕션 환경에서 기능을 추가할 때는 **마이그레이션 스크립트**를 사용하세요.

---

## 환경 설정

`.env` 파일을 생성하고 다음 내용을 입력합니다:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_actual_password   # PostgreSQL 비밀번호로 변경
DB_NAME=logindb
JWT_SECRET=your-strong-secret-key  # 32자 강력한 비밀 키로 변경

# 이메일 인증 설정 (Naver 메일 사용 예시)
EMAIL_HOST=smtp.naver.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_email@naver.com    # 발신 이메일 주소
EMAIL_PASSWORD=your_email_password # Naver 계정 비밀번호
```

### JWT 암호키 생성

```bash
# Node.js 사용
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# OpenSSL 사용
openssl rand -hex 32
```

### 이메일 SMTP 설정

이 프로젝트는 이메일 인증번호 발송을 위해 SMTP를 사용합니다. 이메일 서비스에 따라 IMAP 설정법이 다르므로 주의합니다.

#### 옵션 1: Naver 메일 (현재 기본 설정)

Naver 메일은 앱 비밀번호 없이 일반 계정 비밀번호로 사용 가능합니다. 2단계 인증과 어플리케이션 비밀번호 설정이 필요합니다.

```env
# 인증 번호 전송 이메일 SMTP 환경설정
EMAIL_HOST=smtp.naver.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_email@naver.com
EMAIL_PASSWORD=your_email_password
```

**routes/auth.js 설정 (기본값):**
```javascript
const transporter = nodemailer.createTransport({
    host: 'smtp.naver.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});
```

#### 옵션 2: Gmail

Gmail은 2단계 인증 후 앱 비밀번호를 발급받아야 합니다.

**1. Gmail 앱 비밀번호 설정:**
1. Google 계정에서 2단계 인증 활성화
2. [Google 앱 비밀번호 페이지](https://myaccount.google.com/apppasswords) 접속
3. "앱 선택" → "기타(맞춤 이름)" 선택 → "MVE Login Server" 입력
4. "생성" 클릭하여 16자리 앱 비밀번호 생성
5. 생성된 비밀번호를 `.env` 파일의 `EMAIL_PASSWORD`에 입력 (공백 제거)

**2. .env 파일 설정:**
```env
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=abcdefghijklmnop  # 16자리 앱 비밀번호 (공백 제거)
```

**3. routes/auth.js 수정:**
```javascript
const transporter = nodemailer.createTransport({
    service: 'gmail',  // host, port, secure 대신 service 사용
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});
```

#### 옵션 3: 기타 이메일 서비스

**Outlook/Hotmail:**
```javascript
const transporter = nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,  // your_email@outlook.com
        pass: process.env.EMAIL_PASSWORD
    }
});
```

**직접 SMTP 서버 설정:**
```javascript
const transporter = nodemailer.createTransport({
    host: 'smtp.example.com',
    port: 587,
    secure: false,  // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});
```

#### SMTP 설정 참고사항

| 서비스 | SMTP 서버 | 포트 | 앱 비밀번호 필요 | 일일 전송 제한 |
|--------|-----------|------|-----------------|---------------|
| Naver | smtp.naver.com | 587 | 불필요 | 제한 없음* |
| Gmail | smtp.gmail.com | 587 | 필수 | 500통 |
| Outlook | smtp-mail.outlook.com | 587 | 불필요 | 300통 |
| SendGrid | smtp.sendgrid.net | 587 | API Key 사용 | 100통 (무료) |
| Amazon SES | email-smtp.{region}.amazonaws.com | 587 | IAM 자격증명 | 62,000통/월 (무료) |

*Naver는 공식 제한이 없으나 과도한 사용 시 제재 가능

---

## 서버 실행

### 개발 환경

```bash
node server.js
```

서버가 `http://localhost:3000`에서 실행됩니다.

### 프로덕션 환경 (PM2 사용)

```bash
# PM2 설치
npm install -g pm2

# 서버 시작
pm2 start server.js --name mve-login-server

# 자동 시작 설정
pm2 startup
pm2 save

# 서버 상태 확인
pm2 status

# 로그 확인
pm2 logs mve-login-server
```

---

## API 엔드포인트

### 헬스 체크
```
GET /health
```

### 이메일 중복 확인
```
POST /api/auth/check-email
Content-Type: application/json

{
  "email": "test@example.com"
}
```

**응답 (200 OK):**
```json
{
  "success": true,
  "exists": false,
  "message": "Email is available"
}
```

### 인증번호 발송
```
POST /api/auth/send-verification
Content-Type: application/json

{
  "email": "test@example.com"
}
```

**응답 (200 OK):**
```json
{
  "success": true,
  "message": "Verification code sent to email",
  "expiresIn": 300
}
```

### 인증번호 검증
```
POST /api/auth/verify-code
Content-Type: application/json

{
  "email": "test@example.com",
  "code": "123456"
}
```

**응답 (200 OK):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

### 회원가입
```
POST /api/auth/signup
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123"
}
```

**응답 (201 Created):**
```json
{
  "success": true,
  "message": "User created",
  "user": {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com"
  }
}
```

### 로그인
```
POST /api/auth/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123"
}
```

**응답 (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com"
  }
}
```

### 프로필 조회 (인증 필요)
```
GET /api/auth/profile
Authorization: Bearer <your_token>
```

**응답 (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## 빠른 시작

### 웹 UI 테스트

브라우저에서 `public/api_test.html`을 열어 간편하게 API를 테스트할 수 있습니다.

```
http://localhost:3000/api_test.html
```

### PowerShell 예제

```powershell
# 1. 회원가입
$signupBody = @{
    username = "testuser"
    email = "test@example.com"
    password = "password123"
} | ConvertTo-Json

$signupResult = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/signup" `
    -Method POST `
    -ContentType "application/json" `
    -Body $signupBody

# 2. 로그인
$loginBody = @{
    username = "testuser"
    password = "password123"
} | ConvertTo-Json

$loginResult = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $loginBody

# 토큰 저장
$token = $loginResult.token

# 3. 프로필 조회
$headers = @{
    "Authorization" = "Bearer $token"
}

$profile = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/profile" `
    -Method GET `
    -Headers $headers

$profile.user | Format-List
```

### curl 예제

```bash
# 회원가입
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'

# 로그인
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123"
  }'

# 프로필 조회
curl -X GET http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer <your_token>"
```

---

## 프로젝트 구조

```
mve-login-server/
├── server.js           # Express 서버 설정
├── db.js               # PostgreSQL 연결 풀
├── .env                # 환경 변수
├── init.sql            # 데이터베이스 초기화 SQL
├── routes/
│   └── auth.js         # 인증 관련 라우트
├── package.json        # 의존성 관리
├── README.md           # 프로젝트 문서
├── API_RESPONSES.md    # API 응답 형식 및 오류 코드
└── API_TEST.md         # API 테스트 가이드
```

---

## 보안 고려사항

1. **환경 변수 보호**
   - `.env` 파일을 `.gitignore`에 추가
   - 비밀 키를 절대 커밋하지 않음

2. **강력한 JWT Secret**
   - 최소 32자 이상의 랜덤 문자열 사용
   - 정기적으로 교체

3. **HTTPS 사용 (프로덕션)**
   - 도메인 구입 및 SSL 인증서 설정
   - nginx를 사용한 리버스 프록시 구성

4. **비밀번호 보안**
   - bcrypt로 해싱 (salt rounds: 10)
   - 최소 6자 이상 요구

5. **입력값 검증**
   - 모든 입력값 타입 및 형식 검증
   - SQL Injection 방지 (pg 라이브러리 자동 처리)

6. **포트 보안**
   - 개발: 포트 3000 직접 접근
   - 프로덕션: nginx(80/443)만 외부 노출, 포트 3000은 내부 전용

---

## 기술 스택

- **Node.js** - 런타임 환경
- **Express** - 웹 프레임워크
- **PostgreSQL** - 관계형 데이터베이스
- **pg** - PostgreSQL 클라이언트
- **bcrypt** - 비밀번호 해싱
- **jsonwebtoken** - JWT 토큰 생성/검증
- **nodemailer** - 이메일 전송
- **dotenv** - 환경 변수 관리
- **cors** - CORS 처리

---

## 문서

- **[API_RESPONSES.md](./API_RESPONSES.md)** - API 응답 형식 및 전체 오류 코드 목록
- **[API_TEST.md](./API_TEST.md)** - 상세한 API 테스트 방법 및 예제

---

## 라이선스

이 프로젝트는 포트폴리오 목적으로 개발되었습니다.

---

## 문의

프로젝트에 대한 문의사항이 있으시면 이슈를 등록해주세요.
