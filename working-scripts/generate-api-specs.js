#!/usr/bin/env node

/**
 * API 문서 자동 생성 스크립트
 *
 * 이 스크립트는 routes/*.js 파일의 Swagger 주석을 읽어
 * OpenAPI 3.0 스펙 JSON 파일(api-spec.json)을 생성합니다.
 *
 * 사용법: npm run docs
 */

const swaggerJsdoc = require('swagger-jsdoc');
const fs = require('fs');
const path = require('path');

console.log('API 문서 생성 시작...\n');

// Swagger JSDoc 옵션
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MVE Login Server API',
      version: '1.0.0',
      description: `
MVE (Meta Virtual Environment) Login Server API

이 API는 사용자 인증 기능을 제공합니다:
- 회원가입 (이메일 인증)
- 로그인 (JWT 토큰 발급)
- 프로필 조회
- 이메일 인증번호 발송 및 검증

**토큰 발급**: 로그인 성공 시 JWT 토큰이 발급됩니다.
**토큰 사용**: Resource Server API 호출 시 Authorization 헤더에 포함하세요.
      `.trim(),
      contact: {
        name: 'MVE Development Team',
        url: 'https://github.com/prayslaks'
      },
      license: {
        name: 'ISC',
        url: 'https://opensource.org/licenses/ISC'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: '로컬 개발 서버'
      },
      {
        url: 'http://your-ec2-public-ip',
        description: 'AWS EC2 프로덕션 서버 (HTTP)'
      },
      {
        url: 'https://your-domain.com',
        description: 'AWS EC2 프로덕션 서버 (HTTPS)'
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: '사용자 인증 및 회원가입 API'
      },
      {
        name: 'Email Verification',
        description: '이메일 인증번호 발송 및 검증 API'
      },
      {
        name: 'User Profile',
        description: '사용자 프로필 관리 API (JWT 인증 필요)'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'MVE Login Server에서 발급받은 JWT 토큰을 입력하세요.'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  // routes 폴더의 모든 JavaScript 파일에서 주석 추출
  apis: [
    path.join(__dirname, '../routes/*.js'),
    path.join(__dirname, '../middleware/*.js')
  ]
};

try {
  // OpenAPI 스펙 생성
  console.log('🔍 라우트 파일 스캔 중...');
  const spec = swaggerJsdoc(options);

  // outputs 폴더 생성 (없으면)
  const outputDir = path.join(__dirname, 'outputs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // JSON 파일로 저장
  const outputPath = path.join(outputDir, 'api-spec.json');
  fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2), 'utf8');

  console.log('API 문서 생성 완료!');
  console.log(`파일 위치: ${outputPath}`);
  console.log(`총 엔드포인트: ${Object.keys(spec.paths || {}).length}개\n`);

  // 생성된 엔드포인트 목록 출력
  if (spec.paths) {
    console.log('생성된 API 엔드포인트:');
    Object.keys(spec.paths).sort().forEach(path => {
      const methods = Object.keys(spec.paths[path]).filter(m => m !== 'parameters');
      methods.forEach(method => {
        const endpoint = spec.paths[path][method];
        console.log(`  ${method.toUpperCase().padEnd(7)} ${path.padEnd(40)} - ${endpoint.summary || '(설명 없음)'}`);
      });
    });
  }

  console.log('\n다음 명령으로 Swagger UI에서 확인할 수 있습니다:');
  console.log('   npm start');
  console.log('   브라우저에서 http://localhost:3001/api-docs 접속\n');

} catch (error) {
  console.error('API 문서 생성 실패:', error.message);
  console.error(error.stack);
  process.exit(1);
}
