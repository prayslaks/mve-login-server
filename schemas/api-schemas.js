/**
 * OpenAPI 스키마 정의 파일
 *
 * 이 파일은 MVE Login Server의 모든 API 스키마를 단일 소스로 관리합니다.
 * generate-api-specs.js에서 이 파일을 import하여 사용합니다.
 *
 * ⚠️ 중요: routes/*.js 파일에는 스키마를 정의하지 마세요!
 * 모든 스키마 정의는 이 파일에서만 수정하세요.
 */

module.exports = {
  // ============================================
  // 사용자 관련 스키마
  // ============================================
  User: {
    type: 'object',
    description: '사용자 정보',
    properties: {
      id: {
        type: 'integer',
        description: '사용자 ID',
        example: 1
      },
      email: {
        type: 'string',
        format: 'email',
        description: '사용자 이메일',
        example: 'test@example.com'
      },
      created_at: {
        type: 'string',
        format: 'date-time',
        description: '계정 생성 시간',
        example: '2024-01-01T00:00:00.000Z'
      }
    }
  },

  // ============================================
  // 공통 응답 스키마
  // ============================================
  SuccessResponse: {
    type: 'object',
    description: '기본 성공 응답',
    required: ['success', 'code', 'message'],
    properties: {
      success: {
        type: 'boolean',
        description: '요청 성공 여부',
        example: true
      },
      code: {
        type: 'string',
        description: '응답 코드',
        example: 'SUCCESS'
      },
      message: {
        type: 'string',
        description: '응답 메시지',
        example: 'Operation successful'
      }
    }
  },

  ErrorResponse: {
    type: 'object',
    description: '에러 응답',
    required: ['success', 'code', 'message'],
    properties: {
      success: {
        type: 'boolean',
        description: '요청 성공 여부',
        example: false
      },
      code: {
        type: 'string',
        description: '에러 코드',
        example: 'ERROR_CODE'
      },
      message: {
        type: 'string',
        description: '에러 메시지',
        example: 'Error description'
      },
      details: {
        type: 'object',
        description: '추가 에러 상세 정보 (선택)',
        nullable: true,
        additionalProperties: true
      },
      dbCode: {
        type: 'string',
        description: 'DB 에러 코드 (DB 에러인 경우)',
        nullable: true,
        example: '23505'
      }
    }
  },

  // ============================================
  // 이메일 인증 관련 스키마
  // ============================================
  EmailCheckResponse: {
    type: 'object',
    description: '이메일 중복 확인 응답',
    allOf: [
      { $ref: '#/components/schemas/SuccessResponse' }
    ],
    properties: {
      exists: {
        type: 'boolean',
        description: '이메일 사용 중 여부',
        example: false
      }
    }
  },

  VerificationCodeResponse: {
    type: 'object',
    description: '인증번호 발송 응답',
    allOf: [
      { $ref: '#/components/schemas/SuccessResponse' }
    ],
    properties: {
      expiresIn: {
        type: 'integer',
        description: '유효 시간 (초)',
        example: 300
      }
    }
  },

  RateLimitErrorResponse: {
    type: 'object',
    description: 'Rate Limit 에러 응답',
    allOf: [
      { $ref: '#/components/schemas/ErrorResponse' }
    ],
    properties: {
      retryAfter: {
        type: 'integer',
        description: '재시도 가능 시간 (초)',
        example: 60
      }
    }
  },

  VerifyCodeErrorResponse: {
    type: 'object',
    description: '인증번호 검증 실패 응답',
    allOf: [
      { $ref: '#/components/schemas/ErrorResponse' }
    ],
    properties: {
      attemptsRemaining: {
        type: 'integer',
        description: '남은 시도 횟수',
        example: 4
      }
    }
  },

  // ============================================
  // 회원가입/로그인 응답 스키마
  // ============================================
  SignupResponse: {
    type: 'object',
    description: '회원가입 성공 응답',
    allOf: [
      { $ref: '#/components/schemas/SuccessResponse' }
    ],
    properties: {
      user: {
        $ref: '#/components/schemas/User'
      }
    }
  },

  LoginResponse: {
    type: 'object',
    description: '로그인 성공 응답',
    required: ['success', 'code', 'message', 'token', 'user'],
    properties: {
      success: {
        type: 'boolean',
        example: true
      },
      code: {
        type: 'string',
        example: 'LOGIN_SUCCESS'
      },
      message: {
        type: 'string',
        example: 'Login successful'
      },
      token: {
        type: 'string',
        description: 'JWT 인증 토큰',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
      },
      user: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            example: 1
          },
          email: {
            type: 'string',
            example: 'test@example.com'
          }
        }
      }
    }
  },

  ProfileResponse: {
    type: 'object',
    description: '프로필 조회 응답',
    allOf: [
      { $ref: '#/components/schemas/SuccessResponse' }
    ],
    properties: {
      user: {
        $ref: '#/components/schemas/User'
      }
    }
  }
};
