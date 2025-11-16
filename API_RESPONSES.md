# API 응답 및 오류 코드 정리

## 공통 응답 구조

모든 API 응답은 다음과 같은 공통 구조를 따릅니다:

### 성공 응답
```json
{
  "success": true,
  "message": "...",
  // ... 추가 데이터
}
```

### 실패 응답
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human readable error message",
  "details": { ... }  // 선택적
}
```

---

## 1. 회원가입 (POST /api/auth/signup)

### 요청
```json
{
  "username": "testuser",
  "password": "password123",
  "email": "test@example.com"
}
```

### 성공 응답 (201 Created)
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

### 오류 응답

#### 400 Bad Request

| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `MISSING_FIELDS` | 필수 필드 누락 | `{ "success": false, "error": "MISSING_FIELDS", "message": "All fields required", "details": { "username": "Username is required", "password": "OK", "email": "OK" } }` |
| `INVALID_INPUT_TYPE` | 입력값 타입 오류 | `{ "success": false, "error": "INVALID_INPUT_TYPE", "message": "All fields must be strings" }` |
| `INVALID_EMAIL_FORMAT` | 이메일 형식 오류 | `{ "success": false, "error": "INVALID_EMAIL_FORMAT", "message": "Invalid email format" }` |
| `WEAK_PASSWORD` | 비밀번호 길이 부족 (6자 미만) | `{ "success": false, "error": "WEAK_PASSWORD", "message": "Password must be at least 6 characters long" }` |
| `INVALID_USERNAME_LENGTH` | 사용자명 길이 오류 (3-20자 범위 외) | `{ "success": false, "error": "INVALID_USERNAME_LENGTH", "message": "Username must be between 3 and 20 characters" }` |

#### 409 Conflict

| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `USER_ALREADY_EXISTS` | 사용자명 또는 이메일 중복 | `{ "success": false, "error": "USER_ALREADY_EXISTS", "message": "User already exists", "details": { "field": "username", "message": "Username already in use" } }` |
| `DUPLICATE_ENTRY` | DB 레벨 중복 제약 위반 | `{ "success": false, "error": "DUPLICATE_ENTRY", "message": "Username or email already exists", "code": "23505" }` |

#### 500 Internal Server Error

| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `DATABASE_ERROR` | 데이터베이스 오류 | `{ "success": false, "error": "DATABASE_ERROR", "message": "Database error", "code": "..." }` |
| `ENCRYPTION_ERROR` | 비밀번호 암호화 오류 | `{ "success": false, "error": "ENCRYPTION_ERROR", "message": "Password encryption error" }` |
| `INTERNAL_SERVER_ERROR` | 기타 서버 오류 | `{ "success": false, "error": "INTERNAL_SERVER_ERROR", "message": "Server error" }` |

---

## 2. 로그인 (POST /api/auth/login)

### 요청
```json
{
  "username": "testuser",
  "password": "password123"
}
```

### 성공 응답 (200 OK)
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

### 오류 응답

#### 400 Bad Request

| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `MISSING_FIELDS` | 필수 필드 누락 | `{ "success": false, "error": "MISSING_FIELDS", "message": "Username and password required", "details": { "username": "Username is required", "password": "OK" } }` |
| `INVALID_INPUT_TYPE` | 입력값 타입 오류 | `{ "success": false, "error": "INVALID_INPUT_TYPE", "message": "Username and password must be strings" }` |

#### 401 Unauthorized

| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `USER_NOT_FOUND` | 사용자 존재하지 않음 | `{ "success": false, "error": "USER_NOT_FOUND", "message": "Invalid credentials" }` |
| `INVALID_PASSWORD` | 비밀번호 불일치 | `{ "success": false, "error": "INVALID_PASSWORD", "message": "Invalid credentials" }` |

#### 500 Internal Server Error

| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `SERVER_CONFIG_ERROR` | JWT_SECRET 미설정 | `{ "success": false, "error": "SERVER_CONFIG_ERROR", "message": "Server configuration error" }` |
| `DATABASE_ERROR` | 데이터베이스 연결 오류 | `{ "success": false, "error": "DATABASE_ERROR", "message": "Database connection error", "code": "..." }` |
| `ENCRYPTION_ERROR` | 비밀번호 검증 오류 | `{ "success": false, "error": "ENCRYPTION_ERROR", "message": "Password verification error" }` |
| `TOKEN_GENERATION_ERROR` | JWT 토큰 생성 오류 | `{ "success": false, "error": "TOKEN_GENERATION_ERROR", "message": "Token generation error" }` |
| `INTERNAL_SERVER_ERROR` | 기타 서버 오류 | `{ "success": false, "error": "INTERNAL_SERVER_ERROR", "message": "Server error" }` |

---

## 3. 프로필 조회 (GET /api/auth/profile)

### 요청
```
GET /api/auth/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 성공 응답 (200 OK)
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

### 오류 응답

#### 403 Forbidden

| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `NO_AUTH_HEADER` | Authorization 헤더 없음 | `{ "success": false, "error": "NO_AUTH_HEADER", "message": "No authorization header provided" }` |
| `INVALID_AUTH_FORMAT` | Bearer 형식이 아님 | `{ "success": false, "error": "INVALID_AUTH_FORMAT", "message": "Authorization header must start with \"Bearer \"" }` |
| `NO_TOKEN` | 토큰 없음 | `{ "success": false, "error": "NO_TOKEN", "message": "No token provided" }` |

#### 401 Unauthorized

| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `TOKEN_EXPIRED` | 토큰 만료 | `{ "success": false, "error": "TOKEN_EXPIRED", "message": "Token has expired", "expiredAt": "2024-01-01T02:00:00.000Z" }` |
| `INVALID_TOKEN` | 잘못된 토큰 | `{ "success": false, "error": "INVALID_TOKEN", "message": "Invalid token" }` |
| `TOKEN_VERIFICATION_FAILED` | 토큰 검증 실패 | `{ "success": false, "error": "TOKEN_VERIFICATION_FAILED", "message": "Token verification failed" }` |

#### 404 Not Found

| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `USER_NOT_FOUND` | 사용자 없음 (토큰은 유효하나 사용자 삭제됨) | `{ "success": false, "error": "USER_NOT_FOUND", "message": "User not found" }` |

#### 500 Internal Server Error

| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `SERVER_CONFIG_ERROR` | JWT_SECRET 미설정 | `{ "success": false, "error": "SERVER_CONFIG_ERROR", "message": "Server configuration error" }` |
| `DATABASE_ERROR` | 데이터베이스 오류 | `{ "success": false, "error": "DATABASE_ERROR", "message": "Database error", "code": "..." }` |
| `INTERNAL_SERVER_ERROR` | 기타 서버 오류 | `{ "success": false, "error": "INTERNAL_SERVER_ERROR", "message": "Server error" }` |

---

## HTTP 상태 코드 요약

| 상태 코드 | 의미 | 사용 케이스 |
|---------|------|------------|
| 200 | OK | 로그인 성공, 프로필 조회 성공 |
| 201 | Created | 회원가입 성공 |
| 400 | Bad Request | 입력값 검증 실패 |
| 401 | Unauthorized | 인증 실패 (잘못된 비밀번호, 만료된 토큰) |
| 403 | Forbidden | 인증 정보 없음 (토큰 미제공) |
| 404 | Not Found | 리소스 없음 (사용자 삭제됨) |
| 409 | Conflict | 리소스 충돌 (중복 회원가입) |
| 500 | Internal Server Error | 서버 내부 오류 |

---

## 에러 처리 전략

### 클라이언트 측 권장 처리

1. **`success` 필드 확인**: 모든 응답에서 `success` 필드를 먼저 확인
2. **`error` 코드별 처리**: 각 에러 코드에 따라 적절한 사용자 메시지 표시
3. **재시도 로직**:
   - `DATABASE_ERROR`: 재시도 가능
   - `TOKEN_EXPIRED`: 재로그인 유도
   - `INVALID_TOKEN`: 로그아웃 후 재로그인
4. **사용자 피드백**: `message` 필드를 사용자에게 표시

### 예시: 에러 코드별 처리
```javascript
switch (error.error) {
  case 'TOKEN_EXPIRED':
    // 토큰 갱신 또는 재로그인 유도
    redirectToLogin();
    break;
  case 'USER_ALREADY_EXISTS':
    // 중복 필드 정보를 사용자에게 표시
    showError(`${error.details.field}이(가) 이미 사용 중입니다.`);
    break;
  case 'WEAK_PASSWORD':
    // 비밀번호 강도 요구사항 안내
    showError('비밀번호는 최소 6자 이상이어야 합니다.');
    break;
  default:
    // 일반 에러 메시지
    showError(error.message);
}
```
