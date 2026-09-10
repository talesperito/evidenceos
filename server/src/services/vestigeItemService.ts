// Invólucros e requisições de um vestígio: listas 1:N em que cada item guarda só número e
// motivo. Quem rompeu o lacre, quando e onde fica na FAV do PCNET — não é repetido aqui.
// Desenho: docs/plans/2026-09-10-multiplas-requisicoes-motivo-design.md

export type VestigeItemKind = 'involucro' | 'requisicao';

// Tudo o que entra no cadastro do vestígio, sem pergunta nenhuma.
export const MOTIVO_REGISTRO_INICIAL = 'REGISTRO_INICIAL';

// Motivos aceitos para um item incluído numa EDIÇÃO. REGISTRO_INICIAL e LEGADO (default do
// banco para o que já existia) nunca são escolhidos na tela.
// Rótulos em client/types.ts (MOTIVOS_INVOLUCRO / MOTIVOS_REQUISICAO) — manter as duas listas iguais.
export const MOTIVOS_EDICAO: Record<VestigeItemKind, readonly string[]> = {
  involucro: ['DIVISAO_MATERIAL', 'ROMPIMENTO_LACRE', 'EMBALAGEM_DANIFICADA', 'CORRECAO_CADASTRO'],
  requisicao: ['NOVO_EXAME', 'EXAME_COMPLEMENTAR', 'REITERACAO_AUTORIDADE', 'CORRECAO_CADASTRO'],
};

const NOME: Record<VestigeItemKind, { de: string; artigo: string }> = {
  involucro: { de: 'invólucro', artigo: 'do invólucro' },
  requisicao: { de: 'requisição', artigo: 'da requisição' },
};

export interface ItemInput {
  numero: string;
  motivo?: string;
}

export interface NewItem {
  numero: string;
  motivo: string;
}

export interface StoredItem<Id> {
  id: Id;
  numero: string;
  motivo: string;
}

export interface ItemPlan<Id> {
  toAdd: NewItem[];
  toRemove: StoredItem<Id>[];
}

/** Erro de regra de negócio: a rota devolve 400 com a mensagem, pronta para a tela. */
export class VestigeItemError extends Error {}

// Remove espaços, descarta vazios e elimina números repetidos dentro do MESMO vestígio
// (a checagem entre vestígios diferentes é o alerta de duplicata, feito à parte).
export const normalizeItems = (items?: ItemInput[] | null): ItemInput[] => {
  const seen = new Set<string>();
  const result: ItemInput[] = [];
  for (const item of items || []) {
    const numero = item.numero.trim();
    if (!numero || seen.has(numero)) continue;
    seen.add(numero);
    result.push({ numero, motivo: item.motivo });
  }
  return result;
};

const assertDigits = (kind: VestigeItemKind, numero: string) => {
  if (!/^\d+$/.test(numero)) {
    throw new VestigeItemError(`Número de ${NOME[kind].de} inválido: "${numero}". Use apenas dígitos.`);
  }
};

/** Cadastro: todos os itens entram como Registro inicial; o motivo enviado é ignorado. */
export const planCreate = (kind: VestigeItemKind, items?: ItemInput[] | null): NewItem[] =>
  normalizeItems(items).map(({ numero }) => {
    assertDigits(kind, numero);
    return { numero, motivo: MOTIVO_REGISTRO_INICIAL };
  });

/**
 * Edição: compara a lista enviada pelo formulário com os itens ativos gravados.
 * - número gravado que sumiu da lista → remoção lógica, nunca DELETE;
 * - número novo → inclusão, com motivo obrigatório e da lista da edição;
 * - número que já existia → fica intocado, com o motivo original (o do cliente é ignorado).
 * Números antigos fora do padrão (legado da planilha) não são revalidados: só os novos.
 */
export const planUpdate = <Id>(
  kind: VestigeItemKind,
  current: StoredItem<Id>[],
  desired: ItemInput[],
): ItemPlan<Id> => {
  const wanted = normalizeItems(desired);
  const wantedNumeros = new Set(wanted.map((item) => item.numero));
  const currentNumeros = new Set(current.map((item) => item.numero));

  const toRemove = current.filter((item) => !wantedNumeros.has(item.numero));
  const toAdd = wanted
    .filter((item) => !currentNumeros.has(item.numero))
    .map(({ numero, motivo }) => {
      assertDigits(kind, numero);
      if (!motivo || !MOTIVOS_EDICAO[kind].includes(motivo)) {
        throw new VestigeItemError(`Informe o motivo da inclusão ${NOME[kind].artigo} ${numero}.`);
      }
      return { numero, motivo };
    });

  return { toAdd, toRemove };
};
