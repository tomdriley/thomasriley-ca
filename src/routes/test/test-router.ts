// Import the required modules and dependencies
import express, { Router, Request, Response } from "express";
import { getEnv, fetchDataFromService } from "../../utils";

// Retrieve the ARTICLE_SERVICE_URI from environment variables
const ARTICLE_SERVICE_URI = getEnv("ARTICLE_SERVICE_URI");

// Define the testRouter function, which returns an Express router
const testRouter = (): Router => {
  // Create a new Express router
  const router = express.Router();

  // Define a route handler for the root path of the testRouter
  router.get("/", async (req: Request, res: Response) => {
    try {
      // Record the start time of the request to the Article Service
      const startTime: Date = new Date();
      // Get the message from the Article Service using the fetchDataFromService function
      const articleServiceMessage = await fetchDataFromService(
        ARTICLE_SERVICE_URI
      );
      // Record the end time of the request to the Article Service
      const endTime: Date = new Date();
      // Calculate the response time of the Article Service request
      const responseTimeMilliseconds = endTime.getTime() - startTime.getTime();
      // Send a response to the client with the response time and message from the Article Service
      res.send(
        `The website frontend is running! Article service says (${responseTimeMilliseconds} ms): ${articleServiceMessage}`
      );
    } catch (error) {
      // If there was an error fetching the message from the Article Service, send an error message to the client
      console.error("Failed to fetch article service:", error);
      res
        .status(500)
        .send(
          "The website frontend is running! Failed to fetch article service"
        );
    }
  });

  // Return the configured router
  return router;
};

// Export the testRouter function as the default export
export default testRouter;
