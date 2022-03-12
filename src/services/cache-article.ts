import { err, ok } from "neverthrow";
import { ArticleResult, ArticlesResult, UncaughtError } from "./fetch-article";
import NodeCache from "node-cache";
import { Article, ArticleTitleDate } from "../article-schemas";

const ARTICLE_LIST_KEY = "__ARTICLE_LIST__";
const articleCache = new NodeCache();

const getArticleFromCache = (articleName: string): ArticleResult => {
  const article = articleCache.get<Article>(articleName);
  if (article == undefined) {
    return err(new UncaughtError("ARTICLE_NOT_FOUND"));
  } else {
    return ok(article);
  }
};
const getArticlesFromCache = (): ArticlesResult => {
  const articles = articleCache.get<ArticleTitleDate[]>(ARTICLE_LIST_KEY);
  if (articles == undefined) {
    return err(new UncaughtError("ARTICLE_LIST_NOT_FOUND"));
  } else {
    return ok(articles);
  }
};
const cacheArticle = (article: ArticleResult): void => {
  if (article.isOk()) {
    articleCache.set<Article>(article.value.name, article.value);
    console.log("Cached: ", article.value.name);
  }
  return;
};
const cacheArticles = (articles: ArticlesResult): void => {
  if (articles.isOk()) {
    articleCache.set<ArticleTitleDate[]>(ARTICLE_LIST_KEY, articles.value);
    console.log("Cached: ", articles.value);
  }
};
const articleIsCached = (articleName: string): boolean => {
  return articleCache.has(articleName);
};
const articlesAreCached = (): boolean => {
  return articleCache.has(ARTICLE_LIST_KEY);
};

export {
  getArticleFromCache,
  cacheArticle,
  articleIsCached,
  getArticlesFromCache,
  cacheArticles,
  articlesAreCached,
};
