import type { NotificationPriority } from '@/types/common';
import type { Permission } from '@/types/permissions';

export interface Notification {
  id: string;
  recipientId: string;
  priority: NotificationPriority;
  title: string;
  message: string;
  eventSource: string;
  linkTo: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface CreateNotificationInput {
  recipientId: string;
  priority: NotificationPriority;
  title: string;
  message: string;
  eventSource: string;
  linkTo?: string;
}

export interface BroadcastInput {
  permission: Permission;
  priority: NotificationPriority;
  title: string;
  message: string;
  eventSource: string;
  linkTo?: string;
}
