/**
 * AgriPrice Phase 4: Persistent Notifications Management
 *
 * Implements recipient-isolated notification fetching and status updates
 * against Supabase table `public.user_notifications`.
 *
 * Security & Data Integrity:
 * - Recipient Isolation: Users can only query notifications where recipient_profile_id = callerProfileId.
 * - Read Status Transitions: Marked via server RPC or authenticated RLS update.
 * - Defensive Schema Fallback: If public.user_notifications is not yet installed in Supabase,
 *   cleanly reports isSchemaInstalled = false without crashing or masking errors.
 * - No Private Leaks: Notification payloads never expose private farm GPS coordinates or street addresses.
 */

import { createClient, isSupabaseConfigured } from './client.ts';

export interface PersistentNotificationRecord {
  id: string;
  recipientProfileId: string;
  category: 'listing' | 'offer' | 'order' | 'payment' | 'storage' | 'dispute' | 'system';
  severity: 'info' | 'success' | 'warning' | 'critical';
  title: string;
  description: string;
  actionUrlTab?: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
  timestamp: string;
  isLiveDatabaseRecord: boolean;
}

export interface CreateNotificationParams {
  recipientProfileId: string;
  category: 'listing' | 'offer' | 'order' | 'payment' | 'storage' | 'dispute' | 'system';
  severity?: 'info' | 'success' | 'warning' | 'critical';
  title: string;
  description: string;
  actionUrlTab?: string;
  metadata?: Record<string, unknown>;
}

interface DynamicDatabaseClient {
  from(table: string): {
    select(columns?: string): {
      eq(column: string, value: unknown): {
        order(column: string, options?: { ascending?: boolean }): Promise<{
          data: Record<string, unknown>[] | null;
          error: { code?: string; message: string } | null;
        }>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): {
        eq(column2: string, value2: unknown): Promise<{
          data: unknown;
          error: { code?: string; message: string } | null;
        }>;
      };
    };
    insert(values: Record<string, unknown> | Record<string, unknown>[]): Promise<{
      data: unknown;
      error: { code?: string; message: string } | null;
    }>;
  };
  rpc(fn: string, params: Record<string, unknown>): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
}

/**
 * Formats ISO timestamps into friendly relative labels.
 */
function formatRelativeTimestamp(isoDate: string): string {
  try {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return 'Recently';
  }
}

/**
 * Fetches notifications belonging to the authenticated profile under RLS.
 */
export async function fetchUserNotifications(
  callerProfileId: string
): Promise<{
  notifications: PersistentNotificationRecord[];
  error: string | null;
  isSchemaInstalled: boolean;
}> {
  if (!callerProfileId) {
    return {
      notifications: [],
      error: 'Authentication required: Caller profile ID is missing.',
      isSchemaInstalled: false,
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      notifications: [],
      error: 'Supabase credentials are not configured.',
      isSchemaInstalled: false,
    };
  }

  try {
    const supabase = createClient() as unknown as DynamicDatabaseClient;
    const { data, error } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('recipient_profile_id', callerProfileId)
      .order('created_at', { ascending: false });

    if (error) {
      const isMissingTable = error.code === 'PGRST205' || error.message.includes('schema cache');
      return {
        notifications: [],
        error: isMissingTable
          ? 'Table public.user_notifications is not yet installed in the live database. (See docs/hotfix-phase4-notifications-disputes.sql).'
          : error.message,
        isSchemaInstalled: !isMissingTable,
      };
    }

    if (!data || !Array.isArray(data)) {
      return {
        notifications: [],
        error: null,
        isSchemaInstalled: true,
      };
    }

    const mapped: PersistentNotificationRecord[] = data.map((n) => ({
      id: String(n.id),
      recipientProfileId: String(n.recipient_profile_id),
      category: (n.category as PersistentNotificationRecord['category']) || 'system',
      severity: (n.severity as PersistentNotificationRecord['severity']) || 'info',
      title: String(n.title),
      description: String(n.description),
      actionUrlTab: n.action_url_tab ? String(n.action_url_tab) : undefined,
      metadata: (n.metadata as Record<string, unknown>) || {},
      read: Boolean(n.is_read),
      readAt: n.read_at ? String(n.read_at) : null,
      createdAt: String(n.created_at),
      timestamp: formatRelativeTimestamp(String(n.created_at)),
      isLiveDatabaseRecord: true,
    }));

    return {
      notifications: mapped,
      error: null,
      isSchemaInstalled: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query notifications.';
    return {
      notifications: [],
      error: msg,
      isSchemaInstalled: false,
    };
  }
}

/**
 * Updates a notification to read status with strict recipient authorization.
 */
export async function markNotificationAsRead(
  notificationId: string,
  callerProfileId: string
): Promise<{ success: boolean; message: string; isSavedToDatabase: boolean }> {
  if (!notificationId || !callerProfileId) {
    return {
      success: false,
      message: 'Invalid notification or profile reference.',
      isSavedToDatabase: false,
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: 'Supabase credentials are not configured.',
      isSavedToDatabase: false,
    };
  }

  try {
    const supabase = createClient() as unknown as DynamicDatabaseClient;

    // Call stored procedure or direct update under RLS
    const { error } = await supabase
      .from('user_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('recipient_profile_id', callerProfileId);

    if (error) {
      return {
        success: false,
        message: error.message,
        isSavedToDatabase: false,
      };
    }

    return {
      success: true,
      message: 'Notification marked as read in database.',
      isSavedToDatabase: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update notification.';
    return {
      success: false,
      message: msg,
      isSavedToDatabase: false,
    };
  }
}

/**
 * Marks all notifications belonging to the caller as read.
 */
export async function markAllUserNotificationsAsRead(
  callerProfileId: string
): Promise<{ success: boolean; message: string; isSavedToDatabase: boolean }> {
  if (!callerProfileId) {
    return {
      success: false,
      message: 'Caller profile ID required.',
      isSavedToDatabase: false,
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: 'Supabase credentials are not configured.',
      isSavedToDatabase: false,
    };
  }

  try {
    const supabase = createClient() as unknown as DynamicDatabaseClient;
    const { error } = await supabase
      .from('user_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('recipient_profile_id', callerProfileId)
      .eq('is_read', false);

    if (error) {
      return {
        success: false,
        message: error.message,
        isSavedToDatabase: false,
      };
    }

    return {
      success: true,
      message: 'All notifications marked as read in database.',
      isSavedToDatabase: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update notifications.';
    return {
      success: false,
      message: msg,
      isSavedToDatabase: false,
    };
  }
}

/**
 * Inserts a persistent notification for an event (offer, order, payment, dispute).
 */
export async function createPersistentNotification(
  params: CreateNotificationParams,
  callerProfileId?: string
): Promise<{ success: boolean; message: string; isSavedToDatabase: boolean }> {
  if (!params.recipientProfileId || !params.title || !params.description) {
    return {
      success: false,
      message: 'Missing required notification fields: recipientProfileId, title, and description are required.',
      isSavedToDatabase: false,
    };
  }

  void callerProfileId;

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: 'Supabase credentials are not configured.',
      isSavedToDatabase: false,
    };
  }

  try {
    const supabase = createClient() as unknown as DynamicDatabaseClient;
    const { error } = await supabase.from('user_notifications').insert({
      recipient_profile_id: params.recipientProfileId,
      category: params.category,
      severity: params.severity || 'info',
      title: params.title.trim(),
      description: params.description.trim(),
      action_url_tab: params.actionUrlTab || null,
      metadata: params.metadata || {},
      is_read: false,
    });

    if (error) {
      return {
        success: false,
        message: error.message,
        isSavedToDatabase: false,
      };
    }

    return {
      success: true,
      message: 'Notification recorded successfully.',
      isSavedToDatabase: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create notification.';
    return {
      success: false,
      message: msg,
      isSavedToDatabase: false,
    };
  }
}
