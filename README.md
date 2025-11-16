# MVE Login Server

원티드 포텐업 [언리얼 & AI] 최종 프로젝트의 로그인 기능을 위한 API를 제공합니다.

PostgreSQL과 JWT를 사용하는 Node.js 인증 서버로, Amazon Web Services EC2 Instance Ubuntu에 프로젝트를 배포하는 걸 상정합니다.

**⚠️ 주의**: Claude Code 바이브 코딩으로 개발했으므로, 이런 걸 가져다 실제 서비스에 사용하다 보안 문제가 발생해도 본인은 책임을 질 수가 없습니다.

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
- ✅ bcrypt 비밀번호 해싱
- ✅ PostgreSQL 데이터베이스
- ✅ 상세한 오류 처리 및 디버깅 로그
- ✅ CORS 지원
- ✅ 입력값 유효성 검증

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

**로컬 Windows (명령줄에서 바로 실행):**
```powershell
psql -U postgres -d logindb -f init.sql
```

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
```

### JWT 암호키 생성

```bash
# Node.js 사용
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# OpenSSL 사용
openssl rand -hex 32
```

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
- **dotenv** - 환경 변수 관리
- **cors** - CORS 처리

---

## 문서

- **[API_RESPONSES.md](./API_RESPONSES.md)** - API 응답 형식 및 전체 오류 코드 목록
- **[API_TEST.md](./API_TEST.md)** - 상세한 API 테스트 방법 및 예제

---

## 라이선스

이 프로젝트는 교육 목적으로 개발되었습니다.

---

## 문의

프로젝트에 대한 문의사항이 있으시면 이슈를 등록해주세요.
