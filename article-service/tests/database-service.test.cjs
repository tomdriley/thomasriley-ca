const assert = require("node:assert/strict");
const test = require("node:test");
const { MongoClient } = require("mongodb");

test("concurrent reads, health checks and errors never close the shared pool", async () => {
  process.env.CUSTOMCONNSTR_AZURE_TOMRILEY_BLOG_DB = "mongodb://localhost:27017";
  process.env.MONGO_DATABASE = "test";
  delete process.env.ARTICLE_DATA_MODE;
  let closed = 0;
  let pings = 0;
  let available = true;
  const original = {
    connect: MongoClient.prototype.connect,
    db: MongoClient.prototype.db,
    close: MongoClient.prototype.close,
  };
  MongoClient.prototype.connect = async function () { return this; };
  MongoClient.prototype.db = () => ({
    command: async (command) => {
      assert.deepEqual(command, { ping: 1 });
      pings += 1;
      if (!available) throw new Error("database unavailable");
      return { ok: 1 };
    },
  });
  MongoClient.prototype.close = async () => { closed += 1; };
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  try {
    const service = require("../dist/services/database-service").default;
    const slow = service.withDB(async () => {
      await barrier;
      assert.equal(closed, 0, "another request closed the active reader's pool");
      return "slow";
    });
    assert.equal(await service.withDB(async () => "fast"), "fast");
    await service.testConnection();
    assert.equal(pings, 1);
    available = false;
    await assert.rejects(service.testConnection(), /database unavailable/);
    assert.equal(pings, 2);
    await assert.rejects(service.withDB(async () => {
      throw new Error("query failed");
    }), /query failed/);
    release();
    assert.equal(await slow, "slow");
    assert.equal(closed, 0);
  } finally {
    release();
    Object.assign(MongoClient.prototype, original);
  }
});
