// Import axios, AxiosError, and AxiosResponse from the axios library for handling HTTP requests
import axios, { AxiosError, AxiosResponse } from "axios";

// Import the Result, ok, and err functions from the neverthrow library for creating result objects
import { err, ok, Result } from "neverthrow";

// Import the Article and ArticleTitleDate interfaces from the article-schemas module
import { Article, ArticleTitleDate } from "../article-schemas";

// Import the getEnv function from the utils module to access environment variables
import { getEnv } from "../utils";

// Define the types for the results of the getArticle and getArticleList functions
type ArticleResult = Result<Article, AxiosError | UncaughtError>;
type ArticlesResult = Result<ArticleTitleDate[], AxiosError | UncaughtError>;

// Define a class for uncaught errors
class UncaughtError {
  constructor(readonly error: unknown) {}
}

// Get the article service URI from an environment variable
const ARTICLE_SERVICE_URI = getEnv("ARTICLE_SERVICE_URI");

// Define a function to fetch a single article by its name
const getArticle = async (name: string): Promise<ArticleResult> => {
  try {
    const article: AxiosResponse<Article> = await axios.get<Article>(
      ARTICLE_SERVICE_URI + "/api/articles/" + name
    );
    return ok(article.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return err(error);
    } else {
      return err(new UncaughtError(error));
    }
  }
};

// Define a function to fetch a list of article titles and dates
const getArticleList = async (): Promise<ArticlesResult> => {
  try {
    const articles: AxiosResponse<ArticleTitleDate[]> = await axios.get<
      ArticleTitleDate[]
    >(ARTICLE_SERVICE_URI + "/api/articles/");
    return ok(articles.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return err(error);
    } else {
      return err(new UncaughtError(error));
    }
  }
};

// Export the functions, classes, and types defined in this module
export {
  getArticle,
  getArticleList,
  UncaughtError,
  ArticleResult,
  ArticlesResult,
};
