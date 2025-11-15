# MVE Login Server

원티드 포텐업 [언리얼 & AI] 최종 프로젝트의 로그인 기능을 위한 API를 제공합니다.<br>
PostgreSQL과 JWT를 사용하는 Node.js 인증 서버로, Amazon Web Services E2C Instance Ubuntu에 프로젝트를 배포하는 걸 상정합니다.<br>
Claude Code 바이브 코딩으로 개발했으므로, 이런 걸 가져다 실제 서비스에 사용하다 보안 문제가 발생해도 본인은 책임을 질 수가 없습니다.<br>

## 설치 방법

### 1. 의존성 설치

로컬 윈도우 시스템 테스트 :
```powershell
# 폴더 내 package.json 참조
npm install
```

AWS E2C 우분투 인스턴스 :
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

### 2. PostgreSQL 설정

시스템에 데이터베이스 PostgreSQL이 설치되어 있어야 합니다.
파일을 실행하지 않고 SQL문을 직접 실행하는 방법도 있습니다.

우분투 서버에서 : 
```bash
# PostgreSQL 서비스 시작
sudo systemctl start postgresql
sudo systemctl enable postgresql

# postgres 사용자로 전환
sudo -u postgres psql
```

로컬 윈도우에서 :
```powershell
# PostgreSQL 접속
psql -U postgres

# 데이터베이스 생성
CREATE DATABASE logindb;

# logindb 연결
\c logindb

# .sql 파일 실행하여 테이블 생성
\i init.sql
```
```powershell
# 명령줄에서 바로 실행하는 방법
psql -U postgres -d gamedb -f init.sql
```

### 3. 환경 변수 설정

nano text 편집기로 `.env` 파일을 수정:
```bash
nano .env
```
```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_actual_password   # PostgreSQL 비밀번호로 변경
DB_NAME=logindb                    # 데이터베이스 이름을 지정
JWT_SECRET=your-strong-secret-key  # 32자 강력한 비밀 키로 변경
```

JWT 암호키 생성:
```bash
# Node.js 명령어
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 대부분의 리눅스에 기본 설치
openssl rand -hex 32
```

### 4. 서버 실행

로컬 윈도우 혹은 서버 우분투에서 : 
```powershell
node server.js
```

서버가 `http://localhost:3000`에서 실행됩니다.<br>
AWS E2C 인스턴스 보안 그룹에서 개발 용 포트 3000으로 접속할 수 있습니다.<br>
서비스 시에는 Process Manager 2를 사용하여 서버 구동을 자동화합니다.<br>
서비스 시에는 포트 3000을 닫고 nginx를 사용하여 방화벽을 세웁니다.<br>

## API 엔드포인트

### 회원가입
```bash
POST /api/auth/signup
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123"
}
```

### 로그인
```bash
POST /api/auth/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123"
}
```

응답:
```json
{
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
```bash
GET /api/auth/profile
Authorization: Bearer <your_token>
```

### 헬스 체크
```bash
GET /health
```

## 테스트

### PowerShell의 Invoke-RestMethod 또는 Invoke-WebRequest 사용

**헬스체크:**
```powershell
# 방법 1: Invoke-RestMethod (권장)
Invoke-RestMethod -Uri "http://localhost:3000/health"
```
```powershell
# 방법 2: Invoke-WebRequest (상세 정보 필요 시)
$response = Invoke-WebRequest -Uri "http://localhost:3000/health"
$response.Content
$response.StatusCode | ConvertFrom-Json
```

**회원가입:**
```powershell
# JSON 구축
$body = @{
    username = "testuser"
    email = "test@example.com"
    password = "password123"
} | ConvertTo-Json

# 혹은 Here-String 작성법
$body = @"
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123"
}
"@
```
```powershell
# 방법 1: Invoke-RestMethod (권장)
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/signup" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```
```powershell
# 방법 2: Invoke-WebRequest (상세 정보 필요 시)
$response = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/signup" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body

$response.StatusCode
$response.Content | ConvertFrom-Json
```

**로그인:**
```powershell
# JSON 구축
$body = @{
    username = "testuser"
    password = "password123"
} | ConvertTo-Json

# 혹은 Here-String 작성법
$body = @"
{
  "username": "testuser",
  "password": "password123"
}
"@
```
```powershell
# 방법 1: Invoke-RestMethod (권장)
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```
```powershell
# 방법 2: Invoke-WebRequest (상세 정보 필요 시)
$response = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```
``` powershell
# JWT 토큰을 받아서 인증에 사용
$token = $response.token
```

**프로필 조회:**
```powershell
curl -X GET http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer <your_token>"
```

## 프로젝트 구조

```
mve-login-server/
├── server.js          # Express 서버 설정
├── db.js             # PostgreSQL 연결 풀
├── .env              # 환경 변수
├── init.sql          # 데이터베이스 초기화 SQL
├── routes/
│   └── auth.js       # 인증 관련 라우트
└── package.json      # 의존성 관리
```

## 보안 고려사항

1. 비밀 키가 있는 `.env` 파일을 `.gitignore`에 추가해 커밋하지 않습니다.
2. `JWT_SECRET`은 최소 32자 이상의 강력하고 랜덤한 문자열로 설정합니다.
3. 프로덕션 환경에서는 HTTPS를 사용합니다. (도메인 구입과 ssl 필요)
4. 비밀번호는 bcrypt로 해싱되어 저장됩니다.

## 기술 스택

- **Node.js** - 런타임 환경
- **Express** - 웹 프레임워크
- **PostgreSQL** - 관계형 데이터베이스
- **pg** - PostgreSQL 클라이언트
- **bcrypt** - 비밀번호 해싱
- **jsonwebtoken** - JWT 토큰 생성/검증
- **dotenv** - 환경 변수 관리
- **cors** - CORS 처리