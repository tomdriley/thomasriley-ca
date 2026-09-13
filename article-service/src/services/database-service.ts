import { Db, MongoClient } from "mongodb";
import { getEnv } from "../utils";

// Closing this shared pool per request would abort concurrent reads.
const client = process.env.ARTICLE_DATA_MODE === "synthetic"
  ? null
  : new MongoClient(getEnv("CUSTOMCONNSTR_AZURE_TOMRILEY_BLOG_DB"));

const DatabaseService = {
  async withDB<Type>(
    operations: (database: Db) => Promise<Type>
  ): Promise<Type> {
    if (client === null) {
      throw new Error("Database access is disabled in synthetic mode");
    }
    await client.connect();
    const database = client.db(getEnv("MONGO_DATABASE"));
    return await operations(database);
  },
  async testConnection() {
    if (client === null) {
      throw new Error("Database access is disabled in synthetic mode");
    }
    await client.connect();
  },
} as const;

export default DatabaseService;
