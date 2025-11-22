/**
 * Oracle Connection Management API
 * DELETE: 특정 연결 삭제
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPureClient } from '@/lib/supabase/server';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    console.log('[DELETE] Session:', session?.user?.email);

    if (!session?.user?.email) {
      console.error('[DELETE] Unauthorized - No session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    console.log('[DELETE] Deleting connection:', id);

    if (!id) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    const supabase = await createPureClient();

    // 연결 정보 조회
    const { data: connection, error: fetchError } = await supabase
      .from('oracle_connections')
      .select('id, name')
      .eq('id', id)
      .single();

    if (fetchError || !connection) {
      console.error('[DELETE] Connection not found:', id);
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    console.log('[DELETE] Found connection:', connection.name);

    // 연결 삭제
    const { error: deleteError } = await supabase
      .from('oracle_connections')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting connection:', deleteError);
      return NextResponse.json({ error: 'Failed to delete connection' }, { status: 500 });
    }

    // 감사 로그 기록
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (userProfile) {
      await supabase.from('audit_logs').insert({
        user_id: userProfile.id,
        action: 'DELETE',
        resource_type: 'oracle_connection',
        resource_id: id,
        details: {
          name: connection.name,
        },
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
