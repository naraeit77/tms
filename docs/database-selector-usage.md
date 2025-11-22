# Database Selector Usage Guide

## Overview

The application now has a global database selector in the header that allows users to select which Oracle database connection they want to work with. All pages should respect this global selection.

## Implementation

### 1. Using the `useSelectedDatabase` Hook

The easiest way to use the selected database in your pages is to use the `useSelectedDatabase` hook:

```tsx
import { useSelectedDatabase } from '@/hooks/use-selected-database';

export default function YourPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();

  // Use selectedConnectionId in your API calls
  // Use selectedConnection to display connection info
}
```

### 2. Example: Top SQL Page

Here's how the Top SQL page was updated to use the global database selector:

```tsx
import { useSelectedDatabase } from '@/hooks/use-selected-database';

export default function TopSQLPage() {
  const { selectedConnectionId, selectedConnection: globalConnection } = useSelectedDatabase();

  // Use the global selected connection ID or 'all'
  const effectiveConnectionId = selectedConnectionId || 'all';

  // Show connection info in the header
  return (
    <div>
      <h1>Top SQL 분석</h1>
      {globalConnection && (
        <p>
          연결: {globalConnection.name} ({globalConnection.host}:{globalConnection.port})
        </p>
      )}

      {/* Rest of your page */}
    </div>
  );
}
```

### 3. API Calls with Selected Connection

When making API calls, include the selected connection ID:

```tsx
const { data } = useQuery({
  queryKey: ['your-data', effectiveConnectionId],
  queryFn: async () => {
    const params = new URLSearchParams();

    if (effectiveConnectionId !== 'all') {
      params.append('connection_id', effectiveConnectionId);
    }

    const res = await fetch(`/api/your-endpoint?${params}`);
    if (!res.ok) throw new Error('Failed to fetch data');
    return res.json();
  },
});
```

### 4. Features

The database selector provides:

- **Global State Management**: Uses Zustand for state management
- **Persistence**: Selected database is saved to localStorage
- **Connection Info**: Shows detailed connection information (host, port, status, etc.)
- **Health Status**: Displays health status badges (HEALTHY, DEGRADED, UNHEALTHY)
- **Refresh**: Ability to refresh the connection list
- **Auto-sync**: Automatically syncs with all pages

### 5. Migration Guide

To migrate an existing page to use the global database selector:

1. **Import the hook**:
   ```tsx
   import { useSelectedDatabase } from '@/hooks/use-selected-database';
   ```

2. **Remove local connection state** (if any):
   ```tsx
   // Remove this:
   // const [selectedConnection, setSelectedConnection] = useState<string>('all');
   ```

3. **Use the hook**:
   ```tsx
   const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
   const effectiveConnectionId = selectedConnectionId || 'all';
   ```

4. **Update API calls**:
   - Replace local `selectedConnection` with `effectiveConnectionId`

5. **Remove DB selector UI** (if any):
   - Remove dropdown for selecting database
   - Optionally show current connection info instead

6. **Update button conditions**:
   ```tsx
   // Update from:
   // disabled={selectedConnection === 'all'}
   // To:
   disabled={effectiveConnectionId === 'all'}
   ```

### 6. Available Properties

```typescript
interface UseSelectedDatabase {
  selectedConnectionId: string | null;      // The ID of the selected connection
  selectedConnection: DatabaseConnection | null;  // Full connection object
  connections: DatabaseConnection[];        // All available connections
}

interface DatabaseConnection {
  id: string;
  name: string;
  description?: string | null;
  host: string;
  port: number;
  serviceName?: string | null;
  sid?: string | null;
  username: string;
  connectionType: 'SERVICE_NAME' | 'SID';
  oracleVersion?: string | null;
  isActive: boolean;
  isDefault: boolean;
  healthStatus?: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
  lastConnectedAt?: string | null;
}
```

## Best Practices

1. **Always use the hook**: Don't access the Zustand store directly
2. **Handle 'all' case**: Some operations may not support 'all' connections
3. **Show connection info**: Display current connection info to the user
4. **Update query keys**: Include connection ID in React Query keys for proper caching
5. **Guide users**: If connection is required but not selected, show a helpful message

## Example Pages

- [Top SQL Page](../src/app/(dashboard)/monitoring/top-sql/page.tsx) - Complete example of database selector integration
