import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPureClient } from '@/lib/supabase/server';

/**
 * GET /api/settings
 * 시스템 설정 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createPureClient();

    // 사용자 ID 가져오기 (session.user.id 사용)
    const userId = session.user.id;

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Failed to fetch settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch settings' },
        { status: 500 }
      );
    }

    // 설정이 없으면 기본값 반환
    if (!data) {
      const defaultSettings = {
        monitoring_interval_seconds: 60,
        sql_retention_days: 30,
        alert_enabled: true,
        alert_email: session.user.email,
        performance_threshold_ms: 1000,
        buffer_gets_threshold: 10000,
        cpu_time_threshold_ms: 5000,
        auto_tuning_enabled: false,
      };

      return NextResponse.json({
        success: true,
        data: defaultSettings,
      });
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings
 * 시스템 설정 업데이트
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const supabase = await createPureClient();

    // 사용자 ID 가져오기 (session.user.id 사용)
    const userId = session.user.id;

    // 기존 설정 확인
    const { data: existing } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    let result;
    if (existing) {
      // 기존 설정 업데이트
      const { data, error } = await supabase
        .from('user_settings')
        .update(body)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('Failed to update settings:', error);
        return NextResponse.json(
          { error: 'Failed to update settings' },
          { status: 500 }
        );
      }
      result = data;
    } else {
      // 새 설정 생성
      const { data, error } = await supabase
        .from('user_settings')
        .insert([{ ...body, user_id: userId }])
        .select()
        .single();

      if (error) {
        console.error('Failed to create settings:', error);
        return NextResponse.json(
          { error: 'Failed to create settings' },
          { status: 500 }
        );
      }
      result = data;
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
