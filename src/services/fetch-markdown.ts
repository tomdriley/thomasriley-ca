import axios, { AxiosError, AxiosResponse } from "axios";
import { err, ok, Result } from "neverthrow";
import { Article } from "../article-schemas";
import { getEnv } from "../utils";

class NotMarkdownError {}
class UncaughtError {
  constructor(readonly error: unknown) {}
}

const ARTICLE_SERVICE_URI = getEnv("ARTICLE_SERVICE_URI");

const getArticleMarkdown = async (
  name: string
): Promise<Result<string, NotMarkdownError | AxiosError | UncaughtError>> => {
  try {
    const article: AxiosResponse<Article> = await axios.get<Article>(
      ARTICLE_SERVICE_URI + "/api/articles/" + name
    );
    if (article.data.content_type != "markdown") {
      return err(new NotMarkdownError());
    }
    return ok(article.data.content);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return err(error);
    } else {
      return err(new UncaughtError(error));
    }
  }
};

export { getArticleMarkdown };
