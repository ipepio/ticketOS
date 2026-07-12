import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresKnowledgeBase } from './postgres.js';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE, verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS article_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, slug TEXT NOT NULL,
    parent_id UUID REFERENCES article_categories(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, slug)
  )`,
  `CREATE TABLE IF NOT EXISTS articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL, slug TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    audience TEXT NOT NULL DEFAULT 'authenticated' CHECK (audience IN ('internal', 'authenticated', 'public')),
    category_id UUID REFERENCES article_categories(id) ON DELETE SET NULL,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    UNIQUE(workspace_id, slug)
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('KnowledgeBase Module', () => {
  let pool: Pool;
  let kb: PostgresKnowledgeBase;
  let workspaceId: string;
  let userId: string;

  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) {
      await pool.query(sql).catch(() => {});
    }

    await pool.query('DELETE FROM articles');
    await pool.query('DELETE FROM article_categories');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');

    kb = new PostgresKnowledgeBase(pool);

    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'KB Test WS'],
    );
    workspaceId = wsRows[0]!.id;

    const { rows: userRows } = await pool.query(
      'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'kb-test@test.com'],
    );
    userId = userRows[0]!.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Articles', () => {
    it('creates a draft article', async () => {
      const article = await kb.createArticle({
        workspaceId,
        title: 'How to Reset Password',
        content: 'Step 1: Go to settings...',
        audience: 'public',
        authorId: userId,
      });

      expect(article.id).toBeDefined();
      expect(article.title).toBe('How to Reset Password');
      expect(article.slug).toBe('how-to-reset-password');
      expect(article.status).toBe('draft');
      expect(article.audience).toBe('public');
    });

    it('publishes an article', async () => {
      const article = await kb.createArticle({
        workspaceId,
        title: 'Publish Me',
        content: 'Content',
        audience: 'authenticated',
        authorId: userId,
      });

      const published = await kb.publishArticle(article.id);
      expect(published.status).toBe('published');
      expect(published.publishedAt).not.toBeNull();
    });

    it('lists articles by status', async () => {
      await kb.createArticle({
        workspaceId,
        title: 'Draft Article',
        content: 'Draft',
        audience: 'public',
        authorId: userId,
      });
      const a2 = await kb.createArticle({
        workspaceId,
        title: 'Published Article',
        content: 'Published',
        audience: 'public',
        authorId: userId,
      });
      await kb.publishArticle(a2.id);

      const drafts = await kb.listArticles(workspaceId, { status: 'draft' });
      expect(drafts).toHaveLength(1);
      expect(drafts[0]!.title).toBe('Draft Article');

      const published = await kb.listArticles(workspaceId, { status: 'published' });
      expect(published).toHaveLength(1);
      expect(published[0]!.title).toBe('Published Article');
    });

    it('gets an article by slug', async () => {
      await kb.createArticle({
        workspaceId,
        title: 'Slug Test',
        content: 'Content',
        audience: 'public',
        authorId: userId,
      });

      const found = await kb.getArticleBySlug(workspaceId, 'slug-test');
      expect(found).not.toBeNull();
      expect(found!.title).toBe('Slug Test');
    });

    it('deletes an article', async () => {
      const article = await kb.createArticle({
        workspaceId,
        title: 'Delete Me',
        content: 'Content',
        audience: 'public',
        authorId: userId,
      });
      await kb.deleteArticle(article.id);
      const found = await kb.getArticle(article.id);
      expect(found).toBeNull();
    });
  });

  describe('Categories', () => {
    it('creates a category', async () => {
      const cat = await kb.createCategory({
        workspaceId,
        name: 'Getting Started',
      });
      expect(cat.id).toBeDefined();
      expect(cat.name).toBe('Getting Started');
      expect(cat.slug).toBe('getting-started');
    });

    it('lists categories', async () => {
      await kb.createCategory({ workspaceId, name: 'Category A' });
      await kb.createCategory({ workspaceId, name: 'Category B' });

      const cats = await kb.listCategories(workspaceId);
      expect(cats).toHaveLength(2);
    });
  });

  describe('Audience filtering', () => {
    it('filters articles by audience', async () => {
      await kb.createArticle({
        workspaceId,
        title: 'Public Article',
        content: 'Public',
        audience: 'public',
        authorId: userId,
      });
      await kb.createArticle({
        workspaceId,
        title: 'Internal Article',
        content: 'Internal',
        audience: 'internal',
        authorId: userId,
      });
      await kb.createArticle({
        workspaceId,
        title: 'Auth Article',
        content: 'Auth',
        audience: 'authenticated',
        authorId: userId,
      });

      const all = await kb.listArticles(workspaceId);

      const publicOnly = kb.filterByAudience(all, 'anonymous');
      expect(publicOnly).toHaveLength(1);
      expect(publicOnly[0]!.audience).toBe('public');

      const auth = kb.filterByAudience(all, 'authenticated');
      expect(auth).toHaveLength(2); // public + authenticated

      const agent = kb.filterByAudience(all, 'agent');
      expect(agent).toHaveLength(3); // all
    });
  });
});
