// Knowledge Base module — Workspace articles with audience visibility
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, Timestamp, Uuid } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Article
// ---------------------------------------------------------------------------

export type ArticleStatus = 'draft' | 'published';
export type ArticleAudience = 'internal' | 'authenticated' | 'public';

export interface Article {
  id: Uuid;
  workspaceId: WorkspaceId;
  title: string;
  slug: string;
  content: string;
  status: ArticleStatus;
  audience: ArticleAudience;
  categoryId: Uuid | null;
  authorId: Uuid;
  viewCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt: Timestamp | null;
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export interface ArticleCategory {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  slug: string;
  parentId: Uuid | null;
  sortOrder: number;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateArticleInput {
  workspaceId: WorkspaceId;
  title: string;
  content: string;
  audience: ArticleAudience;
  categoryId?: Uuid | null;
  authorId: Uuid;
}

export interface UpdateArticleInput {
  title?: string;
  content?: string;
  audience?: ArticleAudience;
  categoryId?: Uuid | null;
  status?: ArticleStatus;
}

export interface CreateCategoryInput {
  workspaceId: WorkspaceId;
  name: string;
  parentId?: Uuid | null;
  sortOrder?: number;
}

export interface SearchArticlesInput {
  workspaceId: WorkspaceId;
  query: string;
  audience?: ArticleAudience;
  categoryId?: Uuid | null;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  articles: Article[];
  total: number;
}

// ---------------------------------------------------------------------------
// Knowledge Base Module interface
// ---------------------------------------------------------------------------

export interface KnowledgeBaseModule {
  // Articles
  createArticle(input: CreateArticleInput): Promise<Article>;
  updateArticle(id: Uuid, input: UpdateArticleInput): Promise<Article>;
  deleteArticle(id: Uuid): Promise<void>;
  getArticle(id: Uuid): Promise<Article | null>;
  getArticleBySlug(workspaceId: WorkspaceId, slug: string): Promise<Article | null>;
  listArticles(workspaceId: WorkspaceId, options?: { status?: ArticleStatus; audience?: ArticleAudience }): Promise<Article[]>;
  publishArticle(id: Uuid): Promise<Article>;
  archiveArticle(id: Uuid): Promise<Article>;

  // Categories
  createCategory(input: CreateCategoryInput): Promise<ArticleCategory>;
  updateCategory(id: Uuid, input: Partial<CreateCategoryInput>): Promise<ArticleCategory>;
  deleteCategory(id: Uuid): Promise<void>;
  listCategories(workspaceId: WorkspaceId): Promise<ArticleCategory[]>;

  // Search
  searchArticles(input: SearchArticlesInput): Promise<SearchResult>;

  // Audience filtering
  filterByAudience(articles: Article[], userAudience: 'anonymous' | 'authenticated' | 'agent'): Article[];
}
