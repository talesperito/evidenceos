import { FAQ_DATA, FAQItem } from '../data/faqData';
import { apiRequest } from './apiClient';

interface ApiStandard {
  id: number;
  code: string;
  title: string;
  category?: string | null;
  description?: string | null;
  fullText?: string | null;
  sourceUrl?: string | null;
  effectiveDate?: string | null;
  version?: string | null;
}

const mapStandard = (item: ApiStandard): FAQItem => ({
  id: String(item.id),
  category: item.category || 'Geral',
  question: item.title,
  answer: item.fullText || item.description || '',
});

const createCode = (faq: Omit<FAQItem, 'id'>) =>
  `${faq.category}-${faq.question}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const getFAQs = async (fallbackToDefaults = false): Promise<FAQItem[]> => {
  const standards = await apiRequest<ApiStandard[]>('/api/custody-standards');
  if (standards.length === 0 && fallbackToDefaults) {
    return FAQ_DATA;
  }
  return standards.map(mapStandard);
};

export const saveFAQ = async (faq: Omit<FAQItem, 'id'> & { id?: string }): Promise<void> => {
  const payload = {
    code: createCode({ category: faq.category, question: faq.question, answer: faq.answer }),
    title: faq.question,
    category: faq.category,
    fullText: faq.answer,
    description: faq.answer.slice(0, 240),
    active: true,
  };

  if (faq.id && /^\d+$/.test(faq.id)) {
    await apiRequest(`/api/custody-standards/${faq.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return;
  }

  await apiRequest('/api/custody-standards', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const deleteFAQ = async (id: string): Promise<void> => {
  if (!/^\d+$/.test(id)) {
    throw new Error('Este item padrão ainda não foi importado para o banco.');
  }
  await apiRequest(`/api/custody-standards/${id}`, { method: 'DELETE' });
};

export const resetFAQs = async (): Promise<void> => {
  const current = await getFAQs();
  await Promise.all(
    current
      .filter((item) => /^\d+$/.test(item.id))
      .map((item) => deleteFAQ(item.id)),
  );

  for (const item of FAQ_DATA) {
    await saveFAQ(item);
  }
};
