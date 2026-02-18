'use client';

import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { Text } from '@mantine/core';
import { IconCheck, IconX, IconInfoCircle, IconAlertTriangle } from '@tabler/icons-react';

/**
 * Mantine 알림 유틸리티
 *
 * @example
 * notify.success('저장되었습니다');
 * notify.error('저장에 실패했습니다', '오류');
 * notify.info('처리 중입니다...');
 * notify.warning('주의가 필요합니다');
 */
export const notify = {
  success: (message: string, title?: string) => {
    notifications.show({
      title: title || '성공',
      message,
      color: 'green',
      icon: <IconCheck size={18} />,
      autoClose: 4000,
    });
  },

  error: (message: string, title?: string) => {
    notifications.show({
      title: title || '오류',
      message,
      color: 'red',
      icon: <IconX size={18} />,
      autoClose: 6000,
    });
  },

  info: (message: string, title?: string) => {
    notifications.show({
      title: title || '알림',
      message,
      color: 'blue',
      icon: <IconInfoCircle size={18} />,
      autoClose: 4000,
    });
  },

  warning: (message: string, title?: string) => {
    notifications.show({
      title: title || '경고',
      message,
      color: 'yellow',
      icon: <IconAlertTriangle size={18} />,
      autoClose: 5000,
    });
  },

  loading: (message: string, title?: string) => {
    return notifications.show({
      title: title || '처리 중',
      message,
      color: 'blue',
      loading: true,
      autoClose: false,
      withCloseButton: false,
    });
  },

  update: (id: string, options: {
    title?: string;
    message: string;
    color?: string;
    icon?: React.ReactNode;
    loading?: boolean;
    autoClose?: number | boolean;
  }) => {
    notifications.update({
      id,
      ...options,
      autoClose: options.autoClose ?? 4000,
    });
  },

  hide: (id: string) => {
    notifications.hide(id);
  },
};

/**
 * Mantine 모달 유틸리티
 *
 * @example
 * modal.confirm({
 *   title: '삭제 확인',
 *   message: '정말로 삭제하시겠습니까?',
 *   onConfirm: () => handleDelete(),
 * });
 *
 * modal.alert({
 *   title: '알림',
 *   message: '작업이 완료되었습니다.',
 * });
 */
export const modal = {
  confirm: (options: {
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmColor?: string;
    centered?: boolean;
  }) => {
    modals.openConfirmModal({
      title: options.title,
      centered: options.centered ?? true,
      children: <Text size="sm">{options.message}</Text>,
      labels: {
        confirm: options.confirmLabel || '확인',
        cancel: options.cancelLabel || '취소',
      },
      confirmProps: { color: options.confirmColor || 'blue' },
      onConfirm: options.onConfirm,
      onCancel: options.onCancel,
    });
  },

  confirmDelete: (options: {
    title?: string;
    message: string;
    itemName?: string;
    onConfirm: () => void | Promise<void>;
  }) => {
    modals.openConfirmModal({
      title: options.title || '삭제 확인',
      centered: true,
      children: (
        <Text size="sm">
          {options.message}
          {options.itemName && (
            <Text component="span" fw={600} c="red">
              {` "${options.itemName}"`}
            </Text>
          )}
        </Text>
      ),
      labels: { confirm: '삭제', cancel: '취소' },
      confirmProps: { color: 'red' },
      onConfirm: options.onConfirm,
    });
  },

  alert: (options: {
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm?: () => void;
  }) => {
    modals.open({
      title: options.title,
      centered: true,
      children: (
        <>
          <Text size="sm" mb="md">{options.message}</Text>
        </>
      ),
      onClose: options.onConfirm,
    });
  },

  custom: modals.open,
  close: modals.close,
  closeAll: modals.closeAll,
};

/**
 * NProgress 유틸리티 (페이지 전환 진행 표시)
 */
export { nprogress } from '@mantine/nprogress';

/**
 * 등급 색상 매핑
 */
export const gradeColors: Record<string, string> = {
  A: 'green',
  B: 'lime',
  C: 'yellow',
  D: 'orange',
  F: 'red',
};

/**
 * 등급 설명
 */
export const gradeDescriptions: Record<string, string> = {
  A: '우수 (< 200ms)',
  B: '양호 (< 500ms)',
  C: '보통 (< 1000ms)',
  D: '주의 (< 2000ms)',
  F: '위험 (> 2000ms)',
};

/**
 * 숫자 포맷팅
 */
export const formatNumber = (value: number, options?: {
  decimals?: number;
  suffix?: string;
  compact?: boolean;
}): string => {
  const { decimals = 0, suffix = '', compact = false } = options || {};

  if (compact && value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M${suffix}`;
  }
  if (compact && value >= 1000) {
    return `${(value / 1000).toFixed(1)}K${suffix}`;
  }

  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;
};

/**
 * 시간 포맷팅 (ms -> 적절한 단위)
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
};

/**
 * 바이트 포맷팅
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};
