import { useState, useCallback, useMemo } from 'react';
import { Vestige, ReportData, CategoryStats, SearchFilters, OpenWithdrawalItem } from '../types';
import { fetchAllVestiges, getCategories } from '../services/dataService';
import { listOpenWithdrawalItems } from '../services/withdrawalService';

// A rota devolve ordenado por data agendada: o primeiro a entrar no Map é a retirada mais
// próxima, que é a que o selo do card deve mostrar.
const buildOpenWithdrawalsMap = (items: OpenWithdrawalItem[]) => {
  const map = new Map<string, OpenWithdrawalItem>();
  items.forEach((item) => {
    if (!map.has(item.vestigeId)) map.set(item.vestigeId, item);
  });
  return map;
};

const normalize = (str: string) =>
  (str || '').toString().toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const parseDate = (dateStr: string): Date | null => {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts.map(Number);
    return new Date(year, month - 1, day);
  }
  return null;
};

const OFFICIAL_CITIES = [
  'Lavras',
  'Ribeirão Vermelho',
  'Perdões',
  'Cana Verde',
  'Santo Antônio do Amparo',
  'Nepomuceno',
  'Ijaci',
  'Bom Sucesso',
  'Ibituruna',
  'Ingaí',
  'Luminárias',
  'Itumirim',
  'Itutinga',
  'Carrancas'
];

export const useVestiges = () => {
  const [vestiges, setVestiges] = useState<Vestige[]>([]);
  const [filteredVestiges, setFilteredVestiges] = useState<Vestige[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [openWithdrawals, setOpenWithdrawals] = useState<Map<string, OpenWithdrawalItem>>(new Map());

  const availableOptions = useMemo(() => {
    const origins = new Set<string>(categories);
    vestiges.forEach((vestige) => {
      if (vestige.planilhaOrigem) origins.add(vestige.planilhaOrigem);
    });

    return {
      municipios: OFFICIAL_CITIES.sort(),
      origins: Array.from(origins).sort(),
    };
  }, [categories, vestiges]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, loadedCategories, openItems] = await Promise.all([
        fetchAllVestiges(),
        getCategories(),
        // O .catch fica AQUI, na promise individual — nunca no Promise.all inteiro. Sem isto,
        // uma falha na rota de retiradas derrubaria o Promise.all e a LISTA DE VESTÍGIOS sumiria
        // da tela por causa de um selo decorativo.
        listOpenWithdrawalItems().catch((err) => {
          console.error('Falha ao carregar retiradas agendadas (o selo não será exibido):', err);
          return [] as OpenWithdrawalItem[];
        }),
      ]);
      setVestiges(data);
      setOpenWithdrawals(buildOpenWithdrawalsMap(openItems));
      // Os resultados de busca são um array próprio (`filteredVestiges`). Sem atualizá-lo aqui,
      // recarregar os dados após uma edição deixava o card exibindo a versão antiga do vestígio
      // — a alteração ia para o banco, mas a tela continuava mostrando o valor anterior.
      // Trocamos item a item pela versão nova, preservando a lista e a ordem do resultado atual;
      // um item que deixe de casar com o filtro continua visível em vez de sumir sob os olhos.
      setFilteredVestiges((previous) =>
        previous.map((item) => data.find((fresh) => fresh.id === item.id) ?? item),
      );
      setCategories(loadedCategories.map((category) => category.name));
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar os vestígios';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Atualiza só o selo de retirada agendada, sem recarregar os vestígios nem acionar o
  // "carregando" da lista — que desmontaria os cards (e o modal aberto dentro de um deles).
  const refreshOpenWithdrawals = useCallback(async () => {
    try {
      setOpenWithdrawals(buildOpenWithdrawalsMap(await listOpenWithdrawalItems()));
    } catch (err) {
      console.error('Falha ao atualizar retiradas agendadas (o selo não será exibido):', err);
    }
  }, []);

  const resetSearch = useCallback(() => {
    setHasSearched(false);
    setFilteredVestiges([]);
  }, []);

  const searchVestiges = useCallback(async (filters: SearchFilters) => {
    setHasSearched(true);
    // Sempre recarrega dados frescos do servidor para garantir consistência.
    // Evita resultados desatualizados ao alterar filtros sem limpar a busca anterior.
    const currentData = await loadData();

    const searchTerm = normalize(filters.term);
    const isNumericSearch = /^\d+$/.test(searchTerm);

    const results = currentData.filter((vestige) => {
      let matchesTerm = true;
      if (filters.term && filters.term.trim() !== '') {
        if (filters.field === 'all') {
          if (isNumericSearch) {
            matchesTerm =
              normalize(vestige.fav) === searchTerm ||
              vestige.requisicoes.some((r) => normalize(r.numero) === searchTerm) ||
              vestige.involucros.some((i) => normalize(i.numero) === searchTerm) ||
              normalize(vestige.material).includes(searchTerm);
          } else {
            matchesTerm =
              normalize(vestige.fav).includes(searchTerm) ||
              vestige.requisicoes.some((r) => normalize(r.numero).includes(searchTerm)) ||
              vestige.involucros.some((i) => normalize(i.numero).includes(searchTerm)) ||
              normalize(vestige.material).includes(searchTerm) ||
              normalize(vestige.municipio).includes(searchTerm);
          }
        } else if (filters.field === 'involucro' || filters.field === 'requisicao') {
          const items = filters.field === 'involucro' ? vestige.involucros : vestige.requisicoes;
          matchesTerm = isNumericSearch
            ? items.some((i) => normalize(i.numero) === searchTerm)
            : items.some((i) => normalize(i.numero).includes(searchTerm));
        } else {
          const fieldValue = normalize(vestige[filters.field as keyof Vestige] as string);
          if (isNumericSearch && filters.field === 'fav') {
            matchesTerm = fieldValue === searchTerm;
          } else {
            matchesTerm = fieldValue.includes(searchTerm);
          }
        }
      }

      let matchesMunicipio = true;
      if (filters.municipio) {
        matchesMunicipio = normalize(vestige.municipio) === normalize(filters.municipio);
      }

      let matchesOrigin = true;
      if (filters.origin) {
        matchesOrigin = vestige.planilhaOrigem === filters.origin;
      }

      let matchesDate = true;
      if (filters.startDate || filters.endDate) {
        const itemDate = parseDate(vestige.data);
        if (itemDate) {
          itemDate.setHours(0, 0, 0, 0);
          if (filters.startDate) {
            const start = new Date(filters.startDate);
            start.setHours(0, 0, 0, 0);
            if (itemDate < start) matchesDate = false;
          }
          if (filters.endDate && matchesDate) {
            const end = new Date(filters.endDate);
            end.setHours(0, 0, 0, 0);
            if (itemDate > end) matchesDate = false;
          }
        } else {
          matchesDate = false;
        }
      }

      let matchesConservacao = true;
      if (filters.estadoConservacao) {
        matchesConservacao = vestige.estadoConservacao === filters.estadoConservacao;
      }

      let matchesDestinacao = true;
      if (filters.destinacao) {
        matchesDestinacao = vestige.destinacao === filters.destinacao;
      }

      return matchesTerm && matchesMunicipio && matchesOrigin && matchesDate && matchesConservacao && matchesDestinacao;
    });

    setFilteredVestiges(results);
  }, [loadData]);

  const generateReport = useCallback(async () => {
    let currentData = vestiges;
    if (currentData.length === 0) {
      currentData = await loadData();
    }

    const byCategory: Record<string, CategoryStats> = {};
    const now = new Date();
    let totalGlobal = 0;

    currentData.forEach((vestige) => {
      const origin = vestige.planilhaOrigem || 'Não Identificado';
      if (!byCategory[origin]) {
        byCategory[origin] = {
          total: 0,
          missingRequisition: 0,
          over1Year: 0,
          over2Years: 0,
          missingReqOver1Year: 0,
          missingReqOver2Years: 0,
          missingReqOver3Years: 0,
          oldestItemDate: null,
          history: {
            y2022: 0,
            y2023: 0,
            y2024_s1: 0,
            y2024_s2: 0,
            y2025_s1: 0,
            y2025_s2: 0,
          },
        };
      }

      const stats = byCategory[origin];
      stats.total++;
      totalGlobal++;

      // Sem requisição = nenhuma das requisições ativas tem número (legado traz texto como "N/I").
      const isMissingReq = !vestige.requisicoes.some((r) => /\d/.test(r.numero));

      if (isMissingReq) {
        stats.missingRequisition++;
      }

      const entryDate = parseDate(vestige.data);
      if (entryDate && !Number.isNaN(entryDate.getTime())) {
        const diffTime = Math.abs(now.getTime() - entryDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 365) stats.over1Year++;
        if (diffDays > 730) stats.over2Years++;

        if (isMissingReq) {
          if (diffDays > 365) stats.missingReqOver1Year++;
          if (diffDays > 730) stats.missingReqOver2Years++;
          if (diffDays > 1095) stats.missingReqOver3Years++;
        }

        if (!stats.oldestItemDate || entryDate < stats.oldestItemDate) {
          stats.oldestItemDate = entryDate;
        }

        const year = entryDate.getFullYear();
        const isS1 = entryDate.getMonth() < 6;

        if (year === 2022) stats.history.y2022++;
        else if (year === 2023) stats.history.y2023++;
        else if (year === 2024) {
          if (isS1) stats.history.y2024_s1++;
          else stats.history.y2024_s2++;
        } else if (year === 2025) {
          if (isS1) stats.history.y2025_s1++;
          else stats.history.y2025_s2++;
        }
      }
    });

    const sortedCategories = Object.entries(byCategory)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 5)
      .map(([category, stats]) => ({ category, count: stats.total }));

    setReport({
      generatedAt: `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`,
      totalGlobal,
      topCritical: sortedCategories,
      byCategory,
    });
  }, [loadData, vestiges]);

  return {
    vestiges,
    filteredVestiges,
    availableOptions,
    loading,
    error,
    report,
    hasSearched,
    searchVestiges,
    resetSearch,
    refreshData: loadData,
    generateReport,
    clearReport: () => setReport(null),
    openWithdrawals,
    refreshOpenWithdrawals,
  };
};
