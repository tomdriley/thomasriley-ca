import express, { Request, Response, Router } from "express";
import ArticleService from "../../services/article-service";

const articlesRouter = (): Router => {
  const router = express.Router();

  router.get("/", async (req: Request, res: Response) => {
    try {
      const articles = await ArticleService.getArticleList();
      res.status(200).json(articles);
    } catch (error: unknown) {
      res.status(500).json({
        message: "Error while getting article list",
        error,
      });
    }
  });

  router.get("/:name", async (req: Request, res: Response) => {
    const { name } = req.params;
    try {
      const article = await ArticleService.getArticle(name);
      if (article !== null) {
        res.status(200).json(article);
      } else {
        res.sendStatus(404);
      }
    } catch (error: unknown) {
      res.status(500).json({
        message: `Error getting article "${name}"`,
        error,
      });
    }
  });

  return router;
};

export default articlesRouter;
