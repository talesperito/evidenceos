
export interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

export const FAQ_DATA: FAQItem[] = [
  {
    id: '1',
    category: 'Recebimento de Materiais',
    question: 'Quais itens são aceitos na URC?',
    answer: 'Apenas vestígios devidamente lacrados, com número de requisição, FAV e cadeia de custódia iniciada. Itens perecíveis ou de grande porte (veículos) possuem regras específicas.'
  },
  {
    id: '2',
    category: 'Recebimento de Materiais',
    question: 'O que fazer se o lacre estiver rompido?',
    answer: 'O recebimento deve ser recusado imediatamente. O portador deve regularizar o lacre na unidade de origem e justificar o rompimento.'
  },
  {
    id: '3',
    category: 'Coleta e Armazenamento',
    question: 'Como armazenar armas de fogo?',
    answer: 'Devem estar desmuniciadas. Munições devem ser acondicionadas em invólucro separado, mas podem ser vinculadas ao mesmo FAV. Armas longas ficam no Armário A e curtas no Armário B.'
  },
  {
    id: '4',
    category: 'Coleta e Armazenamento',
    question: 'Procedimento para contraprova de drogas',
    answer: 'Apenas a quantidade necessária para contraprova deve ser armazenada. O excedente deve ser incinerado mediante autorização judicial. O invólucro deve ser do tipo "Saco de Prova" transparente.'
  },
  {
    id: '5',
    category: 'Destinação',
    question: 'Quando um item pode ser descartado?',
    answer: 'Mediante ofício judicial autorizando a destruição, doação ou restituição, ou após o prazo legal de prescrição conforme tabela de temporalidade vigente.'
  },
  {
    id: '6',
    category: 'Geral',
    question: 'Significado de FAV',
    answer: 'Ficha de Acompanhamento de Vestígio. É o número único gerado pelo sistema PCnet/Sinesp para rastreabilidade global do item.'
  }
];
