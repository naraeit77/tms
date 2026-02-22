'use client';

/**
 * SQL Editor Page
 * SQL 쿼리 작성 및 실행을 위한 통합 에디터
 * UI inspired by freesql.com
 * Supports standalone popup window mode
 */

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Play,
  Save,
  FileText,
  Download,
  Upload,
  ChevronRight,
  ChevronDown,
  Database,
  Table as TableIcon,
  Columns,
  RefreshCw,
  Search,
  Clock,
  Info,
  Eye,
  Loader2,
  Trash2,
  FolderOpen,
  Share2,
  AlignJustify,
  Copy,
  Edit,
  Filter,
  Plus,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDatabaseStore } from '@/lib/stores/database-store';
import StandaloneLayout from './standalone-layout';

// Type definitions
interface Schema {
  SCHEMA_NAME: string;
  CREATED: Date;
}

interface DatabaseObject {
  OBJECT_NAME: string;
  OBJECT_TYPE: string;
  STATUS?: string;
  COMMENTS?: string;
  NUM_ROWS?: number;
  TABLESPACE_NAME?: string;
  LAST_ANALYZED?: Date;
}

interface Column {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  DATA_LENGTH: number;
  DATA_PRECISION: number;
  DATA_SCALE: number;
  NULLABLE: string;
  COLUMN_ID: number;
  COMMENTS: string;
  IS_PRIMARY_KEY: string;
}

interface OracleConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  service_name?: string;
  sid?: string;
  connection_type: string;
}

interface QueryHistory {
  id: string;
  timestamp: Date;
  query: string;
  status: 'success' | 'error';
  duration: number;
  rowCount?: number;
  error?: string;
}

interface SavedQuery {
  id: string;
  name: string;
  query: string;
  savedAt: string;
  connectionId?: string;
  description?: string;
}

interface ExplainPlanRow {
  id: number;
  operation: string;
  options?: string;
  objectName?: string;
  cost?: number;
  cardinality?: number;
  bytes?: number;
}

interface EditorTab {
  id: string;
  name: string;
  query: string;
  queryResults: any[];
  queryError: string | null;
  executionTime: number | null;
  totalRows: number;
  hasMoreRows: boolean;
  scriptOutput: string[];
  dbmsOutput: string[];
  explainPlan: ExplainPlanRow[];
  selectedResultTab: string;
  cursorLine: number;
  cursorColumn: number;
}

function SQLEditorContent() {
  // Editor tabs management
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([
    {
      id: '1',
      name: 'Query 1',
      query: '',
      queryResults: [],
      queryError: null,
      executionTime: null,
      totalRows: 0,
      hasMoreRows: false,
      scriptOutput: [],
      dbmsOutput: [],
      explainPlan: [],
      selectedResultTab: 'result',
      cursorLine: 1,
      cursorColumn: 1,
    },
  ]);
  const [activeEditorTabId, setActiveEditorTabId] = useState('1');

  // Get current active tab
  const activeEditorTab = editorTabs.find((tab) => tab.id === activeEditorTabId) || editorTabs[0];

  // Editor state - using activeEditorTab for current values
  const sqlQuery = activeEditorTab.query;
  const queryResults = activeEditorTab.queryResults;
  const queryError = activeEditorTab.queryError;
  const executionTime = activeEditorTab.executionTime;
  const totalRows = activeEditorTab.totalRows;
  const hasMoreRows = activeEditorTab.hasMoreRows;
  const scriptOutput = activeEditorTab.scriptOutput;
  const dbmsOutput = activeEditorTab.dbmsOutput;
  const explainPlan = activeEditorTab.explainPlan;
  const selectedTab = activeEditorTab.selectedResultTab;

  // Setter functions that update the active tab
  const setSqlQuery = (value: string | ((prev: string) => string)) => {
    const newValue = typeof value === 'function' ? value(activeEditorTab.query) : value;
    updateEditorTab(activeEditorTabId, { query: newValue });
  };
  const setQueryResults = (value: any[] | ((prev: any[]) => any[])) => {
    const newValue = typeof value === 'function' ? value(activeEditorTab.queryResults) : value;
    updateEditorTab(activeEditorTabId, { queryResults: newValue });
  };
  const setQueryError = (value: string | null) => updateEditorTab(activeEditorTabId, { queryError: value });
  const setExecutionTime = (value: number | null) => updateEditorTab(activeEditorTabId, { executionTime: value });
  const setTotalRows = (value: number | ((prev: number) => number)) => {
    const newValue = typeof value === 'function' ? value(activeEditorTab.totalRows) : value;
    updateEditorTab(activeEditorTabId, { totalRows: newValue });
  };
  const setHasMoreRows = (value: boolean) => updateEditorTab(activeEditorTabId, { hasMoreRows: value });
  const setScriptOutput = (value: string[] | ((prev: string[]) => string[])) => {
    const newValue = typeof value === 'function' ? value(activeEditorTab.scriptOutput) : value;
    updateEditorTab(activeEditorTabId, { scriptOutput: newValue });
  };
  const setDbmsOutput = (value: string[]) => updateEditorTab(activeEditorTabId, { dbmsOutput: value });
  const setExplainPlan = (value: ExplainPlanRow[]) => updateEditorTab(activeEditorTabId, { explainPlan: value });
  const setSelectedTab = (value: string) => updateEditorTab(activeEditorTabId, { selectedResultTab: value });
  const rowCount = totalRows;
  const setRowCount = setTotalRows;

  // Shared state across all editor tabs
  const [expandedObjects, setExpandedObjects] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [objectTypeFilter, setObjectTypeFilter] = useState<string>('TABLE');

  const { selectedConnectionId, selectConnection } = useDatabaseStore();

  // State for connections list
  const [connections, setConnections] = useState<OracleConnection[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);

  // Get selected connection from local connections array
  const selectedConnection = connections.find((conn) => conn.id === selectedConnectionId);

  // State for navigator data
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<string>('');
  const [schemaObjects, setSchemaObjects] = useState<DatabaseObject[]>([]);
  const [tableColumns, setTableColumns] = useState<Record<string, Column[]>>({});
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isLoadingObjects, setIsLoadingObjects] = useState(false);

  // State for query execution (current tab)
  const [isExecuting, setIsExecuting] = useState(false);

  // State for pagination (부분범위 처리)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Query history shared across all tabs
  const [queryHistory, setQueryHistory] = useState<QueryHistory[]>([]);

  // State for resizable panels
  const [navigatorWidth, setNavigatorWidth] = useState(320); // 80 * 4 = 320px (w-80)
  const [editorHeight, setEditorHeight] = useState(50); // 50% of container height
  const [isResizingNavigator, setIsResizingNavigator] = useState(false);
  const [isResizingEditor, setIsResizingEditor] = useState(false);

  // State for left sidebar tabs
  const [leftSidebarTab, setLeftSidebarTab] = useState<'navigator' | 'files'>('navigator');
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch connections list on mount
  useEffect(() => {
    fetchConnections();
    loadSavedQueries();
  }, []);

  // Load saved queries from localStorage
  const loadSavedQueries = () => {
    try {
      const saved = localStorage.getItem('saved-sql-queries');
      if (saved) {
        setSavedQueries(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load saved queries:', error);
    }
  };

  // Editor tab management functions
  const addNewEditorTab = () => {
    const newTabId = String(Date.now());
    const newTab: EditorTab = {
      id: newTabId,
      name: `Query ${editorTabs.length + 1}`,
      query: '',
      queryResults: [],
      queryError: null,
      executionTime: null,
      totalRows: 0,
      hasMoreRows: false,
      scriptOutput: [],
      dbmsOutput: [],
      explainPlan: [],
      selectedResultTab: 'result',
      cursorLine: 1,
      cursorColumn: 1,
    };
    setEditorTabs([...editorTabs, newTab]);
    setActiveEditorTabId(newTabId);
  };

  const closeEditorTab = (tabId: string) => {
    if (editorTabs.length === 1) {
      // Don't close the last tab, just reset it
      updateEditorTab(tabId, {
        query: '',
        queryResults: [],
        queryError: null,
        executionTime: null,
        totalRows: 0,
        hasMoreRows: false,
        scriptOutput: [],
        dbmsOutput: [],
        explainPlan: [],
      });
      return;
    }

    const tabIndex = editorTabs.findIndex((tab) => tab.id === tabId);
    const newTabs = editorTabs.filter((tab) => tab.id !== tabId);
    setEditorTabs(newTabs);

    // Switch to another tab if closing the active one
    if (tabId === activeEditorTabId) {
      const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
      setActiveEditorTabId(newTabs[newActiveIndex].id);
    }
  };

  const updateEditorTab = (tabId: string, updates: Partial<EditorTab>) => {
    setEditorTabs((tabs) =>
      tabs.map((tab) => (tab.id === tabId ? { ...tab, ...updates } : tab))
    );
  };

  const renameEditorTab = (tabId: string, newName: string) => {
    updateEditorTab(tabId, { name: newName });
  };

  // Handle navigator resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingNavigator) {
        const newWidth = Math.min(Math.max(200, e.clientX), 600);
        setNavigatorWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingNavigator(false);
    };

    if (isResizingNavigator) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingNavigator]);

  // Handle editor resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingEditor && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const newHeight = ((e.clientY - containerRect.top) / containerRect.height) * 100;
        setEditorHeight(Math.min(Math.max(20, newHeight), 80));
      }
    };

    const handleMouseUp = () => {
      setIsResizingEditor(false);
    };

    if (isResizingEditor) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingEditor]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F5 or Cmd+Enter (Mac) / Ctrl+Enter (Windows) - Run query
      if (e.key === 'F5' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
        e.preventDefault();
        if (sqlQuery.trim() && !isExecuting) {
          handleRunQuery();
        }
      }
      // F6 - Explain Plan
      else if (e.key === 'F6') {
        e.preventDefault();
        if (sqlQuery.trim() && !isExecuting) {
          handleGetExplainPlan();
        }
      }
      // Ctrl+S / Cmd+S - Save query
      else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (sqlQuery.trim()) {
          handleSaveSQL();
        }
      }
      // Ctrl+Shift+F / Cmd+Shift+F - Format SQL
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        if (sqlQuery.trim()) {
          handleFormatSQL();
        }
      }
      // Ctrl+N / Cmd+N - New worksheet
      else if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleNewWorksheet();
      }
      // Ctrl+O / Cmd+O - Load SQL
      else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleLoadSQL();
      }
      // Ctrl+E / Cmd+E - Export results
      else if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        if (queryResults.length > 0) {
          handleExportResults();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sqlQuery, isExecuting, queryResults]);

  // Fetch schemas when connection changes
  useEffect(() => {
    if (selectedConnectionId) {
      console.log('[SQL Editor] Connection changed, fetching schemas for:', selectedConnectionId);
      fetchSchemas();
    }
  }, [selectedConnectionId]);

  // Fetch all database connections
  const fetchConnections = async () => {
    try {
      setIsLoadingConnections(true);
      const response = await fetch('/api/oracle/connections');

      if (!response.ok) {
        throw new Error('Failed to fetch connections');
      }

      const data = await response.json();
      setConnections(data);

      // Auto-select first connection if none selected
      if (data.length > 0 && !selectedConnectionId) {
        selectConnection(data[0].id);
      }
    } catch (error) {
      console.error('[SQL Editor] Error fetching connections:', error);
    } finally {
      setIsLoadingConnections(false);
    }
  };

  // Handle connection change
  const handleConnectionChange = (connectionId: string) => {
    selectConnection(connectionId);
    // Reset states
    setSchemas([]);
    setSelectedSchema('');
    setSchemaObjects([]);
    setTableColumns({});
    setQueryResults([]);
    setQueryError(null);
  };

  // Fetch objects when schema or filter changes
  useEffect(() => {
    if (selectedSchema) {
      fetchSchemaObjects();
    }
  }, [selectedSchema, objectTypeFilter]);

  // Fetch schemas
  const fetchSchemas = async () => {
    if (!selectedConnectionId) {
      console.log('[SQL Editor] No connection selected, skipping schema fetch');
      return;
    }

    try {
      setIsLoadingSchemas(true);
      console.log('[SQL Editor] Fetching schemas from API...');
      const response = await fetch(`/api/oracle/schemas?connectionId=${selectedConnectionId}`);

      console.log('[SQL Editor] API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[SQL Editor] API error:', errorData);
        throw new Error(errorData.error || 'Failed to fetch schemas');
      }

      const data = await response.json();
      console.log('[SQL Editor] Received schemas:', data.length);
      setSchemas(data);

      // Auto-select first schema
      if (data.length > 0 && !selectedSchema) {
        console.log('[SQL Editor] Auto-selecting first schema:', data[0].SCHEMA_NAME);
        setSelectedSchema(data[0].SCHEMA_NAME);
      }
    } catch (error) {
      console.error('[SQL Editor] Error fetching schemas:', error);
      alert('Failed to load schemas: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoadingSchemas(false);
    }
  };

  // Fetch objects for selected schema and type
  const fetchSchemaObjects = async () => {
    if (!selectedConnectionId || !selectedSchema) return;

    try {
      setIsLoadingObjects(true);
      const response = await fetch(
        `/api/oracle/objects?connectionId=${selectedConnectionId}&schema=${selectedSchema}&type=${objectTypeFilter}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch schema objects');
      }

      const data = await response.json();
      setSchemaObjects(data);
    } catch (error) {
      console.error('Error fetching schema objects:', error);
    } finally {
      setIsLoadingObjects(false);
    }
  };

  // Fetch columns for a table
  const fetchTableColumns = async (tableName: string) => {
    if (!selectedConnectionId || !selectedSchema || !tableName) return;

    const key = `${selectedSchema}.${tableName}`;
    if (tableColumns[key]) return; // Already loaded

    try {
      const response = await fetch(
        `/api/oracle/columns?connectionId=${selectedConnectionId}&schema=${selectedSchema}&table=${tableName}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch columns');
      }

      const data = await response.json();
      setTableColumns((prev) => ({
        ...prev,
        [key]: data,
      }));
    } catch (error) {
      console.error('Error fetching columns:', error);
    }
  };

  // Toggle object expansion
  const toggleObject = async (objectName: string) => {
    const isExpanded = expandedObjects.has(objectName);

    if (isExpanded) {
      setExpandedObjects((prev) => {
        const newSet = new Set(prev);
        newSet.delete(objectName);
        return newSet;
      });
    } else {
      setExpandedObjects((prev) => new Set(prev).add(objectName));
      // Fetch columns if not already loaded
      if (objectTypeFilter === 'TABLE') {
        await fetchTableColumns(objectName);
      }
    }
  };

  // Filter objects by search term
  const filteredObjects = schemaObjects.filter((obj) =>
    obj.OBJECT_NAME.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Insert object name into SQL editor
  const insertIntoEditor = (text: string) => {
    setSqlQuery((prev) => {
      if (prev.length === 0) {
        return text;
      }
      return prev + ' ' + text;
    });
    // Focus textarea after insertion
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  // Generate SELECT query for table
  const generateSelectQuery = (tableName: string) => {
    const fullName = `${selectedSchema}.${tableName}`;
    const query = `SELECT * FROM ${fullName} WHERE ROWNUM <= 100;`;
    setSqlQuery(query);
    textareaRef.current?.focus();
  };

  // Generate INSERT template
  const generateInsertTemplate = (tableName: string) => {
    const columnsKey = `${selectedSchema}.${tableName}`;
    const columns = tableColumns[columnsKey] || [];

    if (columns.length === 0) {
      const fullName = `${selectedSchema}.${tableName}`;
      const query = `INSERT INTO ${fullName} (column1, column2, ...)\nVALUES (value1, value2, ...);`;
      setSqlQuery(query);
    } else {
      const columnNames = columns.map((col) => col.COLUMN_NAME).join(', ');
      const valuePlaceholders = columns.map(() => '?').join(', ');
      const fullName = `${selectedSchema}.${tableName}`;
      const query = `INSERT INTO ${fullName}\n  (${columnNames})\nVALUES\n  (${valuePlaceholders});`;
      setSqlQuery(query);
    }
    textareaRef.current?.focus();
  };

  // Generate UPDATE template
  const generateUpdateTemplate = (tableName: string) => {
    const fullName = `${selectedSchema}.${tableName}`;
    const columnsKey = `${selectedSchema}.${tableName}`;
    const columns = tableColumns[columnsKey] || [];

    let setClause = 'column1 = value1, column2 = value2';
    if (columns.length > 0) {
      setClause = columns
        .slice(0, 3)
        .map((col) => `${col.COLUMN_NAME} = ?`)
        .join(',\n  ');
    }

    const query = `UPDATE ${fullName}\nSET\n  ${setClause}\nWHERE condition;`;
    setSqlQuery(query);
    textareaRef.current?.focus();
  };

  // Generate DELETE template
  const generateDeleteTemplate = (tableName: string) => {
    const fullName = `${selectedSchema}.${tableName}`;
    const query = `DELETE FROM ${fullName}\nWHERE condition;`;
    setSqlQuery(query);
    textareaRef.current?.focus();
  };

  // Copy object name to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleRunQuery = async () => {
    if (!sqlQuery.trim()) {
      alert('Please enter a SQL query');
      return;
    }

    if (!selectedConnectionId) {
      alert('Please select a database connection');
      return;
    }

    console.log('[SQL Editor] Running query:', sqlQuery);
    setIsExecuting(true);
    setQueryError(null);
    setQueryResults([]);
    setExecutionTime(null);
    setRowCount(0);
    setScriptOutput([]);

    const startTime = Date.now();

    try {
      const response = await fetch('/api/oracle/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connectionId: selectedConnectionId,
          query: sqlQuery,
          schema: selectedSchema || undefined,
          options: {
            maxRows: pageSize,
            offset: 0,
            fetchSize: 100,
          },
        }),
      });

      const data = await response.json();
      const duration = Date.now() - startTime;

      if (!response.ok) {
        // Add error to history
        const historyEntry: QueryHistory = {
          id: Date.now().toString(),
          timestamp: new Date(),
          query: sqlQuery.substring(0, 100) + (sqlQuery.length > 100 ? '...' : ''),
          status: 'error',
          duration,
          error: data.error || 'Query execution failed',
        };
        setQueryHistory((prev) => [historyEntry, ...prev]);

        throw new Error(data.error || 'Query execution failed');
      }

      console.log('[SQL Editor] Query result:', data);

      // Check if EXPLAIN PLAN query
      const isExplainPlan = sqlQuery.trim().toUpperCase().startsWith('EXPLAIN PLAN');

      // 결과 설정
      if (data.queryType === 'SELECT') {
        setQueryResults(data.rows || []);
        setRowCount(data.rowCount || 0);
        setHasMoreRows(data.hasMore || false);
        setCurrentPage(1);
        setTotalRows(data.rowCount || 0);

        // If this was selecting from PLAN_TABLE, show in Explain Plan tab
        if (sqlQuery.toUpperCase().includes('PLAN_TABLE')) {
          setExplainPlan(
            data.rows.map((row: any, idx: number) => ({
              id: idx,
              operation: row.OPERATION || '',
              options: row.OPTIONS || '',
              objectName: row.OBJECT_NAME || '',
              cost: row.COST || 0,
              cardinality: row.CARDINALITY || 0,
              bytes: row.BYTES || 0,
            }))
          );
          if (data.rows.length > 0) {
            setSelectedTab('explain');
          }
        }
      } else {
        setQueryError(null);
        const message = data.message || `Query executed successfully. ${data.rowsAffected || 0} row(s) affected.`;
        setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);

        // Show script output tab for DML/DDL
        if (data.queryType !== 'SELECT' && !isExplainPlan) {
          setSelectedTab('script');
        }
      }

      setExecutionTime(data.executionTime);

      // Add success to history
      const historyEntry: QueryHistory = {
        id: Date.now().toString(),
        timestamp: new Date(),
        query: sqlQuery.substring(0, 100) + (sqlQuery.length > 100 ? '...' : ''),
        status: 'success',
        duration,
        rowCount: data.queryType === 'SELECT' ? data.rowCount : data.rowsAffected,
      };
      setQueryHistory((prev) => [historyEntry, ...prev]);

      // For EXPLAIN PLAN, automatically query PLAN_TABLE
      if (isExplainPlan) {
        setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Explain plan generated successfully`]);
        setSelectedTab('script');
      }
    } catch (error: any) {
      console.error('[SQL Editor] Query execution error:', error);
      setQueryError(error.message || 'Query execution failed');
      setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${error.message}`]);
    } finally {
      setIsExecuting(false);
    }
  };

  // Get Explain Plan
  const handleGetExplainPlan = async () => {
    if (!sqlQuery.trim()) {
      alert('실행할 쿼리를 입력하세요.');
      return;
    }

    if (!selectedConnectionId) {
      alert('데이터베이스 연결을 선택하세요.');
      return;
    }

    setIsExecuting(true);
    setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Getting explain plan...`]);

    try {
      const response = await fetch('/api/oracle/explain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connectionId: selectedConnectionId,
          query: sqlQuery,
          schema: selectedSchema || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get explain plan');
      }

      // Set explain plan results
      setExplainPlan(data.plan || []);
      setScriptOutput((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Explain plan retrieved successfully`,
        data.planText || '',
      ]);
      setSelectedTab('explain');
    } catch (error: any) {
      console.error('[SQL Editor] Explain plan error:', error);
      setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${error.message}`]);
      alert(`실행계획 조회 실패: ${error.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Format SQL Query
  const handleFormatSQL = () => {
    if (!sqlQuery.trim()) return;

    // Simple SQL formatter
    let formatted = sqlQuery
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/,/g, ',\n  ') // Add newline after commas
      .replace(/\b(SELECT|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|OUTER|ON|AND|OR|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE|ALTER|DROP|TABLE|INDEX|VIEW)\b/gi, '\n$1') // Add newline before keywords
      .replace(/\n\s+\n/g, '\n') // Remove empty lines
      .trim();

    // Indent nested queries
    const lines = formatted.split('\n');
    let indentLevel = 0;
    const indented = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.match(/\(/)) indentLevel++;
      const result = '  '.repeat(Math.max(0, indentLevel)) + trimmed;
      if (trimmed.match(/\)/)) indentLevel = Math.max(0, indentLevel - 1);
      return result;
    });

    setSqlQuery(indented.join('\n'));
    setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] SQL formatted successfully`]);
  };

  // Save SQL Query to localStorage
  const handleSaveSQL = () => {
    if (!sqlQuery.trim()) {
      alert('쿼리가 비어있습니다.');
      return;
    }

    const queryName = prompt('쿼리 이름을 입력하세요:', `Query_${new Date().toISOString().split('T')[0]}`);
    if (!queryName) return;

    try {
      const newQuery: SavedQuery = {
        id: Date.now().toString(),
        name: queryName,
        query: sqlQuery,
        savedAt: new Date().toISOString(),
        connectionId: selectedConnectionId || undefined,
      };

      const updatedQueries = [...savedQueries, newQuery];
      setSavedQueries(updatedQueries);
      localStorage.setItem('saved-sql-queries', JSON.stringify(updatedQueries));
      setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Query saved: ${queryName}`]);
      alert(`쿼리가 저장되었습니다: ${queryName}`);
    } catch (error) {
      console.error('Save error:', error);
      alert('쿼리 저장 중 오류가 발생했습니다.');
    }
  };

  // Load saved query
  const handleLoadSavedQuery = (query: SavedQuery) => {
    setSqlQuery(query.query);
    if (query.connectionId && connections.find((c) => c.id === query.connectionId)) {
      selectConnection(query.connectionId);
    }
    setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Loaded query: ${query.name}`]);
  };

  // Delete saved query
  const handleDeleteSavedQuery = (queryId: string) => {
    const query = savedQueries.find((q) => q.id === queryId);
    if (!query) return;

    if (confirm(`'${query.name}' 쿼리를 삭제하시겠습니까?`)) {
      const updatedQueries = savedQueries.filter((q) => q.id !== queryId);
      setSavedQueries(updatedQueries);
      localStorage.setItem('saved-sql-queries', JSON.stringify(updatedQueries));
      setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Deleted query: ${query.name}`]);
    }
  };

  // Rename saved query
  const handleRenameSavedQuery = (queryId: string) => {
    const query = savedQueries.find((q) => q.id === queryId);
    if (!query) return;

    const newName = prompt('새 이름을 입력하세요:', query.name);
    if (!newName || newName === query.name) return;

    const updatedQueries = savedQueries.map((q) => (q.id === queryId ? { ...q, name: newName } : q));
    setSavedQueries(updatedQueries);
    localStorage.setItem('saved-sql-queries', JSON.stringify(updatedQueries));
    setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Renamed query: ${query.name} → ${newName}`]);
  };

  // New Worksheet - Clear editor
  const handleNewWorksheet = () => {
    if (sqlQuery.trim() && !confirm('현재 쿼리를 지우고 새로운 워크시트를 시작하시겠습니까?')) {
      return;
    }

    setSqlQuery('');
    setQueryResults([]);
    setQueryError(null);
    setExecutionTime(null);
    setRowCount(0);
    setScriptOutput([]);
    setDbmsOutput([]);
    setExplainPlan([]);
    setSelectedTab('result');
    setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] New worksheet created`]);
  };

  // Load SQL from file
  const handleLoadSQL = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sql,.txt';
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setSqlQuery(content);
        setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Loaded file: ${file.name}`]);
      };
      reader.onerror = () => {
        alert('파일 읽기 중 오류가 발생했습니다.');
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Export results to CSV
  const handleExportResults = () => {
    if (queryResults.length === 0) {
      alert('내보낼 결과가 없습니다.');
      return;
    }

    try {
      // Get column names from first result
      const columns = Object.keys(queryResults[0]);

      // Create CSV content
      const csvHeader = columns.join(',');
      const csvRows = queryResults.map((row) => columns.map((col) => {
        const value = row[col];
        // Escape commas and quotes in values
        const escaped = String(value ?? '').replace(/"/g, '""');
        return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') ? `"${escaped}"` : escaped;
      }).join(','));

      const csvContent = [csvHeader, ...csvRows].join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `query_results_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Results exported to CSV (${queryResults.length} rows)`]);
    } catch (error) {
      console.error('Export error:', error);
      alert('결과 내보내기 중 오류가 발생했습니다.');
    }
  };

  // Share query - Copy to clipboard
  const handleShareQuery = () => {
    if (!sqlQuery.trim()) {
      alert('공유할 쿼리가 없습니다.');
      return;
    }

    navigator.clipboard
      .writeText(sqlQuery)
      .then(() => {
        setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Query copied to clipboard`]);
        alert('쿼리가 클립보드에 복사되었습니다.');
      })
      .catch(() => {
        alert('클립보드 복사 중 오류가 발생했습니다.');
      });
  };

  // Delete/Clear query with confirmation
  const handleClearQuery = () => {
    if (!sqlQuery.trim() && queryResults.length === 0) {
      alert('삭제할 내용이 없습니다.');
      return;
    }

    if (confirm('쿼리와 결과를 모두 삭제하시겠습니까?')) {
      setSqlQuery('');
      setQueryResults([]);
      setQueryError(null);
      setExecutionTime(null);
      setRowCount(0);
      setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Query and results cleared`]);
    }
  };

  // Settings - Show saved queries dialog
  const handleSettings = () => {
    try {
      const savedQueries = JSON.parse(localStorage.getItem('saved-sql-queries') || '[]');
      if (savedQueries.length === 0) {
        alert('저장된 쿼리가 없습니다.');
        return;
      }

      const queryList = savedQueries
        .map((q: any, i: number) => `${i + 1}. ${q.name} (${new Date(q.savedAt).toLocaleString()})`)
        .join('\n');

      const selected = prompt(
        `저장된 쿼리 목록:\n${queryList}\n\n불러올 쿼리 번호를 입력하세요 (취소: 0):`,
        '0'
      );

      if (selected && selected !== '0') {
        const index = parseInt(selected) - 1;
        if (index >= 0 && index < savedQueries.length) {
          setSqlQuery(savedQueries[index].query);
          setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Loaded query: ${savedQueries[index].name}`]);
        }
      }
    } catch (error) {
      console.error('Settings error:', error);
      alert('설정 로드 중 오류가 발생했습니다.');
    }
  };

  // Update cursor position
  const updateCursorPosition = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = activeEditorTab.query.substring(0, cursorPos);
    const lines = textBeforeCursor.split('\n');
    const lineNumber = lines.length;
    const columnNumber = lines[lines.length - 1].length + 1;

    updateEditorTab(activeEditorTabId, {
      cursorLine: lineNumber,
      cursorColumn: columnNumber,
    });
  };

  // Fetch next page of results
  const handleFetchNextPage = async () => {
    if (!hasMoreRows || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const response = await fetch('/api/oracle/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connectionId: selectedConnectionId,
          query: sqlQuery,
          schema: selectedSchema || undefined,
          options: {
            maxRows: pageSize,
            offset: currentPage * pageSize,
            fetchSize: 100,
          },
        }),
      });

      const data = await response.json();

      if (response.ok && data.queryType === 'SELECT') {
        setQueryResults((prev) => [...prev, ...(data.rows || [])]);
        setRowCount((prev) => prev + (data.rowCount || 0));
        setHasMoreRows(data.hasMore || false);
        setCurrentPage((prev) => prev + 1);
        setTotalRows((prev) => prev + (data.rowCount || 0));
        setScriptOutput((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] Fetched ${data.rowCount} more rows (Page ${currentPage + 1})`,
        ]);
      }
    } catch (error: any) {
      console.error('[SQL Editor] Fetch next page error:', error);
      setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: Failed to fetch more rows`]);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Change page size
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setScriptOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Page size changed to ${newSize} rows`]);
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-white rounded-lg shadow-sm border border-slate-200"
      style={{ height: 'calc(100vh - 4.5rem)' }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-white">
        {/* Database Connection selector */}
        <select
          className="h-8 px-3 text-sm border border-slate-300 rounded bg-white font-medium min-w-[220px]"
          value={selectedConnectionId || ''}
          onChange={(e) => handleConnectionChange(e.target.value)}
          disabled={isLoadingConnections}
        >
          {isLoadingConnections ? (
            <option>Loading connections...</option>
          ) : connections.length === 0 ? (
            <option value="">No connections available</option>
          ) : (
            <>
              <option value="">Select database connection...</option>
              {connections.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.name} ({conn.username}@{conn.host}:{conn.port})
                </option>
              ))}
            </>
          )}
        </select>

        <div className="h-6 w-px bg-slate-300 mx-1" />

        {/* Current Schema indicator */}
        {selectedSchema && (
          <>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs">
              <Database className="h-3 w-3 text-blue-600" />
              <span className="text-blue-700 font-medium">{selectedSchema}</span>
            </div>
            <div className="h-6 w-px bg-slate-300 mx-1" />
          </>
        )}

        {/* Primary actions */}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={handleRunQuery}
          disabled={isExecuting || !sqlQuery.trim()}
          title="Run (F5 or Cmd+Enter / Ctrl+Enter)"
        >
          {isExecuting ? (
            <Loader2 className="h-4 w-4 animate-spin text-green-600" />
          ) : (
            <Play className="h-4 w-4 text-green-600" />
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={handleGetExplainPlan}
          disabled={isExecuting || !sqlQuery.trim()}
          title="Explain Plan (F6)"
        >
          <Lightbulb className="h-4 w-4 text-amber-600" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={handleFormatSQL}
          disabled={!sqlQuery.trim()}
          title="Format SQL"
        >
          <AlignJustify className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={handleSaveSQL}
          disabled={!sqlQuery.trim()}
          title="Save"
        >
          <Save className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleNewWorksheet} title="New worksheet">
          <FileText className="h-4 w-4" />
        </Button>

        <div className="h-6 w-px bg-slate-300 mx-1" />

        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleLoadSQL} title="Load SQL">
          <Upload className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={handleExportResults}
          disabled={queryResults.length === 0}
          title="Export"
        >
          <Download className="h-4 w-4" />
        </Button>

        <div className="flex-1" />

        {/* Right actions */}
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleSettings} title="Load saved query">
          <FolderOpen className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={handleShareQuery}
          disabled={!sqlQuery.trim()}
          title="Share"
        >
          <Share2 className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleClearQuery} title="Delete">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Navigator & Files */}
        <div className="flex flex-col bg-white border-r border-slate-200" style={{ width: `${navigatorWidth}px` }}>
          {/* Tab Header */}
          <div className="border-b border-slate-200">
            <div className="flex">
              <button
                className={cn(
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                  leftSidebarTab === 'navigator'
                    ? 'text-slate-700 font-semibold border-b-2 border-blue-500'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                )}
                onClick={() => setLeftSidebarTab('navigator')}
              >
                Navigator
              </button>
              <button
                className={cn(
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                  leftSidebarTab === 'files'
                    ? 'text-slate-700 font-semibold border-b-2 border-blue-500'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                )}
                onClick={() => setLeftSidebarTab('files')}
              >
                Files
              </button>
            </div>
          </div>

          {/* Navigator Tab Content */}
          {leftSidebarTab === 'navigator' && (
            <>
              {/* Schema and Object Type Selectors */}
          <div className="p-3 space-y-2 border-b border-slate-200">
            <select
              className="w-full h-9 px-3 text-sm border border-slate-300 rounded bg-white font-medium"
              value={selectedSchema}
              onChange={(e) => setSelectedSchema(e.target.value)}
              disabled={isLoadingSchemas || schemas.length === 0}
            >
              <option value="">Select schema...</option>
              {schemas.map((schema) => (
                <option key={schema.SCHEMA_NAME} value={schema.SCHEMA_NAME}>
                  {schema.SCHEMA_NAME}
                </option>
              ))}
            </select>

            <select
              className="w-full h-9 px-3 text-sm border border-slate-300 rounded bg-white"
              value={objectTypeFilter}
              onChange={(e) => setObjectTypeFilter(e.target.value)}
            >
              <option value="TABLE">Tables</option>
              <option value="VIEW">Views</option>
              <option value="INDEX">Indexes</option>
              <option value="SEQUENCE">Sequences</option>
              <option value="PROCEDURE">Procedures</option>
              <option value="FUNCTION">Functions</option>
              <option value="PACKAGE">Packages</option>
              <option value="TRIGGER">Triggers</option>
              <option value="ALL">All Objects</option>
            </select>
          </div>

          {/* Search */}
          <div className="p-3 border-b border-slate-200">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search objects"
                  className="h-9 pl-8 text-sm bg-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 p-0"
                onClick={fetchSchemaObjects}
                disabled={isLoadingObjects}
              >
                <RefreshCw className={cn('h-4 w-4', isLoadingObjects && 'animate-spin')} />
              </Button>
            </div>
          </div>

          {/* Object List */}
          <div className="flex-1 overflow-y-auto">
            {isLoadingObjects ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : !selectedSchema ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Database className="h-10 w-10 text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">Select a schema to view objects</p>
              </div>
            ) : filteredObjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <TableIcon className="h-10 w-10 text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">No objects found</p>
              </div>
            ) : (
              <div className="py-1">
                {filteredObjects.map((obj) => {
                  const isExpanded = expandedObjects.has(obj.OBJECT_NAME);
                  const columnsKey = `${selectedSchema}.${obj.OBJECT_NAME}`;
                  const columns = tableColumns[columnsKey] || [];
                  const canExpand = objectTypeFilter === 'TABLE' || objectTypeFilter === 'VIEW' || objectTypeFilter === 'ALL';

                  return (
                    <div key={obj.OBJECT_NAME}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={() => canExpand && toggleObject(obj.OBJECT_NAME)}
                            onDoubleClick={() => insertIntoEditor(`${selectedSchema}.${obj.OBJECT_NAME}`)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-slate-100 group"
                            title={obj.COMMENTS || obj.OBJECT_NAME}
                          >
                            {canExpand ? (
                              isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                              )
                            ) : (
                              <div className="w-4" />
                            )}
                            <TableIcon className="h-4 w-4 text-slate-600 flex-shrink-0" />
                            <span className="text-slate-700 font-medium truncate">{obj.OBJECT_NAME}</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                          <DropdownMenuItem onClick={() => insertIntoEditor(`${selectedSchema}.${obj.OBJECT_NAME}`)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Insert Name
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyToClipboard(`${selectedSchema}.${obj.OBJECT_NAME}`)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy Name
                          </DropdownMenuItem>
                          {(objectTypeFilter === 'TABLE' || obj.OBJECT_TYPE === 'TABLE') && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => generateSelectQuery(obj.OBJECT_NAME)}>
                                <Eye className="mr-2 h-4 w-4" />
                                SELECT Statement
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => generateInsertTemplate(obj.OBJECT_NAME)}>
                                <Plus className="mr-2 h-4 w-4" />
                                INSERT Template
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => generateUpdateTemplate(obj.OBJECT_NAME)}>
                                <Edit className="mr-2 h-4 w-4" />
                                UPDATE Template
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => generateDeleteTemplate(obj.OBJECT_NAME)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                DELETE Template
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => toggleObject(obj.OBJECT_NAME)}>
                                <Filter className="mr-2 h-4 w-4" />
                                View Columns
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Columns */}
                      {isExpanded && canExpand && (
                        <div className="bg-slate-50">
                          {columns.map((col) => (
                            <DropdownMenu key={col.COLUMN_NAME}>
                              <DropdownMenuTrigger asChild>
                                <button
                                  onDoubleClick={() => insertIntoEditor(col.COLUMN_NAME)}
                                  onContextMenu={(e) => e.preventDefault()}
                                  className="flex items-center gap-2 w-full px-3 py-1.5 pl-11 text-xs hover:bg-slate-200 group"
                                  title={col.COMMENTS || `${col.DATA_TYPE}${col.NULLABLE === 'N' ? ' NOT NULL' : ''}`}
                                >
                                  <Columns className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                  <span className="text-slate-600 truncate">{col.COLUMN_NAME}</span>
                                  {col.IS_PRIMARY_KEY === 'Y' && (
                                    <span className="ml-auto text-[10px] text-amber-600 font-bold">PK</span>
                                  )}
                                  <span className="ml-auto text-[10px] text-slate-400">{col.DATA_TYPE}</span>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuItem onClick={() => insertIntoEditor(col.COLUMN_NAME)}>
                                  <Plus className="mr-2 h-3.5 w-3.5" />
                                  Insert Name
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => copyToClipboard(col.COLUMN_NAME)}>
                                  <Copy className="mr-2 h-3.5 w-3.5" />
                                  Copy Name
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled>
                                  <Info className="mr-2 h-3.5 w-3.5" />
                                  {col.DATA_TYPE}
                                  {col.NULLABLE === 'N' ? ' NOT NULL' : ''}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
            </>
          )}

          {/* Files Tab Content */}
          {leftSidebarTab === 'files' && (
            <>
              {/* Files Header */}
              <div className="p-3 border-b border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-700">Saved Queries</h3>
                  <span className="text-xs text-slate-500">{savedQueries.length} items</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 gap-2 text-xs"
                  onClick={handleLoadSQL}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Load SQL File
                </Button>
              </div>

              {/* Files List */}
              <div className="flex-1 overflow-y-auto">
                {savedQueries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <FileText className="h-10 w-10 text-slate-300 mb-3" />
                    <p className="text-sm text-slate-500 mb-2">No saved queries</p>
                    <p className="text-xs text-slate-400">Save a query using the Save button in the toolbar</p>
                  </div>
                ) : (
                  <div className="py-1">
                    {savedQueries.map((query) => {
                      const savedDate = new Date(query.savedAt);
                      const formattedDate = savedDate.toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                      });
                      const formattedTime = savedDate.toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <div
                          key={query.id}
                          className="group px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100"
                          onClick={() => handleLoadSavedQuery(query)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                <p className="text-sm font-medium text-slate-700 truncate">{query.name}</p>
                              </div>
                              <p className="text-xs text-slate-500 mt-1 overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                {query.query}
                              </p>
                              <p className="text-xs text-slate-400 mt-1">
                                {formattedDate} {formattedTime}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRenameSavedQuery(query.id);
                                }}
                                title="Rename"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSavedQuery(query.id);
                                }}
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Vertical Resizer for Navigator */}
        <div
          className="w-1 bg-slate-200 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors"
          onMouseDown={() => setIsResizingNavigator(true)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* SQL Editor */}
          <div className="border-b border-slate-200 flex flex-col bg-white" style={{ height: `${editorHeight}%` }}>
            {/* Editor Tabs */}
            <div className="flex items-center bg-slate-100 border-b border-slate-200">
              <div className="flex-1 flex items-center overflow-x-auto">
                {editorTabs.map((tab) => (
                  <div
                    key={tab.id}
                    onClick={() => setActiveEditorTabId(tab.id)}
                    className={cn(
                      'group relative flex items-center gap-2 px-4 py-2 border-r border-slate-200 cursor-pointer min-w-[120px] max-w-[200px]',
                      tab.id === activeEditorTabId
                        ? 'bg-white text-slate-900'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="text-xs font-medium truncate flex-1">{tab.name}</span>
                    {editorTabs.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeEditorTab(tab.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:bg-slate-200 rounded p-0.5 transition-opacity"
                      >
                        <Plus className="h-3 w-3 rotate-45" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={addNewEditorTab}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors border-l border-slate-200"
                title="New query tab"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Editor Header */}
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="font-mono">
                  Line: {activeEditorTab.cursorLine}, Col: {activeEditorTab.cursorColumn}
                </span>
              </div>
            </div>

            {/* Editor with line numbers */}
            <div className="flex-1 overflow-auto flex">
              {/* Line numbers */}
              <div className="w-12 bg-slate-50 border-r border-slate-200 py-4 text-right pr-3 select-none">
                {Array.from({ length: Math.max(activeEditorTab.query.split('\n').length, 20) }, (_, i) => (
                  <div key={i + 1} className="font-mono text-xs text-slate-400 leading-6">
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* SQL Input */}
              <div className="flex-1">
                <textarea
                  ref={textareaRef}
                  value={activeEditorTab.query}
                  onChange={(e) => {
                    updateEditorTab(activeEditorTabId, { query: e.target.value });
                    updateCursorPosition();
                  }}
                  onClick={updateCursorPosition}
                  onKeyUp={updateCursorPosition}
                  onSelect={updateCursorPosition}
                  placeholder="Enter your SQL query here..."
                  className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none bg-white leading-6"
                  style={{ minHeight: '200px' }}
                  spellCheck={false}
                  onKeyDown={(e) => {
                    // F5 or Cmd+Enter / Ctrl+Enter to run query
                    if (e.key === 'F5' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
                      e.preventDefault();
                      handleRunQuery();
                    }
                  }}
                />
              </div>
            </div>

            {/* Status Bar */}
            <div className="flex items-center gap-4 px-4 py-1.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="font-medium">Connection:</span>
                <span>{selectedConnection?.name || 'Not connected'}</span>
              </div>
              {executionTime !== null && (
                <>
                  <div className="h-3 w-px bg-slate-300" />
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    <span>{executionTime}ms</span>
                  </div>
                </>
              )}
              {rowCount > 0 && (
                <>
                  <div className="h-3 w-px bg-slate-300" />
                  <div className="flex items-center gap-2">
                    <TableIcon className="h-3 w-3" />
                    <span>{rowCount} rows</span>
                  </div>
                </>
              )}
              {isExecuting && (
                <>
                  <div className="h-3 w-px bg-slate-300" />
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Executing...</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Horizontal Resizer for Editor */}
          <div
            className="h-1 bg-slate-200 hover:bg-blue-500 cursor-row-resize flex-shrink-0 transition-colors"
            onMouseDown={() => setIsResizingEditor(true)}
          />

          {/* Results Area */}
          <div className="flex flex-col overflow-hidden bg-slate-50" style={{ height: `${100 - editorHeight}%` }}>
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex flex-col h-full">
              <div className="border-b border-slate-200 bg-white flex-shrink-0">
                <TabsList className="h-11 w-full justify-start rounded-none bg-transparent p-0 px-2">
                  <TabsTrigger
                    value="result"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent h-10 px-4 text-sm"
                  >
                    Query result
                  </TabsTrigger>
                  <TabsTrigger
                    value="script"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent h-10 px-4 text-sm"
                  >
                    Script output
                  </TabsTrigger>
                  <TabsTrigger
                    value="dbms"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent h-10 px-4 text-sm"
                  >
                    DBMS output
                  </TabsTrigger>
                  <TabsTrigger
                    value="explain"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent h-10 px-4 text-sm"
                  >
                    Explain Plan
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent h-10 px-4 text-sm"
                  >
                    SQL history
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="result" className="m-0 flex flex-col bg-white h-full data-[state=active]:flex">
                <div className="p-4 border-b border-slate-200 flex-shrink-0">
                  {/* Action bar */}
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5">
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                    <div className="flex-1" />
                    {/* Pagination controls */}
                    {queryResults.length > 0 && (
                      <div className="flex items-center gap-3 text-xs text-slate-600">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Page size:</span>
                          <select
                            value={pageSize}
                            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                            className="h-7 px-2 border border-slate-300 rounded bg-white text-xs"
                          >
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={200}>200</option>
                            <option value={500}>500</option>
                            <option value={1000}>1000</option>
                          </select>
                        </div>
                        <div className="h-4 w-px bg-slate-300" />
                        <span className="font-medium">
                          Showing {totalRows} row{totalRows !== 1 ? 's' : ''}
                          {hasMoreRows && ' (more available)'}
                        </span>
                        {hasMoreRows && (
                          <>
                            <div className="h-4 w-px bg-slate-300" />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1.5 text-xs"
                              onClick={handleFetchNextPage}
                              disabled={isLoadingMore}
                            >
                              {isLoadingMore ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  <span>Loading...</span>
                                </>
                              ) : (
                                <>
                                  <Download className="h-3.5 w-3.5" />
                                  <span>Fetch more</span>
                                </>
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1.5"
                      onClick={handleExportResults}
                      disabled={queryResults.length === 0}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="text-xs">Export CSV</span>
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto bg-slate-50">
                  {queryError && (
                    <div className="flex items-center gap-2 m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      <Info className="h-4 w-4 text-red-500" />
                      <p>{queryError}</p>
                    </div>
                  )}

                  {!queryError && queryResults.length === 0 && !isExecuting && (
                    <div className="flex items-center gap-2 m-4 text-sm text-slate-500">
                      <Info className="h-4 w-4 text-slate-400" />
                      <p>Run a query to see results here.</p>
                    </div>
                  )}

                  {isExecuting && (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                  )}

                  {!isExecuting && queryResults.length > 0 && (
                    <table className="w-full text-sm border-collapse bg-white">
                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-slate-700 bg-slate-50 sticky left-0 z-30 border-r border-slate-200">
                              #
                            </th>
                            {queryResults.length > 0 &&
                              Object.keys(queryResults[0]).map((column) => (
                                <th key={column} className="px-4 py-2 text-left font-medium text-slate-700 whitespace-nowrap bg-slate-50">
                                  {column}
                                </th>
                              ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResults.map((row, idx) => (
                            <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="px-4 py-2 text-slate-500 bg-white sticky left-0 z-10 border-r border-slate-200">
                                {idx + 1}
                              </td>
                              {Object.values(row).map((value: any, colIdx) => (
                                <td key={colIdx} className="px-4 py-2 text-slate-700 whitespace-nowrap">
                                  {value === null ? (
                                    <span className="text-slate-400 italic">NULL</span>
                                  ) : typeof value === 'object' ? (
                                    JSON.stringify(value)
                                  ) : (
                                    String(value)
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="script" className="m-0 flex flex-col bg-white h-full data-[state=active]:flex">
                <div className="flex-1 overflow-auto p-4">
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Info className="h-4 w-4 text-slate-400" />
                        <p className="font-medium">Script Output</p>
                      </div>
                    </div>
                    <div className="p-4 bg-white font-mono text-xs space-y-1 min-h-[200px]">
                      {scriptOutput.length === 0 ? (
                        <p className="text-slate-400">No script output yet.</p>
                      ) : (
                        scriptOutput.map((line, idx) => (
                          <div key={idx} className="text-slate-700">
                            {line}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="dbms" className="m-0 flex flex-col bg-white h-full data-[state=active]:flex">
                <div className="flex-1 overflow-auto p-4">
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Info className="h-4 w-4 text-slate-400" />
                        <p className="font-medium">DBMS Output</p>
                      </div>
                    </div>
                    <div className="p-4 bg-white font-mono text-xs space-y-1 min-h-[200px]">
                      {dbmsOutput.length === 0 ? (
                        <div>
                          <p className="text-slate-400 mb-3">No DBMS output yet.</p>
                          <p className="text-slate-500 text-xs">
                            To enable DBMS_OUTPUT, run:
                            <br />
                            <code className="px-2 py-1 bg-slate-200 rounded mt-1 inline-block">
                              SET SERVEROUTPUT ON;
                            </code>
                          </p>
                        </div>
                      ) : (
                        dbmsOutput.map((line, idx) => (
                          <div key={idx} className="text-slate-700">
                            {line}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="explain" className="m-0 flex flex-col bg-white h-full data-[state=active]:flex">
                <div className="p-4 border-b border-slate-200 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Lightbulb className="h-4 w-4 text-amber-600" />
                      <p className="font-medium">Explain Plan</p>
                      <span className="text-slate-400 text-xs">- F6 키 또는 Explain Plan 버튼 클릭</span>
                    </div>
                    {explainPlan.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 text-xs"
                        onClick={handleGetExplainPlan}
                        disabled={isExecuting || !sqlQuery.trim()}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        새로고침
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  {explainPlan.length === 0 ? (
                    <div className="border border-slate-200 rounded-lg p-6 bg-slate-50">
                      <div className="flex items-start gap-3">
                        <Lightbulb className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-slate-700 text-sm font-medium mb-2">실행계획이란?</p>
                          <p className="text-slate-600 text-sm mb-3">
                            Oracle 옵티마이저가 쿼리를 실행하기 위해 선택한 경로와 방법을 보여줍니다.
                            성능 튜닝의 핵심 도구입니다.
                          </p>
                          <div className="bg-white border border-slate-200 rounded p-3 mt-3">
                            <p className="text-slate-500 text-xs font-medium mb-2">사용 방법:</p>
                            <ol className="text-slate-600 text-xs space-y-1 list-decimal list-inside">
                              <li>SQL 쿼리를 에디터에 입력합니다</li>
                              <li>Explain Plan 버튼을 클릭하거나 F6 키를 누릅니다</li>
                              <li>실행계획 결과를 확인하고 성능을 분석합니다</li>
                            </ol>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Plan Table */}
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="px-4 py-2 text-left font-medium text-slate-700 w-12">ID</th>
                              <th className="px-4 py-2 text-left font-medium text-slate-700">Operation</th>
                              <th className="px-4 py-2 text-left font-medium text-slate-700">Options</th>
                              <th className="px-4 py-2 text-left font-medium text-slate-700">Object Name</th>
                              <th className="px-4 py-2 text-left font-medium text-slate-700">Object Type</th>
                              <th className="px-4 py-2 text-right font-medium text-slate-700">Cost</th>
                              <th className="px-4 py-2 text-right font-medium text-slate-700">Cardinality</th>
                              <th className="px-4 py-2 text-right font-medium text-slate-700">Bytes</th>
                              <th className="px-4 py-2 text-right font-medium text-slate-700">CPU Cost</th>
                              <th className="px-4 py-2 text-right font-medium text-slate-700">IO Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {explainPlan.map((row: any) => (
                              <tr key={row.ID} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-4 py-2 text-slate-600 text-xs text-right">{row.ID}</td>
                                <td className="px-4 py-2 text-slate-700 font-mono text-xs font-medium">
                                  {'  '.repeat(Math.max(0, (row.DEPTH || 0)))}
                                  {row.OPERATION}
                                </td>
                                <td className="px-4 py-2 text-slate-600 text-xs">{row.OPTIONS || '-'}</td>
                                <td className="px-4 py-2 text-slate-700 text-xs font-medium">{row.OBJECT_NAME || '-'}</td>
                                <td className="px-4 py-2 text-slate-500 text-xs">{row.OBJECT_TYPE || '-'}</td>
                                <td className="px-4 py-2 text-slate-600 text-xs text-right">
                                  {row.COST !== null && row.COST !== undefined ? row.COST.toLocaleString() : '-'}
                                </td>
                                <td className="px-4 py-2 text-slate-600 text-xs text-right">
                                  {row.CARDINALITY !== null && row.CARDINALITY !== undefined ? row.CARDINALITY.toLocaleString() : '-'}
                                </td>
                                <td className="px-4 py-2 text-slate-600 text-xs text-right">
                                  {row.BYTES !== null && row.BYTES !== undefined ? row.BYTES.toLocaleString() : '-'}
                                </td>
                                <td className="px-4 py-2 text-slate-600 text-xs text-right">
                                  {row.CPU_COST !== null && row.CPU_COST !== undefined ? row.CPU_COST.toLocaleString() : '-'}
                                </td>
                                <td className="px-4 py-2 text-slate-600 text-xs text-right">
                                  {row.IO_COST !== null && row.IO_COST !== undefined ? row.IO_COST.toLocaleString() : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Predicates Section */}
                      {explainPlan.some((row: any) => row.ACCESS_PREDICATES || row.FILTER_PREDICATES) && (
                        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <Filter className="h-4 w-4 text-blue-600" />
                            Predicates (조건절)
                          </h3>
                          <div className="space-y-3">
                            {explainPlan
                              .filter((row: any) => row.ACCESS_PREDICATES || row.FILTER_PREDICATES)
                              .map((row: any) => (
                                <div key={row.ID} className="bg-white border border-slate-200 rounded p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-semibold text-slate-500">ID {row.ID}:</span>
                                    <span className="text-xs text-slate-700 font-mono">
                                      {row.OPERATION} {row.OPTIONS}
                                    </span>
                                    {row.OBJECT_NAME && (
                                      <span className="text-xs text-slate-600">({row.OBJECT_NAME})</span>
                                    )}
                                  </div>
                                  {row.ACCESS_PREDICATES && (
                                    <div className="mb-2">
                                      <p className="text-xs font-medium text-blue-700 mb-1">Access Predicates:</p>
                                      <code className="text-xs text-slate-700 bg-blue-50 px-2 py-1 rounded block">
                                        {row.ACCESS_PREDICATES}
                                      </code>
                                    </div>
                                  )}
                                  {row.FILTER_PREDICATES && (
                                    <div>
                                      <p className="text-xs font-medium text-green-700 mb-1">Filter Predicates:</p>
                                      <code className="text-xs text-slate-700 bg-green-50 px-2 py-1 rounded block">
                                        {row.FILTER_PREDICATES}
                                      </code>
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="history" className="m-0 flex flex-col bg-white h-full data-[state=active]:flex">
                <div className="p-4 border-b border-slate-200 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <p className="font-medium">SQL History</p>
                      <span className="text-slate-400 text-xs">({queryHistory.length} queries)</span>
                    </div>
                    {queryHistory.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setQueryHistory([])}
                        className="h-7 gap-1.5 text-xs"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear History
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-auto">
                  <div className="border-b border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-slate-700">Timestamp</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-700">Query</th>
                          <th className="px-4 py-2 text-left font-medium text-slate-700">Status</th>
                          <th className="px-4 py-2 text-right font-medium text-slate-700">Duration</th>
                          <th className="px-4 py-2 text-right font-medium text-slate-700">Rows</th>
                        </tr>
                      </thead>
                      <tbody>
                        {queryHistory.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">
                              No execution history yet. Run a query to see history here.
                            </td>
                          </tr>
                        ) : (
                          queryHistory.map((entry) => (
                            <tr
                              key={entry.id}
                              className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                              onClick={() => {
                                // Allow clicking to load query back into editor
                                const fullQuery = entry.query;
                                if (
                                  confirm(`Load this query into the editor?\n\n${fullQuery}`)
                                ) {
                                  setSqlQuery(fullQuery);
                                }
                              }}
                            >
                              <td className="px-4 py-2 text-slate-600 text-xs whitespace-nowrap">
                                {new Date(entry.timestamp).toLocaleString()}
                              </td>
                              <td className="px-4 py-2 text-slate-700 font-mono text-xs truncate max-w-xs">
                                {entry.query}
                              </td>
                              <td className="px-4 py-2">
                                {entry.status === 'success' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                    Success
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"
                                    title={entry.error}
                                  >
                                    Error
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-slate-600 text-xs text-right">{entry.duration}ms</td>
                              <td className="px-4 py-2 text-slate-600 text-xs text-right">
                                {entry.rowCount || '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SQLEditorPage() {
  return (
    <StandaloneLayout>
      <SQLEditorContent />
    </StandaloneLayout>
  );
}
