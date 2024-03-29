// Import express, Router, Request, and Response classes for handling HTTP routing and requests
import express, { Router, Request, Response, NextFunction } from "express";

// Import the testRouter and blogRouter modules for handling test and blog routes
import testRouter from "./test/test-router";
import blogRouter from "./blog/blog-router";

// Import the path module for handling file and directory paths
import path from "path";
import axios from "axios";

// Define a function that returns a configured router instance
const router = (): Router => {
  // Create a new express router
  const router = express.Router();

  // Serve static files from the "static" directory
  router.use(express.static(path.join(__dirname, "../../static")));

  // Mount the testRouter and blogRouter on their respective paths
  router.use("/test", testRouter());
  router.use("/blog", blogRouter());

  // Define the route for the home page and render the home-page view
  router.get("/", (_req: Request, res: Response) => {
    res.render("home-page");
  });

  // Error handling middleware
  router.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    // Log the error (consider using a proper logging library)
    console.error(err);

    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return next();
    }
    // Set the response status code to 500 (Internal Server Error) or use the error-specific status code, if available
    res.status(500);

    // Render an error view or send a generic error message to the client
    // res.render('error-page', { error: err });
    res.render("error-page", {
      content: "500: An error occurred while processing your request.",
    });
  });

  // 404 error handling middleware
  router.use((_req: Request, res: Response, _next: NextFunction) => {
    // Set the response status code to 404 (Not Found)
    res.status(404);

    // Render a 404 view or send a 404 error message to the client
    // res.render('not-found-page');
    res.render("error-page", {
      content: "404: The requested resource was not found.",
    });
  });

  // Return the configured router instance
  return router;
};

// Export the router function as the default export
export default router;
