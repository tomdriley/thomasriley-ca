// Import the ok and err functions from the neverthrow library for creating result objects
import { err, ok } from "neverthrow";

// Import the ArticleResult, ArticlesResult, and UncaughtError types from the fetch-article module
import { ArticleResult, ArticlesResult, UncaughtError } from "./fetch-article";

// Import the NodeCache class for caching objects in memory
import NodeCache from "node-cache";

// Import the Article and ArticleTitleDate interfaces from the article-schemas module
import { Article, ArticleTitleDate } from "../article-schemas";

// Define constants for cache keys
const ARTICLE_LIST_KEY = "__ARTICLE_LIST__";

// Initialize a new NodeCache instance for caching articles
const articleCache = new NodeCache();

// Define a function to get an article from the cache by its name
const getArticleFromCache = (articleName: string): ArticleResult => {
  const article = articleCache.get<Article>(articleName);
  if (article == undefined) {
    return err(new UncaughtError(`Article not found: ${articleName}`));
  } else {
    return ok(article);
  }
};

// Define a function to get the list of articles from the cache
const getArticlesFromCache = (): ArticlesResult => {
  const articles = articleCache.get<ArticleTitleDate[]>(ARTICLE_LIST_KEY);
  if (articles == undefined) {
    return err(new UncaughtError("Article list not found in cache"));
  } else {
    return ok(articles);
  }
};

// Define a function to cache an individual article
const cacheArticle = (article: ArticleResult): void => {
  if (article.isOk()) {
    articleCache.set<Article>(article.value.name, article.value);
    console.log("Cached: ", article.value.name);
  }
  return;
};

// Define a function to cache the list of articles
const cacheArticles = (articles: ArticlesResult): void => {
  if (articles.isOk()) {
    articleCache.set<ArticleTitleDate[]>(ARTICLE_LIST_KEY, articles.value);
    console.log("Cached: ", articles.value);
  }
};

// Define a function to check if an article is already cached by its name
const articleIsCached = (articleName: string): boolean => {
  return articleCache.has(articleName);
};

// Define a function to check if the list of articles is already cached
const articlesAreCached = (): boolean => {
  return articleCache.has(ARTICLE_LIST_KEY);
};

// Export the functions for getting, caching, and checking cached articles
export {
  getArticleFromCache,
  cacheArticle,
  articleIsCached,
  getArticlesFromCache,
  cacheArticles,
  articlesAreCached,
};
