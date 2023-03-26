// Import the Express module for creating a web server
import express from "express";
// Import custom router module to handle different routes
import router from "./routes/router";

// Set the server's listening port
const PORT = 8080;
// Set the server's listening IP address (0.0.0.0 listens on all available network interfaces)
const HOST = "0.0.0.0";

// Create a new Express app instance
const app = express();
// Set the view engine to EJS, which allows embedding JavaScript in HTML templates
app.set("view engine", "ejs");
// Mount the custom router on the root path ("/") of the app
app.use("/", router());

// Start the server, listening on the specified IP address and port
app.listen(PORT, HOST);
// Log a message to the console, indicating the server is running and its URL
console.log(`Running on http://${HOST}:${PORT}`);
