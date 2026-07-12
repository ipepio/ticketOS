-- P1-05: Notifications, SSE, i18n

-- Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('in-app', 'email')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, workspace_id, event, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences (user_id, workspace_id);

-- In-app Notifications
CREATE TABLE IF NOT EXISTS in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    read_status TEXT NOT NULL DEFAULT 'unread' CHECK (read_status IN ('unread', 'read')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON in_app_notifications (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON in_app_notifications (user_id, workspace_id, read_status) WHERE read_status = 'unread';
CREATE INDEX IF NOT EXISTS idx_notifications_ticket ON in_app_notifications (ticket_id) WHERE ticket_id IS NOT NULL;
