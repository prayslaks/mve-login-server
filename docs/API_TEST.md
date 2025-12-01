# API 테스트 가이드

이 문서는 MVE Login Server API를 테스트하는 다양한 방법을 설명합니다.

---

## 목차
- [PowerShell 테스트](#powershell-테스트)
  - [이메일 중복 확인](#이메일-중복-확인)
  - [인증번호 발송](#인증번호-발송)
  - [인증번호 검증](#인증번호-검증)
  - [회원가입](#회원가입)
  - [로그인](#로그인)
  - [로그아웃](#로그아웃)
  - [회원 탈퇴](#회원-탈퇴)
  - [프로필 조회](#프로필-조회)
- [curl 테스트](#curl-테스트)
- [전체 시나리오 테스트](#전체-시나리오-테스트)

---

## PowerShell 테스트

### 헬스 체크

```powershell
# 방법 1: Invoke-RestMethod (권장)
Invoke-RestMethod -Uri "http://localhost:3000/health/login"
```

```powershell
# 방법 2: Invoke-WebRequest (상세 정보 필요 시)
$response = Invoke-WebRequest -Uri "http://localhost:3000/health/login"
$response.Content | ConvertFrom-Json
$response.StatusCode
```

---

### 이메일 중복 확인

```powershell
$body = @{
    email = "test@example.com"
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/check-email" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body

    if ($result.success) {
        if ($result.exists) {
            Write-Host "이메일이 이미 사용 중입니다." -ForegroundColor Yellow
        } else {
            Write-Host "사용 가능한 이메일입니다." -ForegroundColor Green
        }
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"
    }
}
```

---

### 인증번호 발송

```powershell
$body = @{
    email = "test@example.com"
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/send-verification" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body

    if ($result.success) {
        Write-Host "인증번호가 이메일로 전송되었습니다!" -ForegroundColor Green
        Write-Host "유효시간: $($result.expiresIn)초"
        Write-Host "이메일을 확인하여 6자리 인증번호를 입력하세요."
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"

        # Rate limiting 에러인 경우
        if ($errorBody.error -eq "TOO_MANY_REQUESTS") {
            Write-Host "다시 시도까지 남은 시간: $($errorBody.retryAfter)초" -ForegroundColor Yellow
        }
    }
}
```

---

### 인증번호 검증

```powershell
$body = @{
    email = "test@example.com"
    code = "123456"  # 이메일로 받은 6자리 인증번호
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/verify-code" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body

    if ($result.success) {
        Write-Host "이메일 인증 성공!" -ForegroundColor Green
        Write-Host $result.message
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"

        # 잘못된 인증번호인 경우 남은 시도 횟수 표시
        if ($errorBody.error -eq "INVALID_CODE" -and $errorBody.attemptsRemaining) {
            Write-Host "남은 시도 횟수: $($errorBody.attemptsRemaining)" -ForegroundColor Yellow
        }
    }
}
```

---

### 회원가입

#### 요청 본문 작성

```powershell
# JSON 해시테이블 방식 (권장)
$body = @{
    username = "testuser"
    email = "test@example.com"
    password = "password123"
} | ConvertTo-Json

# 또는 Here-String 방식
$body = @"
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123"
}
"@
```

#### Invoke-RestMethod 사용 (권장)

```powershell
try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/signup" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body

    # 성공
    if ($result.success) {
        Write-Host "회원가입 성공!" -ForegroundColor Green
        Write-Host "User ID: $($result.user.id)"
        Write-Host "Username: $($result.user.username)"
        Write-Host "Email: $($result.user.email)"
    }
} catch {
    # 에러 처리
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"

        if ($errorBody.details) {
            Write-Host "Details:"
            $errorBody.details | ConvertTo-Json
        }
    }
}
```

#### Invoke-WebRequest 사용 (상세 정보 필요 시)

```powershell
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/signup" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body

    # 성공
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    $result = $response.Content | ConvertFrom-Json

    if ($result.success) {
        Write-Host "회원가입 성공!"
        $result.user | Format-List
    }
} catch {
    # 에러 처리
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)"
        Write-Host "Message: $($errorBody.message)"

        if ($errorBody.details) {
            $errorBody.details | Format-List
        }
    }
}
```

---

### 로그인

#### 요청 본문 작성

```powershell
$body = @{
    username = "testuser"
    password = "password123"
} | ConvertTo-Json
```

#### Invoke-RestMethod 사용 (권장)

```powershell
try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body

    # 성공
    if ($result.success) {
        Write-Host "로그인 성공!" -ForegroundColor Green

        # 토큰 저장
        $token = $result.token
        Write-Host "Token: $token"

        # 사용자 정보
        Write-Host "`nUser Info:"
        $result.user | Format-List
    }
} catch {
    # 에러 처리
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"
    }
}
```

#### Invoke-WebRequest 사용

```powershell
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body

    # 성공
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    $result = $response.Content | ConvertFrom-Json

    if ($result.success) {
        Write-Host "로그인 성공!"
        $token = $result.token
        Write-Host "Token: $token"
    }
} catch {
    # 에러 처리
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)"
        Write-Host "Message: $($errorBody.message)"
    }
}
```

---

### 로그아웃

```powershell
# 먼저 로그인해서 토큰 받기
$token = $loginResult.token

$headers = @{
    "Authorization" = "Bearer $token"
}

try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/logout" `
        -Method POST `
        -Headers $headers

    if ($result.success) {
        Write-Host "로그아웃 성공!" -ForegroundColor Green
        Write-Host $result.message
        # 클라이언트에서 토큰 삭제
        $token = $null
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"
    }
}
```

---

### 회원 탈퇴

```powershell
# 먼저 로그인해서 토큰 받기
$token = $loginResult.token

$headers = @{
    "Authorization" = "Bearer $token"
}

$body = @{
    password = "current_password"
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/withdraw" `
        -Method DELETE `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $body

    if ($result.success) {
        Write-Host "회원 탈퇴 성공!" -ForegroundColor Green
        Write-Host $result.message
        # 토큰 삭제
        $token = $null
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"
    }
}
```

---

### 프로필 조회

#### Authorization 헤더 설정

```powershell
# 먼저 로그인해서 토큰 받기 (위 로그인 섹션 참고)
$token = $loginResult.token

# 헤더 설정
$headers = @{
    "Authorization" = "Bearer $token"
}
```

#### Invoke-RestMethod 사용 (권장)

```powershell
try {
    $profile = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/profile" `
        -Method GET `
        -Headers $headers

    # 성공
    if ($profile.success) {
        Write-Host "프로필 조회 성공!" -ForegroundColor Green
        $profile.user | Format-List
    }
} catch {
    # 에러 처리
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"
    }
}
```

#### Invoke-WebRequest 사용

```powershell
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/profile" `
        -Method GET `
        -Headers $headers

    # 성공
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    $result = $response.Content | ConvertFrom-Json

    if ($result.success) {
        Write-Host "프로필 조회 성공!"
        $result.user | Format-List
    }
} catch {
    # 에러 처리
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)"
        Write-Host "Message: $($errorBody.message)"
    }
}
```

---

## curl 테스트

### 헬스 체크

```bash
curl http://localhost:3000/health/login
```

### 이메일 중복 확인

```bash
curl -X POST http://localhost:3000/api/auth/check-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

### 인증번호 발송

```bash
curl -X POST http://localhost:3000/api/auth/send-verification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

### 인증번호 검증

```bash
curl -X POST http://localhost:3000/api/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "123456"
  }'
```

### 회원가입

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 로그인

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123"
  }'
```

### 프로필 조회

```bash
# 토큰을 변수에 저장
TOKEN="your_jwt_token_here"

curl -X GET http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer $TOKEN"
```

### 로그아웃

```bash
TOKEN="your_jwt_token_here"

curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

### 회원 탈퇴

```bash
TOKEN="your_jwt_token_here"

curl -X DELETE http://localhost:3000/api/auth/withdraw \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "current_password"
  }'
```

---

## 전체 시나리오 테스트

### PowerShell 통합 테스트 스크립트

```powershell
# 서버 URL 설정
$baseUrl = "http://localhost:3000"

Write-Host "=== MVE Login Server 통합 테스트 ===" -ForegroundColor Cyan

# 1. 헬스 체크
Write-Host "`n[1] 헬스 체크..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health/login"
    Write-Host "✓ 서버 정상 작동: $($health.status)" -ForegroundColor Green
    Write-Host "  Redis: $($health.redis)" -ForegroundColor Gray
} catch {
    Write-Host "✗ 서버 연결 실패" -ForegroundColor Red
    exit
}

# 2. 이메일 중복 확인
Write-Host "`n[2] 이메일 중복 확인..." -ForegroundColor Yellow
$testEmail = "test_$(Get-Random -Minimum 1000 -Maximum 9999)@example.com"
$checkEmailBody = @{
    email = $testEmail
} | ConvertTo-Json

try {
    $emailCheck = Invoke-RestMethod -Uri "$baseUrl/api/auth/check-email" `
        -Method POST `
        -ContentType "application/json" `
        -Body $checkEmailBody

    if ($emailCheck.success -and -not $emailCheck.exists) {
        Write-Host "✓ 사용 가능한 이메일: $testEmail" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ 이메일 확인 실패" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $error = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "  Error: $($error.error)"
    }
    exit
}

# 3. 인증번호 발송 (선택사항 - 실제 이메일 발송이 설정된 경우에만)
Write-Host "`n[3] 인증번호 발송 테스트 (선택사항)..." -ForegroundColor Yellow
Write-Host "  이메일 인증 테스트를 건너뜁니다. (수동 테스트 권장)" -ForegroundColor Gray
# 실제 이메일로 테스트하려면 아래 주석 해제:
# try {
#     $verifyBody = @{ email = $testEmail } | ConvertTo-Json
#     $verifyResult = Invoke-RestMethod -Uri "$baseUrl/api/auth/send-verification" `
#         -Method POST `
#         -ContentType "application/json" `
#         -Body $verifyBody
#     Write-Host "✓ 인증번호 발송 성공 (유효시간: $($verifyResult.expiresIn)초)" -ForegroundColor Green
#
#     # 인증번호 입력 받기
#     $code = Read-Host "  이메일로 받은 6자리 인증번호를 입력하세요"
#     $codeBody = @{ email = $testEmail; code = $code } | ConvertTo-Json
#     $codeResult = Invoke-RestMethod -Uri "$baseUrl/api/auth/verify-code" `
#         -Method POST `
#         -ContentType "application/json" `
#         -Body $codeBody
#     Write-Host "✓ 이메일 인증 성공" -ForegroundColor Green
# } catch {
#     Write-Host "✗ 이메일 인증 실패" -ForegroundColor Red
# }

# 4. 회원가입
Write-Host "`n[4] 회원가입 테스트..." -ForegroundColor Yellow
$signupBody = @{
    username = "testuser_$(Get-Random -Minimum 1000 -Maximum 9999)"
    email = $testEmail
    password = "password123"
} | ConvertTo-Json

try {
    $signupResult = Invoke-RestMethod -Uri "$baseUrl/api/auth/signup" `
        -Method POST `
        -ContentType "application/json" `
        -Body $signupBody

    if ($signupResult.success) {
        Write-Host "✓ 회원가입 성공" -ForegroundColor Green
        Write-Host "  User ID: $($signupResult.user.id)"
        Write-Host "  Username: $($signupResult.user.username)"
        $testUsername = $signupResult.user.username
    }
} catch {
    Write-Host "✗ 회원가입 실패" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $error = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "  Error: $($error.error)"
    }
    exit
}

# 5. 로그인
Write-Host "`n[5] 로그인 테스트..." -ForegroundColor Yellow
$loginBody = @{
    username = $testUsername
    password = "password123"
} | ConvertTo-Json

try {
    $loginResult = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody

    if ($loginResult.success) {
        Write-Host "✓ 로그인 성공" -ForegroundColor Green
        $token = $loginResult.token
        Write-Host "  Token 길이: $($token.Length) 문자"
    }
} catch {
    Write-Host "✗ 로그인 실패" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $error = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "  Error: $($error.error)"
    }
    exit
}

# 6. 프로필 조회
Write-Host "`n[6] 프로필 조회 테스트..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
}

try {
    $profile = Invoke-RestMethod -Uri "$baseUrl/api/auth/profile" `
        -Method GET `
        -Headers $headers

    if ($profile.success) {
        Write-Host "✓ 프로필 조회 성공" -ForegroundColor Green
        Write-Host "  Username: $($profile.user.username)"
        Write-Host "  Email: $($profile.user.email)"
        Write-Host "  Created: $($profile.user.created_at)"
    }
} catch {
    Write-Host "✗ 프로필 조회 실패" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $error = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "  Error: $($error.error)"
    }
}

# 5. 잘못된 토큰 테스트
Write-Host "`n[5] 잘못된 토큰 테스트..." -ForegroundColor Yellow
$invalidHeaders = @{
    "Authorization" = "Bearer invalid_token_here"
}

try {
    $invalidProfile = Invoke-RestMethod -Uri "$baseUrl/api/auth/profile" `
        -Method GET `
        -Headers $invalidHeaders
} catch {
    if ($_.ErrorDetails.Message) {
        $error = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($error.error -eq "INVALID_TOKEN") {
            Write-Host "✓ 잘못된 토큰 거부 성공" -ForegroundColor Green
        }
    }
}

Write-Host "`n=== 테스트 완료 ===" -ForegroundColor Cyan
```

---

## 에러 시나리오 테스트

### 1. 필수 필드 누락 테스트

```powershell
# username 없이 회원가입 시도
$body = @{
    email = "test@example.com"
    password = "password123"
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "http://localhost:3000/api/auth/signup" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body
} catch {
    $error = $_.ErrorDetails.Message | ConvertFrom-Json
    # 예상: error = "MISSING_FIELDS"
    Write-Host "Error Code: $($error.error)"
    Write-Host "Details: $($error.details | ConvertTo-Json)"
}
```

### 2. 중복 사용자 테스트

```powershell
# 같은 사용자로 두 번 회원가입 시도
$body = @{
    username = "duplicateuser"
    email = "duplicate@example.com"
    password = "password123"
} | ConvertTo-Json

# 첫 번째 시도 (성공 예상)
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/signup" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

# 두 번째 시도 (실패 예상)
try {
    Invoke-RestMethod -Uri "http://localhost:3000/api/auth/signup" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body
} catch {
    $error = $_.ErrorDetails.Message | ConvertFrom-Json
    # 예상: error = "USER_ALREADY_EXISTS"
    Write-Host "Error Code: $($error.error)"
    Write-Host "Duplicate Field: $($error.details.field)"
}
```

### 3. 약한 비밀번호 테스트

```powershell
$body = @{
    username = "testuser"
    email = "test@example.com"
    password = "12345"  # 6자 미만
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "http://localhost:3000/api/auth/signup" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body
} catch {
    $error = $_.ErrorDetails.Message | ConvertFrom-Json
    # 예상: error = "WEAK_PASSWORD"
    Write-Host "Error Code: $($error.error)"
}
```

### 4. 잘못된 이메일 형식 테스트

```powershell
$body = @{
    username = "testuser"
    email = "invalid-email"  # @ 없음
    password = "password123"
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "http://localhost:3000/api/auth/signup" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body
} catch {
    $error = $_.ErrorDetails.Message | ConvertFrom-Json
    # 예상: error = "INVALID_EMAIL_FORMAT"
    Write-Host "Error Code: $($error.error)"
}
```

### 5. 잘못된 비밀번호로 로그인 테스트

```powershell
$body = @{
    username = "testuser"
    password = "wrongpassword"
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body
} catch {
    $error = $_.ErrorDetails.Message | ConvertFrom-Json
    # 예상: error = "INVALID_PASSWORD"
    Write-Host "Error Code: $($error.error)"
}
```

---

## 디버깅 팁

### 상세한 에러 정보 출력

```powershell
try {
    # API 요청
} catch {
    Write-Host "=== 전체 에러 정보 ===" -ForegroundColor Red

    # HTTP 상태 코드
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode"

    # 에러 메시지
    Write-Host "Exception Message: $($_.Exception.Message)"

    # 응답 본문
    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "`nResponse Body:"
        $errorBody | ConvertTo-Json -Depth 10
    }

    # 스택 트레이스
    Write-Host "`nStack Trace:"
    $_.ScriptStackTrace
}
```

### 요청/응답 로깅

```powershell
# 요청 본문 출력
Write-Host "Request Body:" -ForegroundColor Cyan
$body | ConvertFrom-Json | ConvertTo-Json -Depth 10

# 요청 헤더 출력
Write-Host "`nRequest Headers:" -ForegroundColor Cyan
$headers | Format-Table

# 응답 출력
Write-Host "`nResponse:" -ForegroundColor Cyan
$result | ConvertTo-Json -Depth 10
```

---

## 참고 문서

- [API_RESPONSES.md](./API_RESPONSES.md) - 전체 API 응답 형식 및 오류 코드
- [README.md](./README.md) - 프로젝트 설치 및 실행 가이드
