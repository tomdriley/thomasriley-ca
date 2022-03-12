import express, { Router, Request, Response } from "express";
import {
  ArticleResult,
  ArticlesResult,
  getArticle,
  getArticleList,
} from "../../services/fetch-article";
import {
  articleIsCached,
  getArticleFromCache,
  cacheArticle,
  articlesAreCached,
  getArticlesFromCache,
  cacheArticles,
} from "../../services/cache-article";
import { marked } from "marked";

const blogRouter = (): Router => {
  const router = express.Router();

  router.get("/", async (req: Request, res: Response) => {
    let articles: ArticlesResult;
    if (articlesAreCached()) {
      articles = getArticlesFromCache();
    } else {
      articles = await getArticleList();
      cacheArticles(articles);
    }
    if (articles.isErr()) {
      //TODO give more meaningful 404 page
      res.status(404).send(articles);
      return;
    }
    res.render("article-list-page", { articles: articles.value });
  });

  router.get("/:articleName", async (req: Request, res: Response) => {
    const articleName = req.params.articleName;
    let article: ArticleResult;
    if (articleIsCached(articleName)) {
      article = getArticleFromCache(articleName);
    } else {
      article = await getArticle(articleName);
      cacheArticle(article);
    }
    if (article.isErr()) {
      //TODO give more meaningful 404 page
      res.status(404).send(article);
      return;
    }
    if (article.value.content_type == "markdown") {
      article.value.content_type = "html";
      article.value.content = marked.parse(article.value.content);
    }
    if (article.value.content_type == "html") {
      res.render("article-page", {
        articleTitle: article.value.title,
        articleDate: article.value.date,
        articleAuthor: article.value.author,
        articleContent: article.value.content,
      });
    }
  });

  return router;
};

export default blogRouter;
