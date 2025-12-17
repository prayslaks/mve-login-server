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
    required: ['id', 'email', 'created_at'],
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
  }

  // ============================================
  // 주의: API 엔드포인트별 응답 스키마는 routes/*.js에 인라인으로 정의됩니다.
  // 이 파일에는 재사용 가능한 Component Schema만 정의하세요.
  //
  // Resource Server와 동일한 설계 패턴:
  // - Component Schema: 여기에 정의 (User, SuccessResponse, ErrorResponse 등)
  // - Response Schema: routes/*.js에 인라인으로 정의
  // ============================================
};
