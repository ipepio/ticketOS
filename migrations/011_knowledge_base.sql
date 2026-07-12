-- P1-04: Knowledge Base and Search

-- Article Categories
CREATE TABLE IF NOT EXISTS article_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    parent_id UUID REFERENCES article_categories(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_article_categories_workspace ON article_categories (workspace_id);

-- Articles
CREATE TABLE IF NOT EXISTS articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    audience TEXT NOT NULL DEFAULT 'authenticated' CHECK (audience IN ('internal', 'authenticated', 'public')),
    category_id UUID REFERENCES article_categories(id) ON DELETE SET NULL,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    UNIQUE(workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_articles_workspace ON articles (workspace_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_articles_audience ON articles (workspace_id, audience);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category_id) WHERE category_id IS NOT NULL;

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_articles_search ON articles
    USING gin(to_tsvector('english', title || ' ' || content))
    WHERE status = 'published';
