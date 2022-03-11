import { err, ok } from "neverthrow";
import { ArticleResult, UncaughtError } from "./fetch-article";
import NodeCache from "node-cache";
import { Article } from "../article-schemas";

const articleCache = new NodeCache();

const getArticleFromCache = (articleName: string): ArticleResult => {
  const article = articleCache.get<Article>(articleName);
  if (article == undefined) {
    return err(new UncaughtError("ARTICLE_NOT_FOUND"));
  } else {
    return ok(article);
  }
};
const cacheArticle = (article: ArticleResult): void => {
  if (article.isOk()) {
    articleCache.set<Article>(article.value.name, article.value);
    console.log("Cached: ", article.value.name);
  }
  return;
};
const articleIsCached = (articleName: string): boolean => {
  return articleCache.has(articleName);
};

export { getArticleFromCache, cacheArticle, articleIsCached };
