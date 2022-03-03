import express, { Router, Request, Response } from "express";
import testRouter from "./test/test-router";
import blogRouter from "./blog/blog-router";
import path from "path";

const router = (): Router => {
  const router = express.Router();

  router.use(express.static(path.join(__dirname, "../../static")));

  router.use("/test", testRouter());
  router.use("/blog", blogRouter());

  router.get("/", (req: Request, res: Response) => {
    res.render("home-page");
  });

  return router;
};

export default router;
