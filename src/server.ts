import express from "express";
import router from "./routes/router";

// Constants
const PORT = 8080;
const HOST = "0.0.0.0";

// App
const app = express();
app.set("view engine", "ejs");
app.use("/", router());

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);
