import { Article, ArticleTitleDate } from "../article-schemas";
import DatabaseService from "./database-service";
import { Db, SortDirection } from "mongodb";
import { getEnv } from "../utils";

const syntheticArticle: Article = {
  name: "stage-smoke-test",
  title: "Stage smoke test",
  author: "Stage",
  date: "2026-01-01",
  categories: [],
  tags: [],
  content_type: "markdown",
  content: "Synthetic deployment verification. No production data.",
};

const ArticleService = {
  async getArticleList(): Promise<ArticleTitleDate[]> {
    if (process.env.ARTICLE_DATA_MODE === "synthetic") {
      const { name, title, date } = syntheticArticle;
      return [{ name, title, date }];
    }
    const articles = await DatabaseService.withDB(async (database: Db) => {
      const articles_collection = database.collection(
        getEnv("MONGO_ARTICLES_COLLECTION")
      );

      const allArticlesQuery = {};
      const getNameAndTitle = {
        _id: false,
        name: true,
        title: true,
        date: true,
      };
      const reverseChronological: { date: SortDirection } = { date: -1 };

      const articles = await articles_collection
        .find(allArticlesQuery)
        .project<ArticleTitleDate>(getNameAndTitle)
        .sort(reverseChronological)
        .toArray();

      return articles;
    });

    return articles;
  },
  async getArticle(name: string): Promise<Article | null> {
    if (process.env.ARTICLE_DATA_MODE === "synthetic") {
      return name === syntheticArticle.name ? syntheticArticle : null;
    }
    const article = await DatabaseService.withDB(async (database: Db) => {
      const articles_collection = database.collection(
        getEnv("MONGO_ARTICLES_COLLECTION")
      );

      const article = await articles_collection.findOne<Article>(
        { name },
        { projection: { _id: false } }
      );

      return article;
    });

    return article;
  },
} as const;

export default ArticleService;
