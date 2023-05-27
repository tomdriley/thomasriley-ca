import { Article, ArticleTitleDate } from "../article-schemas";
import DatabaseService from "./database-service";
import { Db, SortDirection } from "mongodb";
import { getEnv } from "../utils";

const ArticleService = {
  async getArticleList(): Promise<ArticleTitleDate[]> {
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
