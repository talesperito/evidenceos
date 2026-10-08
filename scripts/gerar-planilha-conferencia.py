"""Transforma o bloco da conferência de dados em planilha (Excel + CSV) para correção manual.

O console do Easypanel não tem download. O caminho é:
  1. No console do serviço `api`, em /app:  node scripts/conferencia-dados.cjs --bloco
     (se o script avisar que há mais partes, rodar também as outras)
  2. Copiar cada parte, da linha =====INICIO ... até =====FIM ...=====, para um arquivo local.
     Espaços e quebras de linha a mais da colagem são ignorados.
  3. python scripts/gerar-planilha-conferencia.py gerar <arquivo>

Comandos:
  gerar <arquivo...>        confere a integridade do bloco, compara com a rodada anterior e
                            grava o Excel e o CSV em database/conferencias/<unidade>/saida/
  conferidos <planilha>     lê a coluna "Conferência" de uma planilha devolvida pela técnica:
                            "Conferido - está certo" deixa de aparecer nas próximas rodadas;
                            "Corrigido" passa a ser cobrado se o achado continuar aparecendo
  desfazer --fav <número>   apaga as marcações de uma FAV (o achado volta a aparecer)

Tudo o que este script grava fica em database/conferencias/, fora do Git: são dados de custódia.
Design: docs/plans/2026-10-08-conferente-vestigios-design.md
Requer: Python 3 + openpyxl.
"""
import argparse
import base64
import csv
import gzip
import hashlib
import json
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter, quote_sheetname
from openpyxl.worksheet.datavalidation import DataValidation

RAIZ = Path(__file__).resolve().parent.parent
BASE = RAIZ / "database" / "conferencias"

ACEITO = "Conferido - está certo"
CORRIGIDO = "Corrigido"
NOVO = "Novo"
JA_ESTAVA = "Já estava"
CONTINUA = "Marcado como corrigido, mas continua"

PARTE = re.compile(
    r"=====INICIO parte=(\d+)/(\d+) sha=([0-9a-f]+) gerado=(\S+?)=====(.*?)=====FIM parte=\1/\2=====", re.S
)


def falhar(mensagem):
    sys.exit(f"ERRO: {mensagem}")


# ------------------------------------------------------------------ bloco

def ler_bloco(caminhos):
    """Junta as partes, confere contagem e hash, devolve (payload, carimbo da rodada)."""
    texto = "\n".join(Path(c).read_text(encoding="utf-8", errors="replace") for c in caminhos)
    execucoes = defaultdict(dict)  # (sha, total de partes) -> {numero: (gerado, corpo)}
    for numero, total, sha, gerado, corpo in PARTE.findall(texto):
        execucoes[(sha, int(total))][int(numero)] = (gerado, corpo)
    if not execucoes:
        falhar("nenhum bloco encontrado. Copie da linha =====INICIO ... até a linha =====FIM ...=====, inclusive.")

    def carimbo(partes):
        return min(gerado for gerado, _ in partes.values())

    # Vale a execução mais recente do arquivo. Uma sobra antiga, mesmo completa, nunca é usada no
    # lugar dela: o relatório sairia com dados velhos e data velha, sem ninguém notar.
    (sha, total), partes = max(execucoes.items(), key=lambda item: carimbo(item[1]))
    if len(partes) < total:
        # Mesmos dados copiados de novo com outro tamanho de parte (--linhas-por-parte): serve.
        mesmos_dados = [(chave, p) for chave, p in execucoes.items() if chave[0] == sha and len(p) == chave[1]]
        if mesmos_dados:
            (sha, total), partes = mesmos_dados[0]
        else:
            faltam = [n for n in range(1, total + 1) if n not in partes]
            outras = (" Há no arquivo partes de outra execução: se os dados mudaram entre uma parte e outra, rode todas de novo, em seguida."
                      if len({chave[0] for chave in execucoes}) > 1 else "")
            falhar(f"o relatório tem {total} parte(s) e falta(m) a(s) parte(s) {faltam}. "
                   f"Rode: node scripts/conferencia-dados.cjs --bloco --parte N.{outras}")

    b64 = re.sub(r"[^A-Za-z0-9+/=]", "", "".join(partes[n][1] for n in range(1, total + 1)))
    try:
        conteudo = gzip.decompress(base64.b64decode(b64)).decode("utf-8")
    except Exception as erro:  # colagem truncada ou corrompida
        falhar(f"o bloco não pôde ser descompactado ({erro}). A colagem veio incompleta: copie de novo.")
    conferido = hashlib.sha256(conteudo.encode("utf-8")).hexdigest()[:12]
    if conferido != sha:
        falhar(f"integridade falhou (hash {conferido}, esperado {sha}). Copie o bloco de novo.")
    return json.loads(conteudo), carimbo(partes)


def expandir(payload):
    """Uma linha por achado, com os textos das regras e a ficha do vestígio já resolvidos."""
    campos = payload["camposVestigio"]

    def preencher(modelo, ficha):
        return re.sub(r"\{(\w+)\}", lambda m: ficha[campos.index(m.group(1))] or "(vazio)", modelo)

    linhas = []
    for posicao, codigo, grupo, acao, certeza, campo, valor, obs in payload["achados"]:
        ficha = payload["vestigios"][posicao]
        regra = payload["regras"][codigo]
        linha = dict(zip(campos, ficha))
        linha.update(
            aba=regra["familia"], regra=codigo, grupo=grupo, problema=regra["problema"],
            campo=campo or regra.get("campo") or "",
            valor=valor or (preencher(regra["valorModelo"], ficha) if regra.get("valorModelo") else ""),
            acao=acao or regra.get("acao") or "",
            certeza=certeza or regra["certeza"],
            obs=obs or (preencher(regra["obsModelo"], ficha) if regra.get("obsModelo") else ""),
            ref=ficha[0][:8],
        )
        linhas.append(linha)

    membros = defaultdict(list)
    for linha in linhas:
        if linha["grupo"]:
            membros[linha["grupo"]].append(linha["id"])
    for linha in linhas:
        # Histórico: o achado é "o mesmo" se a regra e o vestígio são os mesmos.
        linha["chave_hist"] = f'{linha["regra"]}|{linha["id"]}'
        # Marcação da técnica: vale enquanto o que ela viu não mudar. Num grupo de repetidos, isso é
        # o conjunto de registros do grupo (entrou um terceiro, volta a aparecer); nas demais regras,
        # o valor apontado. O número do grupo (A-016) não serve: ele muda quando outros são resolvidos.
        if linha["grupo"]:
            visto = hashlib.sha1(",".join(sorted(membros[linha["grupo"]])).encode()).hexdigest()[:10]
        else:
            visto = linha["valor"]
        linha["chave"] = f'{linha["chave_hist"]}|{visto}'
    return linhas


# ------------------------------------------------------------------ estado local

def pasta_da_unidade(unidade, banco):
    # Uma pasta por unidade E por banco: o histórico de um teste local não se mistura ao da produção.
    pasta = BASE / f"{unidade}__{banco}"
    (pasta / "rodadas").mkdir(parents=True, exist_ok=True)
    (pasta / "saida").mkdir(parents=True, exist_ok=True)
    return pasta


def ler_marcacoes(pasta):
    arquivo = pasta / "marcacoes.json"
    return json.loads(arquivo.read_text(encoding="utf-8")) if arquivo.exists() else {}


def gravar_marcacoes(pasta, marcacoes):
    (pasta / "marcacoes.json").write_text(json.dumps(marcacoes, ensure_ascii=False, indent=1), encoding="utf-8")


# ------------------------------------------------------------------ planilha

FONTE = "Arial"
fino = Side(style="thin", color="BFBFBF")
BORDA = Border(left=fino, right=fino, top=fino, bottom=fino)
CAB_FILL = PatternFill("solid", fgColor="1F2937")
CAB_FONT = Font(name=FONTE, bold=True, color="FFFFFF", size=10)
TEXTO = Font(name=FONTE, size=9)
TEXTO10 = Font(name=FONTE, size=10)
FAIXA = PatternFill("solid", fgColor="F3F4F6")
ENTRADA = PatternFill("solid", fgColor="FFF9C4")  # células que a técnica preenche

COR_CERTEZA = {
    "Certo": ("FECACA", "7F1D1D"), "Provável": ("FFD8A8", "7C2D12"), "Indício": ("FEF08A", "713F12"),
    "Conferir": ("FEF08A", "713F12"), "Provável legítimo": ("BBF7D0", "14532D"),
}


def cor_acao(acao):
    a = acao.upper()
    if a.startswith("APAGAR DEPOIS"): return "FFD8A8", "7C2D12"
    if a.startswith("APAGAR"): return "FECACA", "7F1D1D"
    if a.startswith("MANTER E ADIC"): return "BFDBFE", "1E3A8A"
    if a.startswith("MANTER"): return "BBF7D0", "14532D"
    if a.startswith("DUPLICATA"): return "E9D5FF", "581C87"
    if a.startswith("NÃO "): return "E5E7EB", "374151"
    return None


# (título, campo da linha, largura, quebra de texto)
COLUNAS = [
    ("Grupo", "grupo", 9, False),
    ("FAV", "fav", 11, False),
    ("Ref (início do código no card)", "ref", 13, True),
    ("Problema", "problema", 34, True),
    ("Onde corrigir", "campo", 24, True),
    ("Valor atual", "valor", 22, True),
    ("Ação sugerida", "acao", 40, True),
    ("Certeza", "certeza", 11, True),
    ("Situação", "situacao", 15, True),
    ("Categoria", "cat", 16, True),
    ("Material", "material", 24, True),
    ("Invólucro(s)", "invs", 18, True),
    ("Requisição(ões)", "reqs", 20, True),
    ("Município", "municipio", 18, True),
    ("Data de entrada", "coleta", 12, False),
    ("Origem", "origem", 22, True),
    ("Histórico", "historico", 18, True),
    ("Observação", "obs", 60, True),
    ("Conferência", None, 22, False),
    ("Obs. da técnica", None, 30, True),
    ("Chave", "chave", 12, False),
]
COMO_TEXTO = {"fav", "ref", "valor", "invs", "reqs", "chave"}  # preserva zero à esquerda


def montar_aba(ws, linhas, com_grupo):
    colunas = [c for c in COLUNAS if com_grupo or c[0] != "Grupo"]
    letra = {titulo: get_column_letter(i) for i, (titulo, *_) in enumerate(colunas, 1)}
    ws.append([titulo for titulo, *_ in colunas])
    for i, (_, _, largura, _) in enumerate(colunas, 1):
        ws.column_dimensions[get_column_letter(i)].width = largura
    for celula in ws[1]:
        celula.font, celula.fill, celula.border = CAB_FONT, CAB_FILL, BORDA
        celula.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 30

    anterior, alterna = None, False
    for linha in linhas:
        marca = linha["grupo"] if com_grupo else linha["regra"]
        if marca != anterior:
            alterna, anterior = not alterna, marca
        ws.append([linha.get(campo, "") if campo else "" for _, campo, _, _ in colunas])
        n = ws.max_row
        for celula, (titulo, campo, _, quebra) in zip(ws[n], colunas):
            celula.font, celula.border = TEXTO, BORDA
            celula.alignment = Alignment(vertical="top", wrap_text=quebra)
            if alterna:
                celula.fill = FAIXA
            if campo in COMO_TEXTO:
                celula.number_format = "@"
            if campo is None:
                celula.fill = ENTRADA
        cores = cor_acao(linha["acao"])
        if cores:
            celula = ws[f'{letra["Ação sugerida"]}{n}']
            celula.fill, celula.font = PatternFill("solid", fgColor=cores[0]), Font(name=FONTE, size=9, bold=True, color=cores[1])
        fundo, tinta = COR_CERTEZA.get(linha["certeza"], ("FFFFFF", "000000"))
        celula = ws[f'{letra["Certeza"]}{n}']
        celula.fill, celula.font = PatternFill("solid", fgColor=fundo), Font(name=FONTE, size=9, bold=True, color=tinta)
        ws[f'{letra["Ref (início do código no card)"]}{n}'].font = Font(name="Consolas", size=9)
        if linha["situacao"] == NOVO:
            ws[f'{letra["Situação"]}{n}'].font = Font(name=FONTE, size=9, bold=True, color="1D4ED8")
        elif linha["situacao"] == CONTINUA:
            ws[f'{letra["Situação"]}{n}'].font = Font(name=FONTE, size=9, bold=True, color="B91C1C")

    ultima = max(ws.max_row, 2)
    ws.freeze_panes = f'{letra["Problema"]}2'
    ws.auto_filter.ref = f"A1:{get_column_letter(len(colunas))}{ultima}"
    ws.column_dimensions[letra["Chave"]].hidden = True
    opcoes = DataValidation(type="list", formula1=f'"{CORRIGIDO},{ACEITO}"', allow_blank=True)
    ws.add_data_validation(opcoes)
    opcoes.add(f'{letra["Conferência"]}2:{letra["Conferência"]}{ultima}')
    # Linha já tratada fica acinzentada e riscada.
    ws.conditional_formatting.add(
        f'A2:{get_column_letter(len(colunas))}{ultima}',
        FormulaRule(formula=[f'LEN(${letra["Conferência"]}2)>0'], font=Font(color="9CA3AF", strike=True)),
    )
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
    ws.print_title_rows = "1:1"
    ws.page_margins.left = ws.page_margins.right = 0.3
    return letra, ultima


def lista_simples(ws, titulos, larguras, linhas):
    ws.append(titulos)
    for i, largura in enumerate(larguras, 1):
        ws.column_dimensions[get_column_letter(i)].width = largura
    for celula in ws[1]:
        celula.font, celula.fill, celula.border = CAB_FONT, CAB_FILL, BORDA
    for linha in linhas:
        ws.append(linha)
        for celula in ws[ws.max_row]:
            celula.font, celula.border, celula.number_format = TEXTO, BORDA, "@"
            celula.alignment = Alignment(vertical="top", wrap_text=True)
    ws.freeze_panes = "A2"


def montar_resumo(ws, payload, gerado, abas, numeros, anterior):
    for coluna, largura in zip("ABCDEFG", (24, 52, 34, 16, 9, 9, 9)):
        ws.column_dimensions[coluna].width = largura
    unidade = payload["unidade"].capitalize()
    ws["A1"] = f"Conferência de vestígios · unidade {unidade}"
    ws["A1"].font = Font(name=FONTE, size=14, bold=True)
    dia = f"{gerado[8:10]}/{gerado[5:7]}/{gerado[0:4]}"
    ws["A2"] = (f"Rodada de {dia} · banco {payload['banco']} · {payload['ativos']} vestígios ativos · {numeros['total']} achados em "
                f"{numeros['vestigios']} vestígios. Só leitura: nada foi alterado no sistema.")
    if anterior:
        ws["A3"] = (f"Desde a rodada de {anterior[8:10]}/{anterior[5:7]}/{anterior[0:4]}: {numeros['novos']} achados novos, "
                    f"{numeros['resolvidos']} resolvidos (aba Resolvidos), {numeros['continuam']} marcados como corrigidos "
                    f"que continuam aparecendo. {numeros['ocultos']} já conferidos ficam na aba Já conferidos.")
    else:
        ws["A3"] = "Primeira rodada desta unidade: não há comparação, então tudo aparece como Novo."
    for ref in ("A2", "A3"):
        ws[ref].font = TEXTO10
        ws[ref].alignment = Alignment(wrap_text=True, vertical="top")
        ws.merge_cells(f"{ref}:G{ref[1:]}")
        ws.row_dimensions[int(ref[1:])].height = 30

    ws["A5"] = "Como usar"
    ws["A5"].font = Font(name=FONTE, size=11, bold=True)
    passos = [
        "1. Cada aba é um tipo de problema. Comece pelas linhas com Certeza = Certo e Situação = Novo.",
        "2. Para achar o vestígio no sistema, busque pela FAV (sem FAV, busque pelo invólucro). Se aparecer mais de um card, o 'Ref:' do card começa com os caracteres da coluna Ref.",
        "3. A coluna 'Onde corrigir' diz qual campo mexer; 'Ação sugerida' diz o que fazer. Na aba Repetidos, as linhas do mesmo Grupo são os registros repetidos entre si.",
        "4. Toda correção e toda exclusão é feita pela tela do EvidenceOS: fica nos Logs de Auditoria com o seu usuário.",
        "5. Ao terminar uma linha, preencha a coluna Conferência (amarela). Devolva a planilha ao final: é ela que evita que o já conferido volte na próxima rodada.",
        "6. Linha com algo na coluna Histórico tem movimentação, retirada ou acesso ao PCNET: não apagar sem conferir.",
    ]
    for i, passo in enumerate(passos, 6):
        ws.cell(i, 1, passo).font = TEXTO10
        ws.merge_cells(start_row=i, start_column=1, end_row=i, end_column=7)
        ws.cell(i, 1).alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[i].height = 28

    topo = 6 + len(passos) + 1
    for j, titulo in enumerate(["Aba", "Problema", "Onde corrigir", "Certeza", "Total", "Novos", "Feitos"], 1):
        celula = ws.cell(topo, j, titulo)
        celula.font, celula.fill, celula.border = CAB_FONT, CAB_FILL, BORDA
        celula.alignment = Alignment(horizontal="center")
    r = topo
    for regra in payload["regras"].values():
        r += 1
        letra, ultima = abas[regra["familia"]]
        aba = quote_sheetname(regra["familia"])
        problemas = f'{aba}!${letra["Problema"]}$2:${letra["Problema"]}${ultima}'
        situacoes = f'{aba}!${letra["Situação"]}$2:${letra["Situação"]}${ultima}'
        feitos = f'{aba}!${letra["Conferência"]}$2:${letra["Conferência"]}${ultima}'
        valores = [regra["familia"], regra["problema"], regra.get("campo") or "Ver a linha", regra["certeza"],
                   f"=COUNTIF({problemas},B{r})",
                   f'=COUNTIFS({problemas},B{r},{situacoes},"{NOVO}")',
                   f'=COUNTIFS({problemas},B{r},{feitos},"<>")']
        for j, valor in enumerate(valores, 1):
            celula = ws.cell(r, j, valor)
            celula.font, celula.border = TEXTO10, BORDA
            celula.alignment = Alignment(wrap_text=True, vertical="top", horizontal="center" if j >= 4 else "left")
    r += 1
    ws.cell(r, 2, "Total").font = Font(name=FONTE, size=10, bold=True)
    for j in (5, 6, 7):
        coluna = get_column_letter(j)
        celula = ws.cell(r, j, f"=SUM({coluna}{topo + 1}:{coluna}{r - 1})")
        celula.font, celula.alignment = Font(name=FONTE, size=10, bold=True), Alignment(horizontal="center")
    ws.cell(r + 1, 1, "Total, Novos e Feitos são calculados a partir das abas: Feitos sobe conforme a coluna Conferência é preenchida. "
                      "Regra com Total 0 foi testada e não encontrou nada.").font = Font(name=FONTE, size=9, italic=True, color="6B7280")

    r += 3
    ws.cell(r, 1, "O que preencher (colunas amarelas)").font = Font(name=FONTE, size=11, bold=True)
    legenda = [
        ("Conferência", CORRIGIDO, "Você alterou no sistema. O achado some na próxima rodada; se continuar aparecendo, a planilha avisa."),
        ("Conferência", ACEITO, "Você conferiu e o dado está correto como está. Não aparece mais nas próximas rodadas."),
        ("Obs. da técnica", "Exemplo: Data conferida na FAV do PCNET, era 2023", "Livre. Anote o que encontrou ou a dúvida que ficou."),
    ]
    for coluna_nome, valor, explicacao in legenda:
        r += 1
        ws.cell(r, 1, coluna_nome).font = Font(name=FONTE, size=10, bold=True)
        ws.cell(r, 2, valor).font = TEXTO10
        ws.cell(r, 2).fill = ENTRADA
        ws.cell(r, 3, explicacao).font = TEXTO10
        ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=7)
        ws.cell(r, 3).alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[r].height = 28

    r += 2
    ws.cell(r, 1, "Coluna Certeza").font = Font(name=FONTE, size=11, bold=True)
    niveis = [
        ("Certo", "O dado está faltando ou errado, sem dúvida."),
        ("Provável", "Quase sempre é erro. Confira e corrija."),
        ("Indício", "Foge do padrão da base. Pode estar certo: confira antes de mexer."),
        ("Conferir", "Os dados não bastam para decidir. Só o PCNET ou o objeto resolvem."),
        ("Provável legítimo", "Em geral está certo. Listado para ciência."),
    ]
    for nivel, explicacao in niveis:
        r += 1
        fundo, tinta = COR_CERTEZA[nivel]
        ws.cell(r, 1, nivel).font = Font(name=FONTE, size=10, bold=True, color=tinta)
        ws.cell(r, 1).fill = PatternFill("solid", fgColor=fundo)
        ws.cell(r, 2, explicacao).font = TEXTO10
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=7)
    ws.page_setup.orientation = "landscape"
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0


# ------------------------------------------------------------------ comandos

def gerar(args):
    payload, gerado = ler_bloco(args.arquivos)
    unidade, banco = payload["unidade"], payload["banco"]
    pasta = pasta_da_unidade(unidade, banco)
    linhas = expandir(payload)
    print(f"Integridade OK: unidade {unidade}, banco {banco}, rodada {gerado}, {len(linhas)} achados.")

    anteriores = sorted(p for p in (pasta / "rodadas").glob("*.json") if p.stem < gerado)
    anterior = anteriores[-1].stem if anteriores else None
    linhas_antes = expandir(json.loads(anteriores[-1].read_text(encoding="utf-8"))) if anteriores else []
    chaves_antes = {linha["chave_hist"] for linha in linhas_antes}
    chaves_agora = {linha["chave_hist"] for linha in linhas}
    marcacoes = ler_marcacoes(pasta)

    visiveis, ocultos = [], []
    for linha in linhas:
        marca = marcacoes.get(linha["chave"])
        if marca and marca["status"] == "aceito":
            linha["marca"] = marca
            ocultos.append(linha)
            continue
        if marca and marca["status"] == "corrigido":
            linha["situacao"] = CONTINUA
        elif anterior and linha["chave_hist"] in chaves_antes:
            linha["situacao"] = JA_ESTAVA
        else:
            linha["situacao"] = NOVO
        visiveis.append(linha)

    resolvidos, vistos = [], set()
    for linha in linhas_antes:
        if linha["chave_hist"] not in chaves_agora and linha["chave_hist"] not in vistos:
            vistos.add(linha["chave_hist"])
            resolvidos.append(linha)

    numeros = {
        "total": len(visiveis),
        "vestigios": len({linha["id"] for linha in visiveis}),
        "novos": sum(linha["situacao"] == NOVO for linha in visiveis),
        "continuam": sum(linha["situacao"] == CONTINUA for linha in visiveis),
        "resolvidos": len(resolvidos),
        "ocultos": len(ocultos),
    }

    wb = Workbook()
    wb.calculation.fullCalcOnLoad = True
    resumo = wb.active
    resumo.title = "Resumo"
    abas = {}
    for familia in payload["familias"]:
        ws = wb.create_sheet(familia)
        abas[familia] = montar_aba(ws, [linha for linha in visiveis if linha["aba"] == familia], familia == "Repetidos")
    montar_resumo(resumo, payload, gerado, abas, numeros, anterior)
    if resolvidos:
        lista_simples(wb.create_sheet("Resolvidos"), ["Aba", "Problema", "FAV", "Ref", "Valor na rodada anterior", "Categoria", "Material"],
                      (22, 44, 12, 12, 30, 18, 28),
                      [[l["aba"], l["problema"], l["fav"], l["ref"], l["valor"], l["cat"], l["material"]] for l in resolvidos])
    if ocultos:
        lista_simples(wb.create_sheet("Já conferidos"), ["Aba", "Problema", "FAV", "Ref", "Valor atual", "Conferido em", "Obs. da técnica"],
                      (22, 44, 12, 12, 30, 14, 40),
                      [[l["aba"], l["problema"], l["fav"], l["ref"], l["valor"], l["marca"]["em"], l["marca"].get("obs", "")] for l in ocultos])
    meta = wb.create_sheet("_meta")
    meta.append(["unidade", unidade])
    meta.append(["gerado", gerado])
    meta.append(["banco", banco])
    meta.sheet_state = "hidden"

    nome = f"Conferencia-vestigios-{unidade}-{gerado[:10]}"
    saida = Path(args.saida) if args.saida else pasta / "saida"
    saida.mkdir(parents=True, exist_ok=True)
    xlsx, arquivo_csv = saida / f"{nome}.xlsx", saida / f"{nome}.csv"
    wb.save(xlsx)

    titulos = ["Aba", "Grupo", "FAV", "Ref", "Problema", "Onde corrigir", "Valor atual", "Ação sugerida", "Certeza", "Situação",
               "Categoria", "Material", "Invólucro(s)", "Requisição(ões)", "Município", "Data de entrada", "Origem", "Histórico", "Observação"]
    chaves = ["aba", "grupo", "fav", "ref", "problema", "campo", "valor", "acao", "certeza", "situacao",
              "cat", "material", "invs", "reqs", "municipio", "coleta", "origem", "historico", "obs"]
    with open(arquivo_csv, "w", encoding="utf-8-sig", newline="") as destino:  # BOM: o Excel abre com os acentos certos
        escritor = csv.writer(destino, delimiter=";")
        escritor.writerow(titulos)
        escritor.writerows([linha[chave] for chave in chaves] for linha in visiveis)

    # A rodada só entra no histórico depois de a planilha existir.
    (pasta / "rodadas" / f"{gerado}.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    por_regra = []
    for codigo, regra in payload["regras"].items():
        da_regra = [linha for linha in visiveis if linha["regra"] == codigo]
        por_regra.append({"aba": regra["familia"], "problema": regra["problema"], "certeza": regra["certeza"], "total": len(da_regra),
                          "novos": sum(linha["situacao"] == NOVO for linha in da_regra),
                          "continuam": sum(linha["situacao"] == CONTINUA for linha in da_regra),
                          "grupos": len({linha["grupo"] for linha in da_regra if linha["grupo"]})})
    print(f"Planilha: {xlsx}")
    print(f"CSV:      {arquivo_csv}")
    print(f"Rodada anterior: {anterior or 'nenhuma (primeira rodada)'}")
    for item in por_regra:
        print(f"  {item['total']:5}  (novos {item['novos']:4})  {item['aba']} · {item['problema']}")
    print(f"  {numeros['total']:5}  TOTAL · {numeros['resolvidos']} resolvidos · {numeros['ocultos']} já conferidos (ocultos) · "
          f"{numeros['continuam']} marcados como corrigidos que continuam")
    print("RESUMO_JSON=" + json.dumps({"unidade": unidade, "gerado": gerado, "anterior": anterior, "ativos": payload["ativos"],
                                       "banco": banco, "regras_da_unidade": payload["regrasDaUnidade"], **numeros, "por_regra": por_regra,
                                       "xlsx": str(xlsx), "csv": str(arquivo_csv)}, ensure_ascii=False))


def conferidos(args):
    wb = load_workbook(args.planilha)
    if "_meta" not in wb.sheetnames:
        falhar("esta planilha não foi gerada por este script (falta a aba _meta).")
    unidade, banco = wb["_meta"]["B1"].value, wb["_meta"]["B3"].value
    pasta = pasta_da_unidade(unidade, banco)
    marcacoes = ler_marcacoes(pasta)
    contagem = {"aceito": 0, "corrigido": 0}
    for ws in wb.worksheets:
        titulos = [celula.value for celula in ws[1]]
        if "Conferência" not in titulos or "Chave" not in titulos:
            continue
        pos = {titulo: titulos.index(titulo) for titulo in ("Conferência", "Chave", "Obs. da técnica", "FAV", "Problema")}
        for linha in ws.iter_rows(min_row=2, values_only=True):
            escolha, chave = linha[pos["Conferência"]], linha[pos["Chave"]]
            status = {ACEITO: "aceito", CORRIGIDO: "corrigido"}.get((escolha or "").strip())
            if not chave or not status:
                continue
            marcacoes[chave] = {"status": status, "em": date.today().isoformat(), "fav": str(linha[pos["FAV"]] or ""),
                                "problema": linha[pos["Problema"]], "obs": linha[pos["Obs. da técnica"]] or ""}
            contagem[status] += 1
    gravar_marcacoes(pasta, marcacoes)
    print(f"Unidade {unidade}: {contagem['aceito']} marcados como '{ACEITO}' (deixam de aparecer) e "
          f"{contagem['corrigido']} como '{CORRIGIDO}' (serão cobrados se continuarem aparecendo).")
    print(f"Total de marcações guardadas: {len(marcacoes)} em {pasta / 'marcacoes.json'}")


def desfazer(args):
    pasta = pasta_da_unidade(args.unidade, args.banco)
    marcacoes = ler_marcacoes(pasta)
    restam = {chave: marca for chave, marca in marcacoes.items() if marca.get("fav") != args.fav}
    gravar_marcacoes(pasta, restam)
    print(f"{len(marcacoes) - len(restam)} marcação(ões) da FAV {args.fav} apagada(s). O achado volta a aparecer na próxima rodada.")


def main():
    # O console do Windows nem sempre é UTF-8, e os dados têm acento.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Planilha da conferência de dados dos vestígios.")
    parser.add_argument("--base", help="pasta do histórico (padrão: database/conferencias). Para testes.")
    comandos = parser.add_subparsers(dest="comando", required=True)
    p = comandos.add_parser("gerar", help="bloco -> Excel + CSV")
    p.add_argument("arquivos", nargs="+")
    p.add_argument("--saida", help="pasta de destino (padrão: database/conferencias/<unidade>/saida)")
    p.set_defaults(funcao=gerar)
    p = comandos.add_parser("conferidos", help="registra o que a técnica marcou na planilha")
    p.add_argument("planilha")
    p.set_defaults(funcao=conferidos)
    p = comandos.add_parser("desfazer", help="apaga as marcações de uma FAV")
    p.add_argument("--fav", required=True)
    p.add_argument("--unidade", required=True)
    p.add_argument("--banco", required=True, help="como aparece no nome da pasta em database/conferencias/")
    p.set_defaults(funcao=desfazer)
    args = parser.parse_args()
    if args.base:
        global BASE
        BASE = Path(args.base)
    args.funcao(args)


if __name__ == "__main__":
    main()
