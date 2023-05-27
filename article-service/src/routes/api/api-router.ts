import express, { Router, Request, Response } from "express";
import DatabaseService from "../../services/database-service";
import articlesRouter from "./articles-router";

const apiRouter = (): Router => {
  const router = express.Router();
  router.use("/articles", articlesRouter());
  router.get("/test-db-connection", async (req: Request, res: Response) => {
    try {
      await DatabaseService.testConnection();
      res.status(200).send("Successfully connected to database");
    } catch (error: unknown) {
      res.status(500).json({
        message: "Error while connecting to database",
        error,
      });
    }
  });
  return router;
};

export default apiRouter;
