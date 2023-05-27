import { Db, MongoClient } from "mongodb";
import { getEnv } from "../utils";

const MONGO_CONNECTION_STRING = getEnv("CUSTOMCONNSTR_AZURE_TOMRILEY_BLOG_DB");
const client = new MongoClient(MONGO_CONNECTION_STRING);

const DatabaseService = {
  async withDB<Type>(
    operations: (database: Db) => Promise<Type>
  ): Promise<Type> {
    try {
      await client.connect();

      const database = client.db(getEnv("MONGO_DATABASE"));

      return await operations(database);
    } finally {
      await client.close();
    }
  },
  async testConnection() {
    try {
      await client.connect();
    } finally {
      client.close();
    }
  },
} as const;

export default DatabaseService;
