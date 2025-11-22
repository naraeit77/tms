import { createPureClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import type { OracleConnectionConfig } from './types';

/**
 * Oracle 연결 설정을 가져오는 함수
 * @param connectionId - Oracle 연결 ID
 * @returns Oracle 연결 설정
 */
export async function getOracleConfig(connectionId: string): Promise<OracleConnectionConfig> {
  const supabase = await createPureClient();

  // Oracle 연결 정보 조회
  const { data: connection, error } = await supabase
    .from('oracle_connections')
    .select('*')
    .eq('id', connectionId)
    .single();

  if (error || !connection) {
    throw new Error(`Oracle connection not found: ${connectionId}`);
  }

  // 비밀번호 복호화 (컬럼명: password_encrypted)
  const decryptedPassword = decrypt(connection.password_encrypted);

  // Oracle 연결 설정 생성
  const config: OracleConnectionConfig = {
    id: connection.id,
    name: connection.name,
    host: connection.host,
    port: connection.port,
    username: connection.username,
    password: decryptedPassword,
    serviceName: connection.service_name,
    sid: connection.sid,
    connectionType: connection.connection_type || 'SERVICE_NAME',
  };

  return config;
}

/**
 * SQL 텍스트를 문자열로 변환
 */
export function convertSqlText(sqlText: any): string {
  if (!sqlText) return '';

  if (typeof sqlText === 'string') {
    return sqlText;
  }

  if (Buffer.isBuffer(sqlText)) {
    return sqlText.toString('utf-8');
  }

  if (sqlText.toString) {
    return sqlText.toString();
  }

  return String(sqlText);
}

/**
 * 숫자 값을 안전하게 변환
 */
export function safeNumber(value: any, defaultValue: number = 0): number {
  const num = Number(value);
  return isNaN(num) ? defaultValue : Math.floor(num);
}