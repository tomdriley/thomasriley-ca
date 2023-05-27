import express from "express";
import router from "./routes/router";

// Constants
const PORT = 8080;
const HOST = "0.0.0.0";
const SERVER_NAME = "Article Service";

// App
const app = express();
app.use("/", router({ name: SERVER_NAME, port: PORT }));

app.listen(PORT, HOST, () => {
  console.log(`Running on http://${HOST}:${PORT}`);
});
