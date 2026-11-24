"""Gera as planilhas de conferência da leitura das FAVs (etapa C do plano).

Plano: docs/plans/2026-11-17-leitura-fav-reds-pje-design.md (seção 5.5).

  python -E -P scripts/pcnet-gerar-planilha.py principal --lista lista-favs.csv --progresso progresso.jsonl \
         --saida conferencia-reds-pje.xlsx
        uma linha por vestígio, com REDS, PJe, requisições e a conferência; abas Resumo e Erros

  python -E -P scripts/pcnet-gerar-planilha.py municoes --lista lista-municoes.csv --progresso progresso.jsonl \
         --saida correcoes-municoes.xlsx
        vestígios da aba Munições com colunas deslocadas: FAV correta (do campo município), conferida
        no PCNET pelo lacre, mais REDS e PJe

As regras de leitura são as do leitor (scripts/pcnet-leitura-fav.py): a planilha REINTERPRETA o texto
bruto guardado no progresso, então reflete sempre as regras atuais, sem reler o PCNET.

Tudo o que este script grava fica fora do repositório (os arquivos de entrada e saída também): são dados
de custódia. Requer: Python 3 + openpyxl + o leitor ao lado.
"""
import argparse
import csv
import importlib.util
import json
import re
import sys
from collections import Counter
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

_spec = importlib.util.spec_from_file_location("leitor", Path(__file__).with_name("pcnet-leitura-fav.py"))
leitor = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(leitor)

MAX_REQ = 5
CABECALHO = Font(bold=True, color="FFFFFF")
FUNDO_CABECALHO = PatternFill("solid", fgColor="1F4E78")
FUNDO_ERRO = PatternFill("solid", fgColor="F8CBAD")
FUNDO_ALERTA = PatternFill("solid", fgColor="FFE699")
FUNDO_NAO = PatternFill("solid", fgColor="F4B084")


# ---------------------------------------------------------------------------
# Entrada
# ---------------------------------------------------------------------------

def ler_csv(caminho: str) -> list[dict]:
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def ler_progresso(caminhos: list[str]) -> dict[str, dict]:
    """FAV (sem zeros) -> registro reinterpretado com as regras atuais do leitor."""
    resultado: dict[str, dict] = {}
    for caminho in caminhos:
        for linha in Path(caminho).read_text(encoding="utf-8").splitlines():
            if not linha.strip():
                continue
            antigo = json.loads(linha)
            fav = leitor._sem_zeros(antigo["fav"])
            if antigo.get("bruto") is not None:
                novo = leitor.interpretar(antigo["bruto"], fav)
                novo["bruto"] = antigo["bruto"]
            else:
                novo = antigo
            resultado[fav] = novo  # a leitura mais recente de uma FAV vence
    return resultado


def fav_numerica(texto: str) -> str | None:
    texto = (texto or "").strip()
    return leitor._sem_zeros(texto) if re.fullmatch(r"\d+", texto) else None


# ---------------------------------------------------------------------------
# Regras da planilha
# ---------------------------------------------------------------------------

def chave_requisicao(texto: str) -> str | None:
    """Número da requisição sem ano e sem zeros à esquerda. Texto sem número ("x", "Deflagradas") -> None.

    FAV: "2026-059354601" -> "59354601". EvidenceOS: "59354601", "059354601", "2026-059354601".
    """
    grupos = re.findall(r"\d+", texto or "")
    if not grupos:
        return None
    if len(grupos) >= 2 and len(grupos[0]) == 4 and grupos[0].startswith("20"):
        grupos = grupos[1:]  # ano na frente
    numero = max(grupos, key=len)
    if len(numero) < 5:
        return None
    return numero.lstrip("0") or None


def requisicao_confere(da_fav: list[str], do_sistema: list[str]) -> str:
    fav = {k for k in map(chave_requisicao, da_fav) if k}
    sis = {k for k in map(chave_requisicao, do_sistema) if k}
    if not fav:
        return "FAV sem requisição"
    if not sis:
        return "Sem requisição no sistema"
    comuns = fav & sis
    if comuns == fav:
        return "Sim"
    return "Parcial" if comuns else "Não"


def separar(texto: str) -> list[str]:
    return [p.strip() for p in (texto or "").split("|") if p.strip()]


def so_alfanum(texto: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (texto or "").upper())


def involucro_confere(reg: dict | None, involucros_evidenceos: str) -> str:
    """'Sim' se o invólucro atual da FAV no PCNET está entre os invólucros ativos do vestígio."""
    na_fav = so_alfanum(((reg or {}).get("bruto") or {}).get("involucro", ""))
    if not na_fav:
        return "FAV sem invólucro"
    nossos = {so_alfanum(i) for i in separar(involucros_evidenceos)}
    return "Sim" if na_fav in nossos else "Não"


# ---------------------------------------------------------------------------
# Escrita
# ---------------------------------------------------------------------------

def escrever_aba(ws, cabecalho: list[str], linhas: list[list], larguras: dict[str, int] | None = None,
                 cor_por_linha=None) -> None:
    ws.append(cabecalho)
    for c in ws[1]:
        c.font, c.fill = CABECALHO, FUNDO_CABECALHO
        c.alignment = Alignment(wrap_text=True, vertical="center")
    for linha in linhas:
        ws.append(["" if v is None else str(v) for v in linha])  # tudo texto: não perde zero à esquerda
        if cor_por_linha:
            fundo = cor_por_linha(linha)
            if fundo:
                for c in ws[ws.max_row]:
                    c.fill = fundo
    for c in ws.iter_cols(min_row=2):
        for cel in c:
            cel.number_format = "@"
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for i, titulo in enumerate(cabecalho, 1):
        largura = (larguras or {}).get(titulo, min(max(len(titulo), 10) + 2, 40))
        ws.column_dimensions[get_column_letter(i)].width = largura


def campos_leitura(reg: dict | None) -> dict:
    """Colunas que vêm da FAV lida."""
    if not reg:
        return {"reds": [], "reds_gravar": "", "pje": "", "req": [], "alertas": "", "situacao": None}
    return {
        "reds": reg.get("reds") or [],
        "reds_gravar": reg.get("reds_gravar") or "",
        "pje": reg.get("pje_formatado", "") if reg.get("bruto") is not None else "",
        "req": reg.get("requisicoes") or [],
        "alertas": "; ".join(reg.get("avisos") or []),
        "situacao": reg.get("situacao"),
    }


# ---------------------------------------------------------------------------
# Planilha principal
# ---------------------------------------------------------------------------

def cmd_principal(args) -> int:
    vestigios = ler_csv(args.lista)
    lidas = ler_progresso(args.progresso)
    contagem_fav = Counter(f for f in (fav_numerica(v["fav"]) for v in vestigios) if f)

    cab = (["FAV", "Id do vestígio", "Categoria", "Município", "Destinação",
            "REDS 1 (FAV)", "REDS 2 (FAV)", "REDS 3 (FAV)", "REDS a gravar", "PJe (FAV)", "Alerta"]
           + [f"Requisição {i}" for i in range(1, MAX_REQ + 1)]
           + ["Demais requisições", "Requisições no EvidenceOS", "Requisição confere?",
              "Invólucros no EvidenceOS", "Invólucro atual na FAV", "Invólucro confere?", "Situação", "Conferido"])
    linhas, erros = [], []
    for v in vestigios:
        fav = fav_numerica(v["fav"])
        reg = lidas.get(fav) if fav else None
        c = campos_leitura(reg)
        alertas = [c["alertas"]] if c["alertas"] else []
        if len(c["req"]) > 1:
            alertas.insert(0, "Mais de uma requisição")
        if not v["fav"].strip():
            situacao = "Erro: Sem FAV"
        elif not fav:
            situacao = "Erro: FAV não numérica"
        elif args.fav_max and int(fav) > args.fav_max:
            situacao = "Erro: FAV fora da faixa (não pedida ao PCNET)"
        elif reg is None:
            situacao = "Erro: FAV não lida"
        elif contagem_fav[fav] > 1:
            situacao = "FAV repetida no EvidenceOS"
        else:
            situacao = c["situacao"]
        req = c["req"]
        lida = bool(reg and reg.get("bruto"))
        confere = requisicao_confere(req, separar(v["requisicoes_ativas"])) if lida else ""
        inv_confere = involucro_confere(reg, v["involucros_ativos"]) if lida else ""
        # Regra do invólucro (23/11): o invólucro do vestígio igual ao invólucro atual da FAV no PCNET
        # prova que o vestígio é dono da FAV (é o lacre físico). Libera a FAV repetida e a requisição
        # que não confere; sem isso, a linha fica para conferência.
        if situacao == "FAV repetida no EvidenceOS" and inv_confere == "Sim" and c["situacao"] == leitor.SIT_OK:
            situacao = leitor.SIT_OK
            alertas.append("FAV repetida no EvidenceOS (invólucro confere)")
        if situacao == leitor.SIT_OK and confere == "Não":
            if inv_confere == "Sim":
                alertas.append("Requisição do EvidenceOS diferente da FAV (invólucro confere): conferir a requisição")
            else:
                # FAV digitada errada, FAVs trocadas entre vestígios ou requisição digitada errada.
                situacao = "Conferir: requisição não confere"
        gravar = situacao == leitor.SIT_OK
        reds = c["reds"] + [""] * 3
        linha = ([v["fav"], v["id"], v["categoria"], v["municipio"], v["destinacao"],
                  reds[0], reds[1], reds[2], c["reds_gravar"] if gravar else "", c["pje"], "; ".join(alertas)]
                 + [req[i] if i < len(req) else "" for i in range(MAX_REQ)]
                 + [", ".join(req[MAX_REQ:]), v["requisicoes_ativas"], confere,
                    v["involucros_ativos"], (reg or {}).get("bruto", {}).get("involucro", "") if lida else "",
                    inv_confere, situacao, ""])
        linhas.append(linha)
        if not gravar:
            erros.append([v["fav"], v["id"], v["categoria"], situacao, "; ".join(alertas)])

    i_sit, i_conf, i_alerta = cab.index("Situação"), cab.index("Requisição confere?"), cab.index("Alerta")

    def cor(l):
        if l[i_sit] != leitor.SIT_OK:
            return FUNDO_ERRO
        if l[i_conf] == "Não":
            return FUNDO_NAO
        if l[i_alerta]:
            return FUNDO_ALERTA
        return None

    wb = Workbook()
    ws = wb.active
    ws.title = "Conferência"
    escrever_aba(ws, cab, linhas, {"Id do vestígio": 38, "Alerta": 45, "Situação": 34,
                                   "Requisições no EvidenceOS": 28}, cor)

    oks = [l for l in linhas if l[i_sit] == leitor.SIT_OK]
    resumo = [["Vestígios na lista", len(linhas)], ["Prontos para gravar (Situação OK)", len(oks)],
              ["Com PJe", sum(1 for l in oks if l[cab.index("PJe (FAV)")] not in ("", "Não informado"))],
              ["Com alerta", sum(1 for l in oks if l[i_alerta])], [""]]
    resumo += [["Situação: " + k, n] for k, n in Counter(l[i_sit] for l in linhas).most_common()]
    resumo += [[""]] + [["Requisição confere? " + k, n]
                        for k, n in Counter(l[i_conf] for l in oks).most_common() if k]
    escrever_aba(wb.create_sheet("Resumo"), ["Item", "Quantidade"], resumo, {"Item": 60})
    escrever_aba(wb.create_sheet("Erros"), ["FAV", "Id do vestígio", "Categoria", "Motivo", "Alerta"], erros,
                 {"Id do vestígio": 38, "Motivo": 50, "Alerta": 45})
    wb.save(args.saida)
    print(f"Gravado: {args.saida}")
    for item in resumo:
        if item and item[0]:
            print(f"  {item[0]}: {item[1]}")
    return 0


# ---------------------------------------------------------------------------
# Planilha das munições
# ---------------------------------------------------------------------------

def cmd_municoes(args) -> int:
    vestigios = ler_csv(args.lista)
    lidas = ler_progresso(args.progresso)
    cab = (["Id do vestígio", "Categoria", "Hoje no campo FAV (é o lacre)", "FAV correta (campo município)",
            "Invólucro atual na FAV (PCNET)", "Lacre confere?", "REDS 1 (FAV)", "REDS 2 (FAV)", "REDS 3 (FAV)",
            "REDS a gravar", "PJe (FAV)", "Alerta"]
           + [f"Requisição {i} (FAV)" for i in range(1, MAX_REQ + 1)]
           + ["Hoje no campo invólucro (é a requisição)", "Requisição confere?",
              "Hoje no campo requisição (é a natureza)", "Situação", "Conferido"])
    linhas = []
    for v in vestigios:
        fav = fav_numerica(v["fav"])
        reg = lidas.get(fav) if fav else None
        c = campos_leitura(reg)
        bruto = (reg or {}).get("bruto") or {}
        inv_fav = (bruto.get("involucro") or "").strip()
        no_campo = v["numero_no_campo_fav"].strip()
        if not reg or bruto == {}:
            lacre = ""
        else:
            lacre = "Sim" if leitor._sem_zeros(re.sub(r"\D", "", inv_fav) or "x") == leitor._sem_zeros(no_campo) else "Não"
        alertas = [c["alertas"]] if c["alertas"] else []
        if len(c["req"]) > 1:
            alertas.insert(0, "Mais de uma requisição")
        # A correção da FAV depende só de a FAV ter sido lida e de o lacre conferir. Problema no REDS
        # (FAV sem REDS etc.) não impede corrigir a FAV: vira alerta, e o REDS simplesmente não é gravado.
        if reg is None or not bruto:
            situacao = "Erro: FAV não lida"
        elif lacre != "Sim":
            situacao = "Conferir: lacre não confere"
        else:
            situacao = leitor.SIT_OK
        if c["situacao"] and c["situacao"] != leitor.SIT_OK:
            alertas.append(c["situacao"].replace("Erro: ", "") + " (REDS não será gravado)")
        reds_ok = c["situacao"] == leitor.SIT_OK
        reds = c["reds"] + [""] * 3
        req = c["req"]
        linhas.append([v["id"], v["categoria"], no_campo, v["fav"], inv_fav, lacre,
                       reds[0], reds[1], reds[2], c["reds_gravar"] if reds_ok else "",
                       c["pje"], "; ".join(alertas)]
                      + [req[i] if i < len(req) else "" for i in range(MAX_REQ)]
                      + [v["involucros_ativos"],
                         requisicao_confere(req, separar(v["involucros_ativos"])) if reg and reg.get("bruto") else "",
                         v["requisicoes_ativas"], situacao, ""])
    i_sit, i_alerta = cab.index("Situação"), cab.index("Alerta")

    def cor(l):
        if l[i_sit] != leitor.SIT_OK:
            return FUNDO_ERRO
        return FUNDO_ALERTA if l[i_alerta] else None

    wb = Workbook()
    ws = wb.active
    ws.title = "Correções Munições"
    escrever_aba(ws, cab, linhas, {"Id do vestígio": 38, "Alerta": 45, "Situação": 30}, cor)
    resumo = [["Vestígios", len(linhas)]]
    resumo += [["Situação: " + k, n] for k, n in Counter(l[i_sit] for l in linhas).most_common()]
    resumo += [["Lacre confere? " + (k or "(não lida)"), n] for k, n in Counter(l[5] for l in linhas).most_common()]
    resumo += [["Requisição confere? " + (k or "(não lida)"), n]
               for k, n in Counter(l[cab.index("Requisição confere?")] for l in linhas).most_common()]
    escrever_aba(wb.create_sheet("Resumo"), ["Item", "Quantidade"], resumo, {"Item": 60})
    wb.save(args.saida)
    print(f"Gravado: {args.saida}")
    for item in resumo:
        print(f"  {item[0]}: {item[1]}")
    return 0


# ---------------------------------------------------------------------------
# Pendências para correção manual (uma aba por tipo de problema)
# ---------------------------------------------------------------------------

def ler_aba(caminho: str, aba: str) -> list[dict]:
    from openpyxl import load_workbook
    ws = load_workbook(caminho, read_only=True)[aba]
    it = ws.iter_rows(values_only=True)
    cab = [str(c or "") for c in next(it)]
    return [{cab[i]: ("" if v is None else str(v)) for i, v in enumerate(r)} for r in it]


LEIA_ME = [
    ["Aba", "O que é", "O que fazer"],
    ["1 Cadastro em dobro", "Mesma FAV, categoria e invólucro em 2 ou mais vestígios, com algum dado diferente. "
     "(Os idênticos não estão aqui: o script exclui sozinho.)",
     "Decidir qual vestígio fica e excluir o outro pela tela. Corrigir no que fica o que estiver faltando."],
    ["2 FAV repetida", "A mesma FAV em vestígios diferentes, e o invólucro de nenhum deles bate com o da FAV no PCNET.",
     "Abrir a FAV no PCNET e ver de qual vestígio ela é. No outro, a FAV está errada: corrigir pela tela."],
    ["3 Requisição não confere", "Nenhuma requisição da FAV está no vestígio, e o invólucro também não bate.",
     "Conferir no PCNET se a FAV do vestígio está certa (pode estar digitada errada ou trocada com outro)."],
    ["4 Requisição a corrigir", "A FAV está certa (o invólucro bate), mas a requisição no EvidenceOS é diferente "
     "da que está na FAV. Quase sempre é digitação.", "Opcional: corrigir a requisição pela tela. O REDS será gravado de qualquer forma."],
    ["5 Munições", "Munições da planilha antiga com colunas deslocadas que o script não corrige sozinho.",
     "'Conferir': marcar 'Sim' em Conferido na planilha das munições, se a FAV correta estiver certa. "
     "'Sem FAV': achar a FAV pelo lacre no PCNET (Movimentação FAV)."],
    ["6 Cadastro", "Vestígio sem FAV, com FAV que não é número, ou com FAV que não existe no PCNET.",
     "Achar a FAV certa (pelo invólucro, na Movimentação FAV do PCNET) e corrigir pela tela."],
    ["7 Sem REDS no PCNET", "A FAV existe, mas o campo REDS dela está vazio no próprio PCNET.",
     "Nada obrigatório: vestígio antigo pode ficar sem REDS. Se quiser, buscar o REDS pelo Nº PCnet."],
    ["8 Invólucro não confere", "A FAV e a requisição estão certas (o REDS foi gravado), mas o invólucro no "
     "EvidenceOS é diferente do invólucro atual da FAV no PCNET. Pode ser troca de invólucro ou erro de digitação "
     "(ex.: FAV 1788081, invólucro 8057180 que não existe na FAV).",
     "Abrir a FAV no PCNET (Movimentação FAV). Se o invólucro do EvidenceOS não aparece em lugar algum, é erro: "
     "corrigir pela tela para o invólucro atual da FAV."],
]


def cmd_pendencias(args) -> int:
    pri = ler_aba(args.principal, "Conferência")
    mun = ler_aba(args.municoes, "Correções Munições")
    dobro = ler_csv(args.dobro)
    inv = {json.loads(l)["fav"]: json.loads(l) for l in Path(args.investigacao).read_text(encoding="utf-8").splitlines() if l.strip()}
    em_dobro = {d["id"] for d in dobro}
    mun_ids = {m["Id do vestígio"] for m in mun}

    base = ["FAV", "Id do vestígio", "Categoria", "Município", "Requisições no EvidenceOS", "Requisição 1",
            "Requisição 2", "Invólucros no EvidenceOS", "Invólucro atual na FAV", "Situação"]
    pega = lambda l: [l.get(k, "") for k in base]

    abas = {}
    abas["1 Cadastro em dobro"] = (
        ["FAV", "Id do vestígio", "Categoria", "Material", "Município", "Data de coleta", "Destinação",
         "Conservação", "Invólucros", "Requisições", "Cadastrado em", "Tem histórico", "Corrigido"],
        [[d["fav"], d["id"], d["categoria"], d["material"], d["municipio"], d["data_coleta"], d["destinacao"],
          d["estado_conservacao"], d["involucros"], d["requisicoes"], d["cadastrado_em"],
          "Sim" if d["historico"] not in ("0", "") else "", ""] for d in dobro if d["tratamento"] == "Conferir"])
    abas["2 FAV repetida"] = (base + ["Requisição confere?", "Corrigido"], sorted(
        [pega(l) + [l["Requisição confere?"], ""] for l in pri
         if l["Situação"] == "FAV repetida no EvidenceOS" and l["Id do vestígio"] not in em_dobro],
        key=lambda r: int(r[0]) if r[0].isdigit() else 0))
    abas["3 Requisição não confere"] = (base + ["Corrigido"],
        [pega(l) + [""] for l in pri if l["Situação"] == "Conferir: requisição não confere"])
    abas["4 Requisição a corrigir"] = (base + ["Corrigido"],
        [pega(l) + [""] for l in pri if l["Situação"] == "OK" and "conferir a requisição" in l["Alerta"]])
    abas["5 Munições"] = (
        ["Id do vestígio", "Hoje no campo FAV (é o lacre)", "FAV correta (campo município)", "Invólucro atual na FAV",
         "Requisição confere?", "Situação", "Corrigido"],
        [[m["Id do vestígio"], m["Hoje no campo FAV (é o lacre)"], m["FAV correta (campo município)"],
          m["Invólucro atual na FAV (PCNET)"], m["Requisição confere?"], m["Situação"], ""] for m in mun if m["Situação"] != "OK"]
        + [[l["Id do vestígio"], l["FAV"], "", "", "", "Sem FAV no campo município: achar pelo lacre", ""]
           for l in pri if l["Situação"].startswith("Erro: FAV fora da faixa") and l["Id do vestígio"] not in mun_ids])
    cadastro = [l for l in pri if l["Situação"] in ("Erro: Sem FAV", "Erro: FAV não numérica")
                or l["Situação"].startswith("Erro: PCNET não devolveu PDF")]
    abas["6 Cadastro"] = (base[:4] + ["Invólucros no EvidenceOS", "Motivo", "Corrigido"],
        [[l["FAV"], l["Id do vestígio"], l["Categoria"], l["Município"], l["Invólucros no EvidenceOS"],
          "FAV não existe no PCNET" if "PDF" in l["Situação"] else l["Situação"].replace("Erro: ", ""), ""] for l in cadastro])
    sem = [l for l in pri if l["Situação"] == "Erro: FAV sem REDS"]
    abas["7 Sem REDS no PCNET"] = (["FAV", "Id do vestígio", "Categoria", "Nº PCnet (procedimento)",
                                    "REDS achado em outro ponto da FAV", "REDS lançado"],
        [[l["FAV"], l["Id do vestígio"], l["Categoria"], (inv.get(l["FAV"].lstrip("0")) or {}).get("pcnet") or "",
          ", ".join(sorted({a["reds"] for a in (inv.get(l["FAV"].lstrip("0")) or {}).get("reds_no_pdf", [])})), ""]
         for l in sem]
        + [[m["FAV correta (campo município)"], m["Id do vestígio"], "Munições", "", "", ""]
           for m in mun if m["Situação"] == "OK" and not m["REDS a gravar"]])
    # Acrescentado em 24/11 (amostra do usuário): o invólucro não entra na regra do REDS (P8), mas um invólucro que
    # não confere pode ser digitação no EvidenceOS. Fica só como pendência; o REDS dessas linhas é gravado.
    abas["8 Invólucro não confere"] = (base + ["Corrigido"], sorted(
        [pega(l) + [""] for l in pri
         if l["Situação"] == "OK" and l["Invólucro confere?"] == "Não" and l["Id do vestígio"] not in em_dobro],
        key=lambda r: int(r[0]) if r[0].isdigit() else 0))

    # Notas do que já foi conferido no PCNET (ex.: amostra de 24/11), para a funcionária não refazer. CSV com
    # aba (prefixo do nome, ex. "8"), fav, id (opcional: vazio vale para todas as linhas da FAV na aba) e nota.
    if args.notas:
        notas = ler_csv(args.notas)
        sem_uso = list(notas)
        for nome, (cab, rows) in abas.items():
            i_fav = cab.index("FAV") if "FAV" in cab else None
            i_id = cab.index("Id do vestígio") if "Id do vestígio" in cab else None
            cab.append("Já conferido no PCNET")
            for r in rows:
                achadas = [n for n in notas if nome.split()[0] == n["aba"].strip()
                           and i_fav is not None and r[i_fav] == n["fav"].strip()
                           and (not n["id"].strip() or (i_id is not None and r[i_id].startswith(n["id"].strip())))]
                r.append(" | ".join(n["nota"] for n in achadas))
                sem_uso = [n for n in sem_uso if n not in achadas]
        for n in sem_uso:
            print(f"  AVISO: nota sem linha correspondente: aba {n['aba']}, FAV {n['fav']}, id {n['id']}")

    wb = Workbook()
    ws = wb.active
    ws.title = "Leia-me"
    resumo = [r + [len(abas[r[0]][1]) if r[0] in abas else "Linhas"] for r in LEIA_ME]
    escrever_aba(ws, resumo[0], resumo[1:], {"O que é": 70, "O que fazer": 70, "Aba": 24})
    for c in ws.iter_rows(min_row=2):
        for cel in c:
            cel.alignment = Alignment(wrap_text=True, vertical="top")
    for nome, (cab, rows) in abas.items():
        escrever_aba(wb.create_sheet(nome), cab, rows, {"Id do vestígio": 38, "Situação": 34, "Material": 40,
                                                        "Já conferido no PCNET": 60})
    wb.save(args.saida)
    print(f"Gravado: {args.saida}")
    for nome, (_, rows) in abas.items():
        print(f"  {len(rows):4}  {nome}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for nome, func in (("principal", cmd_principal), ("municoes", cmd_municoes)):
        s = sub.add_parser(nome)
        s.add_argument("--lista", required=True)
        s.add_argument("--progresso", required=True, nargs="+")
        s.add_argument("--saida", required=True)
        s.add_argument("--fav-max", type=int, default=2_500_000)
        s.set_defaults(func=func)
    s = sub.add_parser("pendencias", help="arquivo para as correções manuais, uma aba por tipo")
    s.add_argument("--principal", required=True, help="conferencia-reds-pje.xlsx")
    s.add_argument("--municoes", required=True, help="correcoes-municoes.xlsx")
    s.add_argument("--dobro", required=True, help="cadastro-em-dobro.csv (do banco restaurado)")
    s.add_argument("--investigacao", required=True, help="investigacao.jsonl (FAVs com erro relidas)")
    s.add_argument("--notas", help="CSV aba,fav,id,nota com o que já foi conferido no PCNET (opcional)")
    s.add_argument("--saida", required=True)
    s.set_defaults(func=cmd_pendencias)
    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
