// Define an interface to represent an article object
interface Article {
  title: string; // The title of the article
  author: string; // The author of the article
  date: string; // The publication date of the article
  categories: string[]; // The categories the article belongs to
  tags: string[]; // The tags associated with the article
  name: string; // The unique name used to identify the article, typically a filename or slug
  content_type: "markdown" | "html"; // The content format of the article, either Markdown or HTML
  content: string; // The actual content of the article
}

// Define an interface to represent a simplified version of an article object
// This is useful when only the title and date are needed, for example in a list of articles
interface ArticleTitleDate {
  name: string; // The unique name used to identify the article, typically a filename or slug
  title: string; // The title of the article
  date: string; // The publication date of the article
}

// Export the Article and ArticleTitleDate interfaces for use in other modules
export { Article, ArticleTitleDate };
