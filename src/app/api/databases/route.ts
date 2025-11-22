import { NextRequest, NextResponse } from 'next/server';
import { createClient, createPureClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Check authentication first
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Use pure client to bypass RLS for server-side operations
    const pureSupabase = await createPureClient();

    // Get all active database connections (RLS policy allows anyone to view active connections)
    const { data: databases, error: dbError } = await pureSupabase
      .from('oracle_connections')
      .select('id, name, host, port, service_name, sid, username, oracle_version, is_active, health_status, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (dbError) {
      console.error('Failed to fetch databases:', dbError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch databases' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: databases || []
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
