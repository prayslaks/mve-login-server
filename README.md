# MVE Login Server

PostgreSQL과 JWT를 사용하는 Node.js 인증 서버입니다.

## 설치 방법

### 1. 의존성 설치
```bash
npm install
```

### 2. PostgreSQL 설정

PostgreSQL이 설치되어 있어야 합니다.

```bash
# PostgreSQL 접속
psql -U postgres

# 데이터베이스 생성
CREATE DATABASE gamedb;

# gamedb 연결
\c gamedb

# 테이블 생성 (init.sql 파일 실행)
\i init.sql
```

또는 명령줄에서:
```bash
psql -U postgres -d gamedb -f init.sql
```

### 3. 환경 변수 설정

`.env` 파일을 수정하세요:
```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_actual_password  # PostgreSQL 비밀번호로 변경
DB_NAME=gamedb
JWT_SECRET=your-strong-secret-key  # 강력한 비밀키로 변경
```

### 4. 서버 실행

```bash
node server.js
```

서버가 `http://localhost:3000`에서 실행됩니다.

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

### curl 사용

**회원가입:**
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"testuser\",\"email\":\"test@example.com\",\"password\":\"password123\"}"
```

**로그인:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"testuser\",\"password\":\"password123\"}"
```

**프로필 조회:**
```bash
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

1. `.env` 파일을 Git에 커밋하지 마세요 (`.gitignore`에 추가)
2. `JWT_SECRET`은 강력하고 랜덤한 문자열로 설정하세요
3. 프로덕션 환경에서는 HTTPS를 사용하세요
4. 비밀번호는 bcrypt로 해싱되어 저장됩니다 (salt rounds: 10)

## 기술 스택

- **Node.js** - 런타임 환경
- **Express** - 웹 프레임워크
- **PostgreSQL** - 관계형 데이터베이스
- **pg** - PostgreSQL 클라이언트
- **bcrypt** - 비밀번호 해싱
- **jsonwebtoken** - JWT 토큰 생성/검증
- **dotenv** - 환경 변수 관리
- **cors** - CORS 처리
