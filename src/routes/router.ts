import express, { Router } from "express";
import testRouter from "./test/test-router";
import path from "path";

const router = (): Router => {
  const router = express.Router();

  router.use("/", express.static(path.join(__dirname, "../../static")));

  router.use("/test", testRouter());

  return router;
};

export default router;