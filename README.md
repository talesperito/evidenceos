
# EvidenceOS – Sistema de Controle de Vestígios (URC Lavras/MG)

O **EvidenceOS** é uma aplicação web progressiva (PWA) desenvolvida para modernizar e agilizar a gestão da cadeia de custódia na Unidade Regional de Custódia (URC) de Lavras/MG. O sistema atua como uma interface moderna e responsiva para dados armazenados em planilhas Google (via Google Apps Script), oferecendo ferramentas avançadas de busca, auditoria e relatórios gerenciais.

---

## 🚀 Funcionalidades Principais

### 1. 🔍 Busca e Localização Avançada
*   **Busca Inteligente:** Algoritmo híbrido que diferencia buscas numéricas exatas (para IDs como FAV, Requisição) de buscas textuais parciais (para descrição de materiais).
*   **Filtros Combinados:** Permite refinar resultados por:
    *   Termo livre (Material, FAV, Involucro, Requisição).
    *   Município de origem (Lista oficial da regional).
    *   Tipo de Vestígio (Armas, Drogas, Geral, etc.).
    *   Intervalo de Datas (Data de entrada).
*   **Feedback Visual:** Indicadores de carregamento e estados de "Nenhum resultado".

### 2. 📦 Gestão de Custódia
*   **Cálculo Automático de Tempo:** Cada card de vestígio exibe automaticamente há quanto tempo o item está custodiado (dias, meses ou anos).
*   **Visualização em Card:** Design otimizado para leitura rápida com destaque para dados críticos (FAV, Número do Invólucro).
*   **Seleção em Lote ("Carrinho"):** Permite selecionar múltiplos itens de diferentes buscas para realizar ações em massa (agendamento de retirada).

### 3. 📅 Agendamento de Retirada (Google Agenda)
*   **Integração Direct Link:** Gera links dinâmicos para criar eventos no Google Calendar oficial da unidade.
*   **Controle de Motivos (Rigoroso):**
    *   Seleção obrigatória do motivo de saída para **cada item** individualmente.
    *   Opção de aplicar motivo em massa para agilidade.
    *   Campo de justificativa obrigatório para o motivo "Outros".
*   **Regra de Negócio (24h):** Bloqueio automático de agendamentos com menos de 24 horas de antecedência para garantir tempo hábil de separação.
*   **Detalhamento:** O evento gerado contém a lista completa de itens, FAVs e os motivos específicos de cada um no corpo do e-mail/evento.

### 4. 📊 Painel Administrativo e Relatórios
*   **Relatório Analítico de Custódia:**
    *   **Passivo Crítico:** Identifica itens sem número de requisição (alvos de descarte) parados há mais de 1, 2 ou 3 anos.
    *   **Evolução Temporal:** Gráficos (Sparklines) mostrando a tendência de entrada de materiais por semestre/ano.
    *   **Top 5:** Categorias com maior volume.
    *   **Impressão Otimizada:** Estilos CSS específicos (`@media print`) para gerar PDFs limpos e econômicos.
*   **Gestão de Normas (FAQ):** CRUD completo para cadastrar dúvidas frequentes e procedimentos operacionais padrão.
*   **Logs de Auditoria:** Rastreabilidade local de ações sensíveis (Login, Buscas realizadas, Alterações de dados, Geração de relatórios).
*   **Gestão de Usuários:** Cadastro de operadores e administradores com controle de acesso baseado em função (RBAC).

### 5. 🛠 CRUD (Criação, Leitura, Atualização, Exclusão)
*   **Sincronização Bidirecional:** Conecta-se a um script `doGet` e `doPost` no Google Apps Script.
*   **Edição e Exclusão:** Exclusiva para perfis de Administrador.
*   **Validação de Dados:** Formulários com máscaras e tipos de dados estritos.

### 6. 🎨 Interface e UX
*   **Dark Mode Nativo:** Interface construída em tons de `Slate-900` para conforto visual em ambientes com pouca luz e economia de energia.
*   **Responsividade:** Layout totalmente adaptável para Desktops, Tablets e Smartphones.
*   **Acessibilidade:** Uso de ícones claros, contrastes adequados e feedbacks de ação (Toasts/Alertas).

---

## 🛠 Tecnologias Utilizadas

*   **Frontend:** React 19, TypeScript.
*   **Estilização:** Tailwind CSS.
*   **Backend (Serverless):** Google Apps Script (Proxy para Google Sheets).
*   **Persistência Local:** LocalStorage (para Usuários, Logs e FAQs nesta versão).
*   **Ícones:** Heroicons (via SVG components).

---

## 🔒 Perfis de Acesso

1.  **Usuário Padrão:**
    *   Pode realizar buscas.
    *   Pode selecionar itens.
    *   Pode agendar retiradas.
    *   Pode gerar relatórios de visualização.
    *   Pode consultar Normas.

2.  **Administrador:**
    *   Todas as funções do padrão.
    *   **Inserir** novos vestígios.
    *   **Editar/Excluir** vestígios existentes.
    *   Gerenciar usuários do sistema.
    *   Visualizar Logs de Auditoria.
    *   Gerenciar Normas/FAQ.

---

## ⚠️ Notas Técnicas

*   **Validação de 24h:** A lógica de bloqueio de agendamento compara o timestamp do navegador com a data selecionada.
*   **Segurança:** A autenticação atual é realizada via `LocalStorage` para demonstração e uso em intranet controlada. Em produção escala, recomenda-se integrar com OAuth ou Backend dedicado.
*   **Impressão:** O sistema possui uma folha de estilo dedicada para impressão (`print:`) que remove elementos de UI (botões, fundos escuros) e foca nos dados para geração de relatórios em papel/PDF.

---

**Desenvolvido para a Polícia Civil de Minas Gerais - URC Lavras**
*Coordenação de Perícias do 6º Departamento*
