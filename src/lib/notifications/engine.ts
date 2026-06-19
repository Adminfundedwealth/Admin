import { createAdminClient } from '@/lib/supabase/admin';
import type { Permission } from '@/types/permissions';
import type { Notification, CreateNotificationInput, BroadcastInput } from './types';

/**
 * Notification Engine - delivers real-time notifications to staff members.
 * Uses Supabase Realtime for instant delivery (≤5 seconds).
 */
export class NotificationEngine {
  /**
   * Send a notification to a single staff member.
   */
  async send(input: CreateNotificationInput): Promise<Notification> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        recipient_id: input.recipientId,
        priority: input.priority,
        title: input.title,
        message: input.message,
        event_source: input.eventSource,
        link_to: input.linkTo || null,
        read: false,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to send notification: ${error?.message}`);
    }

    return this.mapRow(data);
  }

  /**
   * Broadcast a notification to all staff members with a specific permission.
   * Resolves recipients by checking role_permissions through staff_role_assignments.
   */
  async broadcast(input: BroadcastInput): Promise<void> {
    const supabase = createAdminClient();

    // Find all staff members who have the required permission
    const { data: staffWithPermission, error: queryError } = await supabase
      .from('staff_role_assignments')
      .select(`
        staff_id,
        roles!inner (
          role_permissions!inner (
            permission
          )
        )
      `)
      .eq('roles.role_permissions.permission', input.permission);

    if (queryError || !staffWithPermission) {
      console.error('Failed to resolve broadcast recipients:', queryError?.message);
      return;
    }

    // Also include Founders and Co-Founders (full access)
    const { data: fullAccessStaff } = await supabase
      .from('staff_role_assignments')
      .select('staff_id, roles!inner(name)')
      .in('roles.name', ['Founder', 'Co-Founder']);

    // Deduplicate recipients
    const recipientIds = new Set<string>();
    for (const row of staffWithPermission) {
      recipientIds.add(row.staff_id);
    }
    if (fullAccessStaff) {
      for (const row of fullAccessStaff) {
        recipientIds.add(row.staff_id);
      }
    }

    if (recipientIds.size === 0) return;

    // Batch insert notifications for all recipients
    const notifications = Array.from(recipientIds).map((recipientId) => ({
      recipient_id: recipientId,
      priority: input.priority,
      title: input.title,
      message: input.message,
      event_source: input.eventSource,
      link_to: input.linkTo || null,
      read: false,
    }));

    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (insertError) {
      console.error('Failed to broadcast notifications:', insertError.message);
    }
  }

  /**
   * Mark a notification as read.
   */
  async markRead(notificationId: string, staffId: string): Promise<void> {
    const supabase = createAdminClient();

    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('recipient_id', staffId);
  }

  /**
   * Mark all notifications as read for a staff member.
   */
  async markAllRead(staffId: string): Promise<void> {
    const supabase = createAdminClient();

    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('recipient_id', staffId)
      .eq('read', false);
  }

  /**
   * Get unread notifications for a staff member.
   */
  async getUnread(staffId: string, limit = 20): Promise<Notification[]> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', staffId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.map(this.mapRow);
  }

  /**
   * Get notification count (unread) for a staff member.
   */
  async getUnreadCount(staffId: string): Promise<number> {
    const supabase = createAdminClient();

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', staffId)
      .eq('read', false);

    if (error) return 0;
    return count || 0;
  }

  private mapRow(row: Record<string, unknown>): Notification {
    return {
      id: row.id as string,
      recipientId: row.recipient_id as string,
      priority: row.priority as Notification['priority'],
      title: row.title as string,
      message: row.message as string,
      eventSource: row.event_source as string,
      linkTo: row.link_to as string | null,
      read: row.read as boolean,
      readAt: row.read_at as string | null,
      createdAt: row.created_at as string,
    };
  }
}

/** Singleton instance */
export const notificationEngine = new NotificationEngine();
