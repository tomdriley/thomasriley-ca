import express, { Request, Response } from "express";
import axios from "axios";

// Constants
const PORT = 8080;
const HOST = "0.0.0.0";
const ARTICLE_SERVICE_URI = "http://article-service.thomasriley.ca";

const getArticleService = async (url: string) => {
  const articleServiceResponse = await axios.get(url);
  const articleServiceData = articleServiceResponse.data;
  return articleServiceData;
};

// App
const app = express();
app.get("/", async (req: Request, res: Response) => {
  try {
    const startTime: Date = new Date();
    const articleServiceMessage = await getArticleService(ARTICLE_SERVICE_URI);
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

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);
