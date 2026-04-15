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

interface FAQRecord extends FAQItem {
  code: string;
}

const mapStandard = (item: ApiStandard): FAQRecord => ({
  id: String(item.id),
  category: item.category || 'Geral',
  question: item.title,
  answer: item.fullText || item.description || '',
  code: item.code,
});

const createCode = (faq: Omit<FAQItem, 'id'>) =>
  `${faq.category}-${faq.question}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const toFaqItem = ({ code, ...item }: FAQRecord): FAQItem => item;

const buildDefaultFAQs = (): FAQRecord[] =>
  FAQ_DATA.map((item) => {
    const code = createCode({
      category: item.category,
      question: item.question,
      answer: item.answer,
    });

    return {
      id: `default:${code}`,
      category: item.category,
      question: item.question,
      answer: item.answer,
      code,
    };
  });

export const isPersistedFAQId = (id: string): boolean => /^\d+$/.test(id);

export const getFAQs = async (fallbackToDefaults = false): Promise<FAQItem[]> => {
  const standards = await apiRequest<ApiStandard[]>('/api/custody-standards');
  const mappedStandards = standards.map(mapStandard);

  if (!fallbackToDefaults) {
    return mappedStandards.map(toFaqItem);
  }

  const defaultFAQs = buildDefaultFAQs();
  if (mappedStandards.length === 0) {
    return defaultFAQs.map(toFaqItem);
  }

  const persistedCodes = new Set(mappedStandards.map((item) => item.code));
  const merged = [
    ...mappedStandards,
    ...defaultFAQs.filter((item) => !persistedCodes.has(item.code)),
  ];

  return merged.map(toFaqItem);
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

  if (faq.id && isPersistedFAQId(faq.id)) {
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
  if (!isPersistedFAQId(id)) {
    throw new Error('Este item padrao ainda nao foi importado para o banco.');
  }

  await apiRequest(`/api/custody-standards/${id}`, { method: 'DELETE' });
};

export const resetFAQs = async (): Promise<void> => {
  const current = await getFAQs();
  await Promise.all(
    current
      .filter((item) => isPersistedFAQId(item.id))
      .map((item) => deleteFAQ(item.id)),
  );

  for (const item of FAQ_DATA) {
    await saveFAQ(item);
  }
};
