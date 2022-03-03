import express, { Router, Request, Response } from "express";
import { getArticle, getArticleList } from "../../services/fetch-article";
import { marked } from "marked";

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
    const article = await getArticle(articleName);
    if (article.isOk()) {
      if (article.value.content_type == "markdown") {
        const articleHTML = marked.parse(article.value.content);
        res.render("article-page", {
          articleTitle: article.value.title,
          articleDate: article.value.date,
          articleAuthor: article.value.author,
          articleContent: articleHTML,
        });
      } else {
        res
          .status(500)
          .send("Internal Server Error. Article exists but is not readable.");
      }
    } else {
      //TODO give more meaningful 404 page
      res.status(404).send(article);
    }
  });

  return router;
};

export default blogRouter;
