#!/usr/bin/env node
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { getArticle } from "../services/fetch-article";

const main = async () => {
  const argv = yargs(hideBin(process.argv))
    .options({
      name: { type: "string" },
    })
    .parseSync();
  if (argv.name === undefined) {
    console.log("Must specify article name with --name");
  } else {
    const article = await getArticle(argv.name);
    if (article.isOk()) {
      console.log(article.value);
    } else {
      console.log(article);
    }
  }
};

if (require.main === module) {
  main();
}
