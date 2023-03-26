import express, { Router, Request, Response } from "express";
import {
  ArticleResult,
  ArticlesResult,
  getArticle,
  getArticleList,
} from "../../services/fetch-article";
import {
  articleIsCached,
  getArticleFromCache,
  cacheArticle,
  articlesAreCached,
  getArticlesFromCache,
  cacheArticles,
} from "../../services/cache-article";
import { marked } from "marked";

// blogRouter function returns a configured router for blog-related routes
const blogRouter = (): Router => {
  // Create a new Express router
  const router = express.Router();

  // Route handler for the blog root path
  router.get("/", async (req: Request, res: Response) => {
    let articles: ArticlesResult;
    // Check if articles are cached
    if (articlesAreCached()) {
      // If cached, get articles from cache
      articles = getArticlesFromCache();
    } else {
      // If not cached, fetch articles from the article service
      articles = await getArticleList();
      // Cache the fetched articles
      cacheArticles(articles);
    }
    // If an error occurred while fetching articles, send a 404 response
    if (articles.isErr()) {
      //TODO give more meaningful 404 page
      res.status(404).send(articles);
      return;
    }
    // Render the article list page with the fetched articles
    res.render("article-list-page", { articles: articles.value });
  });

  // Route handler for individual article pages
  router.get("/:articleName", async (req: Request, res: Response) => {
    // Extract the article name from the request parameters
    const articleName = req.params.articleName;
    let article: ArticleResult;
    // Check if the article is cached
    if (articleIsCached(articleName)) {
      // If cached, get the article from cache
      article = getArticleFromCache(articleName);
    } else {
      // If not cached, fetch the article from the article service
      article = await getArticle(articleName);
      // Cache the fetched article
      cacheArticle(article);
    }
    // If an error occurred while fetching the article, send a 404 response
    if (article.isErr()) {
      //TODO give more meaningful 404 page
      res.status(404).send(article);
      return;
    }
    // If the article content is in Markdown format, convert it to HTML
    if (article.value.content_type == "markdown") {
      article.value.content_type = "html";
      article.value.content = marked.parse(article.value.content);
    }
    // Render the article page with the article content in HTML format
    res.render("article-page", {
      articleTitle: article.value.title,
      articleDate: article.value.date,
      articleAuthor: article.value.author,
      articleContent: article.value.content,
    });
  });

  // Return the configured router
  return router;
};

// Export the blogRouter function as the default export
export default blogRouter;
