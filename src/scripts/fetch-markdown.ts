#!/usr/bin/env node
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { getArticleMarkdown } from "../services/fetch-markdown";

const main = async () => {
  const argv = yargs(hideBin(process.argv))
    .options({
      name: { type: "string" },
    })
    .parseSync();
  if (argv.name === undefined) {
    console.log("Must specify article name with --name");
  } else {
    const articleMardown = await getArticleMarkdown(argv.name);
    if (articleMardown.isOk()) {
      console.log(articleMardown.value);
    } else {
      console.log(articleMardown);
    }
  }
};

if (require.main === module) {
  main();
}
