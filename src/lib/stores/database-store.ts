'use client';

import { create } from 'zustand';

export interface DatabaseConnection {
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
  oracleEdition?: string | null;
  isActive: boolean;
  isDefault: boolean;
  healthStatus?: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
  lastConnectedAt?: string | null;
}

interface DatabaseState {
  connections: DatabaseConnection[];
  selectedConnectionId: string | null;
  isLoading: boolean;
  setConnections: (connections: DatabaseConnection[]) => void;
  addConnection: (connection: DatabaseConnection) => void;
  removeConnection: (id: string) => void;
  selectConnection: (id: string) => void;
  getSelectedConnection: () => DatabaseConnection | null;
  getSelectedConnectionId: () => string | null;
  setLoading: (loading: boolean) => void;
}

export const useDatabaseStore = create<DatabaseState>((set, get) => ({
  connections: [],
  selectedConnectionId: null,
  isLoading: false,
  setConnections: (connections) => {
    const defaultConnection = connections.find((c) => c.isDefault);
    const currentSelected = get().selectedConnectionId;

    set({
      connections,
      selectedConnectionId: currentSelected || defaultConnection?.id || connections[0]?.id || null,
    });

    if (typeof window !== 'undefined') {
      const selectedId = currentSelected || defaultConnection?.id || connections[0]?.id || null;
      if (selectedId) {
        localStorage.setItem('selected-database-id', selectedId);
      }
    }
  },
  addConnection: (connection) =>
    set((state) => ({
      connections: [...state.connections, connection],
    })),
  removeConnection: (id) =>
    set((state) => ({
      connections: state.connections.filter((conn) => conn.id !== id),
      selectedConnectionId:
        state.selectedConnectionId === id ? state.connections[0]?.id || null : state.selectedConnectionId,
    })),
  selectConnection: (id) => {
    set({
      selectedConnectionId: id,
    });

    if (typeof window !== 'undefined') {
      localStorage.setItem('selected-database-id', id);
    }
  },
  getSelectedConnection: () => {
    const state = get();
    return state.connections.find((conn) => conn.id === state.selectedConnectionId) || null;
  },
  getSelectedConnectionId: () => {
    return get().selectedConnectionId;
  },
  setLoading: (loading) =>
    set({
      isLoading: loading,
    }),
}));
