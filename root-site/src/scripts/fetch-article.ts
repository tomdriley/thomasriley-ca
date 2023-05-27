#!/usr/bin/env node
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { getArticle } from "../services/fetch-article";

// Define the main function to run the script
const main = async () => {
  // Parse command-line arguments using yargs
  const argv = yargs(hideBin(process.argv))
    .options({
      // Define a command-line option 'name' of type string
      name: { type: "string" },
    })
    .parseSync();

  // Check if the 'name' option is provided
  if (argv.name === undefined) {
    // If the 'name' option is not provided, log an error message
    console.log("Must specify article name with --name");
  } else {
    // If the 'name' option is provided, fetch the article
    const article = await getArticle(argv.name);

    // Check if the article fetching is successful
    if (article.isOk()) {
      // If successful, log the article object
      console.log(article.value);
    } else {
      // If unsuccessful, log the error object
      console.log(article);
    }
  }
};

// Check if the script is being executed directly, rather than being imported as a module
if (require.main === module) {
  // If the script is executed directly, run the main function
  main();
}
