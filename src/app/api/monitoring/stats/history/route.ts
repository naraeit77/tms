/**
 * Statistics Collection History API
 * 통계 수집 이력 조회
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');

    if (!connectionId || connectionId === 'all') {
      return NextResponse.json({ error: 'Connection ID required' }, { status: 400 });
    }

    // Verify connection ownership
    const { data: connection, error: connError } = await supabase
      .from('oracle_connections')
      .select('id')
      .eq('id', connectionId)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // Get history records
    const { data: history, error: historyError } = await supabase
      .from('stats_collection_history')
      .select('*')
      .eq('oracle_connection_id', connectionId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (historyError) {
      throw historyError;
    }

    return NextResponse.json({ data: history || [] });
  } catch (error: any) {
    console.error('Error fetching statistics history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics history', details: error.message },
      { status: 500 }
    );
  }
}
