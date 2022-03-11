import axios, { AxiosError, AxiosResponse } from "axios";
import { err, ok, Result } from "neverthrow";
import { Article, ArticleTitleDate } from "../article-schemas";
import { getEnv } from "../utils";

type ArticleResult = Result<Article, AxiosError | UncaughtError>;
class UncaughtError {
  constructor(readonly error: unknown) {}
}

const ARTICLE_SERVICE_URI = getEnv("ARTICLE_SERVICE_URI");

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

const getArticleList = async (): Promise<
  Result<ArticleTitleDate[], AxiosError | UncaughtError>
> => {
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

export { getArticle, getArticleList, UncaughtError, ArticleResult };
