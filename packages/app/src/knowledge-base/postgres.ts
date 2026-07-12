import type { Pool } from 'pg';
import type {
  KnowledgeBaseModule,
  Article,
  ArticleCategory,
  CreateArticleInput,
  UpdateArticleInput,
  CreateCategoryInput,
  SearchArticlesInput,
  SearchResult,
  ArticleStatus,
  ArticleAudience,
} from '@ticketos/domain';
import type { WorkspaceId, Uuid } from '@ticketos/shared';

interface ArticleRow {
  id: string;
  workspace_id: string;
  title: string;
  slug: string;
  content: string;
  status: string;
  audience: string;
  category_id: string | null;
  author_id: string;
  view_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

interface CategoryRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
}

function mapArticle(r: ArticleRow): Article {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    title: r.title,
    slug: r.slug,
    content: r.content,
    status: r.status as ArticleStatus,
    audience: r.audience as ArticleAudience,
    categoryId: r.category_id,
    authorId: r.author_id,
    viewCount: r.view_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
  };
}

function mapCategory(r: CategoryRow): ArticleCategory {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    slug: r.slug,
    parentId: r.parent_id,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 200);
}

export class PostgresKnowledgeBase implements KnowledgeBaseModule {
  constructor(private pool: Pool) {}

  // ---------------------------------------------------------------------------
  // Articles
  // ---------------------------------------------------------------------------

  async createArticle(input: CreateArticleInput): Promise<Article> {
    const slug = slugify(input.title);
    const { rows } = await this.pool.query<ArticleRow>(
      `INSERT INTO articles (workspace_id, title, slug, content, status, audience, category_id, author_id)
       VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7) RETURNING *`,
      [
        input.workspaceId,
        input.title,
        slug,
        input.content,
        input.audience,
        input.categoryId ?? null,
        input.authorId,
      ],
    );
    return mapArticle(rows[0]!);
  }

  async updateArticle(id: Uuid, input: UpdateArticleInput): Promise<Article> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.title !== undefined) { sets.push(`title = $${idx++}`); values.push(input.title); sets.push(`slug = $${idx++}`); values.push(slugify(input.title)); }
    if (input.content !== undefined) { sets.push(`content = $${idx++}`); values.push(input.content); }
    if (input.audience !== undefined) { sets.push(`audience = $${idx++}`); values.push(input.audience); }
    if (input.categoryId !== undefined) { sets.push(`category_id = $${idx++}`); values.push(input.categoryId); }
    if (input.status !== undefined) {
      sets.push(`status = $${idx++}`); values.push(input.status);
      if (input.status === 'published') { sets.push('published_at = NOW()'); }
    }
    sets.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await this.pool.query<ArticleRow>(
      `UPDATE articles SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!rows[0]) throw new Error(`Article not found: ${id}`);
    return mapArticle(rows[0]);
  }

  async deleteArticle(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM articles WHERE id = $1', [id]);
  }

  async getArticle(id: Uuid): Promise<Article | null> {
    const { rows } = await this.pool.query<ArticleRow>(
      'SELECT * FROM articles WHERE id = $1',
      [id],
    );
    return rows[0] ? mapArticle(rows[0]) : null;
  }

  async getArticleBySlug(workspaceId: WorkspaceId, slug: string): Promise<Article | null> {
    const { rows } = await this.pool.query<ArticleRow>(
      'SELECT * FROM articles WHERE workspace_id = $1 AND slug = $2',
      [workspaceId, slug],
    );
    return rows[0] ? mapArticle(rows[0]) : null;
  }

  async listArticles(
    workspaceId: WorkspaceId,
    options?: { status?: ArticleStatus; audience?: ArticleAudience },
  ): Promise<Article[]> {
    let sql = 'SELECT * FROM articles WHERE workspace_id = $1';
    const values: unknown[] = [workspaceId];
    let idx = 2;

    if (options?.status) { sql += ` AND status = $${idx++}`; values.push(options.status); }
    if (options?.audience) { sql += ` AND audience = $${idx++}`; values.push(options.audience); }

    sql += ' ORDER BY updated_at DESC';
    const { rows } = await this.pool.query<ArticleRow>(sql, values);
    return rows.map(mapArticle);
  }

  async publishArticle(id: Uuid): Promise<Article> {
    return this.updateArticle(id, { status: 'published' });
  }

  async archiveArticle(id: Uuid): Promise<Article> {
    return this.updateArticle(id, { status: 'draft' });
  }

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  async createCategory(input: CreateCategoryInput): Promise<ArticleCategory> {
    const slug = slugify(input.name);
    const { rows } = await this.pool.query<CategoryRow>(
      `INSERT INTO article_categories (workspace_id, name, slug, parent_id, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        input.workspaceId,
        input.name,
        slug,
        input.parentId ?? null,
        input.sortOrder ?? 0,
      ],
    );
    return mapCategory(rows[0]!);
  }

  async updateCategory(id: Uuid, input: Partial<CreateCategoryInput>): Promise<ArticleCategory> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); sets.push(`slug = $${idx++}`); values.push(slugify(input.name)); }
    if (input.parentId !== undefined) { sets.push(`parent_id = $${idx++}`); values.push(input.parentId); }
    if (input.sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); values.push(input.sortOrder); }

    values.push(id);
    const { rows } = await this.pool.query<CategoryRow>(
      `UPDATE article_categories SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!rows[0]) throw new Error(`Category not found: ${id}`);
    return mapCategory(rows[0]);
  }

  async deleteCategory(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM article_categories WHERE id = $1', [id]);
  }

  async listCategories(workspaceId: WorkspaceId): Promise<ArticleCategory[]> {
    const { rows } = await this.pool.query<CategoryRow>(
      'SELECT * FROM article_categories WHERE workspace_id = $1 ORDER BY sort_order, name',
      [workspaceId],
    );
    return rows.map(mapCategory);
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  async searchArticles(input: SearchArticlesInput): Promise<SearchResult> {
    const tsQuery = input.query.split(/\s+/).filter(Boolean).join(' & ');

    let sql = `
      SELECT *, ts_rank(to_tsvector('english', title || ' ' || content), to_tsquery('english', $2)) AS rank
      FROM articles
      WHERE workspace_id = $1
        AND status = 'published'
        AND to_tsvector('english', title || ' ' || content) @@ to_tsquery('english', $2)
    `;
    const values: unknown[] = [input.workspaceId, tsQuery];
    let idx = 3;

    if (input.audience) { sql += ` AND audience = $${idx++}`; values.push(input.audience); }
    if (input.categoryId) { sql += ` AND category_id = $${idx++}`; values.push(input.categoryId); }

    sql += ` ORDER BY rank DESC`;
    if (input.limit) { sql += ` LIMIT $${idx++}`; values.push(input.limit); }
    if (input.offset) { sql += ` OFFSET $${idx++}`; values.push(input.offset); }

    const { rows } = await this.pool.query<ArticleRow & { rank: number }>(sql, values);
    return {
      articles: rows.map(mapArticle),
      total: rows.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Audience filtering
  // ---------------------------------------------------------------------------

  filterByAudience(articles: Article[], userAudience: 'anonymous' | 'authenticated' | 'agent'): Article[] {
    return articles.filter((a) => {
      if (userAudience === 'agent') return true;
      if (userAudience === 'authenticated') return a.audience !== 'internal';
      return a.audience === 'public';
    });
  }
}
