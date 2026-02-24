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
  healthStatus?: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'ERROR' | 'UNKNOWN';
  lastConnectedAt?: string | null;
}

interface DatabaseState {
  connections: DatabaseConnection[];
  selectedConnectionId: string | null;
  isLoading: boolean;
  setConnections: (connections: DatabaseConnection[]) => void;
  addConnection: (connection: DatabaseConnection) => void;
  removeConnection: (id: string) => void;
  updateConnectionHealth: (id: string, healthStatus: DatabaseConnection['healthStatus'], version?: string) => void;
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
    const currentSelected = get().selectedConnectionId;
    const isCurrentValid = currentSelected && connections.some((c) => c.id === currentSelected);

    if (isCurrentValid) {
      // 현재 선택이 유효하면 connections만 업데이트 (selectedConnectionId 유지)
      set({ connections });
    } else {
      // 현재 선택이 유효하지 않으면 기본 연결로 대체
      const defaultConnection = connections.find((c) => c.isDefault);
      const validSelectedId = defaultConnection?.id || connections[0]?.id || null;

      set({
        connections,
        selectedConnectionId: validSelectedId,
      });

      if (typeof window !== 'undefined') {
        if (validSelectedId) {
          localStorage.setItem('selected-database-id', validSelectedId);
        } else {
          localStorage.removeItem('selected-database-id');
        }
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
  updateConnectionHealth: (id, healthStatus, version) =>
    set((state) => ({
      connections: state.connections.map((conn) =>
        conn.id === id
          ? { ...conn, healthStatus, ...(version ? { oracleVersion: version } : {}) }
          : conn
      ),
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
