'use strict';

const express = require('express');
const axios = require("axios");

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';
const ARTICLE_SERVICE_URI = "http://article-service.thomasriley.ca"

const getArticleService = async url => {
  const articleServiceResponse = await axios.get(ARTICLE_SERVICE_URI);
  const articleServiceData = articleServiceResponse.data;
  return articleServiceData;
};

// App
const app = express();
app.get('/', async (req, res) => {
  try {
    const startTime = new Date();
    const articleServiceMessage = await getArticleService(ARTICLE_SERVICE_URI);
    const responseTime = new Date() - startTime;
    res.send('The website frontend is running! Article service says (' + responseTime + ' ms): ' + articleServiceMessage);
  } catch (error) {
    res.send('The website frontend is running! Failed to fetch article service')
  }
});

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);
