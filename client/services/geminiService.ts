
// ARQUIVO NEUTRALIZADO
// Este projeto atualmente opera em modo 100% manual/planilha e não utiliza recursos de IA.
// O código foi comentado para evitar erros de build relacionados à falta de API_KEY no ambiente local.

/*
import { GoogleGenAI } from "@google/genai";
import { Vestige, GroundingChunk } from '../types';

// Inicialização centralizada
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getVestigeSummary = async (vestige: Vestige): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `
      Crie um resumo conciso, em um parágrafo, para o seguinte vestígio forense.
      Seja direto e informativo.

      - Material: ${vestige.material}
      - Requisição: ${vestige.requisicao || 'Não informada'}
      - Invólucro: ${vestige.involucro}
      - FAV: ${vestige.fav}
      - Município de Origem: ${vestige.municipio}
      - Data de Entrada: ${vestige.data}
      - Origem (Tipo de Perícia): ${vestige.planilhaOrigem}

      Resumo:
    `,
  });

  return response.text;
};

export const getNewsOnCase = async (vestige: Vestige): Promise<GroundingChunk[] | null> => {
    const query = `Notícias recentes sobre crimes envolvendo "${vestige.material}" em ${vestige.municipio}, Minas Gerais`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: query,
        config: {
            tools: [{ googleSearch: {} }],
        },
    });
    
    return response.candidates?.[0]?.groundingMetadata?.groundingChunks as GroundingChunk[] | null;
};
*/
