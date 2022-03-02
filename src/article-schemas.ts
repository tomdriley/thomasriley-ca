interface Article {
  title: string;
  author: string;
  date: string;
  categories: string[];
  tags: string[];
  name: string;
  content_type: "markdown";
  content: string;
}

interface ArticleTitleDate {
  name: string;
  title: string;
  date: string;
}

export { Article, ArticleTitleDate };
