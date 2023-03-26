// Import the Article and ArticleTitleDate interfaces from the article-schemas module
import { Article, ArticleTitleDate } from "../article-schemas";
import { err } from "neverthrow";

// Import the getEnv function from the utils module to access environment variables
import {
  AxiosResult,
  fetchDataFromService,
  getEnv,
  UncaughtError,
} from "../utils";

// Define the types for the results of the getArticle and getArticleList functions
type ArticleResult = AxiosResult<Article>;
type ArticlesResult = AxiosResult<ArticleTitleDate[]>;

// Get the article service URI from an environment variable
const ARTICLE_SERVICE_URI = getEnv("ARTICLE_SERVICE_URI");

// Define a function to fetch a single article by its name
const getArticle = async (name: string): Promise<ArticleResult> => {
  if (ARTICLE_SERVICE_URI.isErr()) {
    return err(ARTICLE_SERVICE_URI.error);
  }
  return fetchDataFromService<Article>(
    ARTICLE_SERVICE_URI + "/api/articles/" + name
  );
};

// Define a function to fetch a list of article titles and dates
const getArticleList = async (): Promise<ArticlesResult> => {
  if (ARTICLE_SERVICE_URI.isErr()) {
    return err(ARTICLE_SERVICE_URI.error);
  }
  return fetchDataFromService<ArticleTitleDate[]>(
    ARTICLE_SERVICE_URI + "/api/articles/"
  );
};

// Export the functions, classes, and types defined in this module
export {
  getArticle,
  getArticleList,
  UncaughtError,
  ArticleResult,
  ArticlesResult,
};
