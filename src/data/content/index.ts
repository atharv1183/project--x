export type ContentType = 'blog' | 'city' | 'money' | 'compare';

export interface PublicContent {
  slug: string;
  type: ContentType;
  title: string;
  category: string; // e.g., 'CRM', 'Sales', 'Marketing'
  date: string;
  description: string;
  content: string; // Plain text or HTML
  imageUrl?: string;
  featured?: boolean;
}

export const allContent: PublicContent[] = [];
