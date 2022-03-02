import express, { Router, Request, Response } from "express";
import { getArticleMarkdown } from "../../services/fetch-markdown";
import { marked } from "marked";

const blogRouter = (): Router => {
  const router = express.Router();

  router.get("/:articleName", async (req: Request, res: Response) => {
    const articleName = req.params.articleName;
    const articleMarkdown = await getArticleMarkdown(articleName);
    if (articleMarkdown.isOk()) {
      const articleHTML = marked.parse(articleMarkdown.value);
      res.setHeader("Content-Type", "text/html");
      res.send(articleHTML);
    } else {
      //TODO give more meaningful 404 page
      res.status(404).send(articleMarkdown);
    }
  });

  return router;
};

export default blogRouter;
