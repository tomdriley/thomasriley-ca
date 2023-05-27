import express, { Request, Response, Router } from "express";
import apiRouter from "./api/api-router";

const router = (args: { name: string; port: number }): Router => {
  const { name, port } = args;
  const router = express.Router();

  router.get("/", (req: Request, res: Response) => {
    res.status(200).send(`${name} is running on port ${port}\n`);
  });

  router.use("/api", apiRouter());

  return router;
};

export default router;
