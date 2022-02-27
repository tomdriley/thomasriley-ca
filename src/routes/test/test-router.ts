import express, { Router, Request, Response } from "express";
import { getEnv } from "../../utils";
import axios from "axios";

const ARTICLE_SERVICE_URI = getEnv("ARTICLE_SERVICE_URI");

const getArticleServiceMessage = async (url: string) => {
  const articleServiceResponse = await axios.get(url);
  const articleServiceData = articleServiceResponse.data;
  return articleServiceData;
};

const testRouter = (): Router => {
  const router = express.Router();

  router.get("/", async (req: Request, res: Response) => {
    try {
      const startTime: Date = new Date();
      const articleServiceMessage = await getArticleServiceMessage(
        ARTICLE_SERVICE_URI
      );
      const endTime: Date = new Date();
      const responseTimeMilliseconds = endTime.getTime() - startTime.getTime();
      res.send(
        "The website frontend is running! Article service says (" +
          responseTimeMilliseconds +
          " ms): " +
          articleServiceMessage
      );
    } catch (error) {
      res.send(
        "The website frontend is running! Failed to fetch article service"
      );
    }
  });

  return router;
};

export default testRouter;
