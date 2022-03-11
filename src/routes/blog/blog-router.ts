import express, { Router, Request, Response } from "express";
import {
  getArticle,
  getArticleList,
  UncaughtError,
} from "../../services/fetch-article";
import {
  articleIsCached,
  getArticleFromCache,
  cacheArticle,
} from "../../services/cache-article";
import { marked } from "marked";
import { Article } from "../../article-schemas";
import { AxiosError } from "axios";
import { Result } from "neverthrow";

const blogRouter = (): Router => {
  const router = express.Router();

  router.get("/", async (req: Request, res: Response) => {
    const articles = await getArticleList();
    if (articles.isOk()) {
      res.render("article-list-page", { articles: articles.value });
    }
  });

  router.get("/:articleName", async (req: Request, res: Response) => {
    const articleName = req.params.articleName;
    let article: Result<Article, AxiosError | UncaughtError>;
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
