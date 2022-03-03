import axios, { AxiosError, AxiosResponse } from "axios";
import { err, ok, Result } from "neverthrow";
import { Article } from "../article-schemas";
import { getEnv } from "../utils";

class UncaughtError {
  constructor(readonly error: unknown) {}
}

const ARTICLE_SERVICE_URI = getEnv("ARTICLE_SERVICE_URI");

const getArticle = async (
  name: string
): Promise<Result<Article, AxiosError | UncaughtError>> => {
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

export { getArticle };
