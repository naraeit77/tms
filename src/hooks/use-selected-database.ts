'use client';

import { useDatabaseStore } from '@/lib/stores/database-store';

/**
 * Custom hook to get the selected database connection
 * Returns the selected connection ID and connection object
 */
export function useSelectedDatabase() {
  const { selectedConnectionId, connections, getSelectedConnection } = useDatabaseStore();

  return {
    selectedConnectionId,
    selectedConnection: getSelectedConnection(),
    connections,
  };
}
