"""Gera os arquivos de importação a partir das planilhas CONFERIDAS pelo usuário (etapa E do plano).

Plano: docs/plans/2026-11-17-leitura-fav-reds-pje-design.md (seções 7.1, 7.2 e 7.4).

  python -E -P scripts/pcnet-gerar-importacao.py principal <conferencia-reds-pje.xlsx> <saida.json>
        linhas com Situação "OK", mais as "Conferir: …" e "FAV repetida no EvidenceOS" que o usuário marcou
        com "Sim" na coluna Conferido. Gera {id, fav, reds, pje} para server/scripts/importar-reds-pje.cjs

  python -E -P scripts/pcnet-gerar-importacao.py municoes <correcoes-municoes.xlsx> <snapshot.json> <saida.json>
        linhas com Situação "OK", mais as "Conferir: …" marcadas com "Sim". Gera o que
        server/scripts/corrigir-municoes.cjs precisa. O município vem do snapshot da planilha do Google
        (database/sheets-snapshot-latest.json), onde ele caiu no campo de data.

Linhas com "Erro: …" nunca entram: são corrigidas à mão, pela tela.
Imprime o SHA-256 do arquivo gerado: ele é conferido no console do `api` antes de qualquer gravação.
Os arquivos gerados ficam FORA do repositório.
"""
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook

SIM = {"sim", "s", "x", "ok", "conferido"}
RE_REDS = re.compile(r"^\d{4}-\d{9}-\d{3}$")
# Grafias da natureza e do município conferidas em 10/09 (ver o corrigir-municoes.cjs original).
NATUREZA = {"Intacta": "Intactas", "intactas": "Intactas", "Intacto": "Intactas",
            "Deflagadas": "Deflagradas", "Deflagrada": "Deflagradas"}
MUNICIPIO = {"ijaci": "Ijaci"}
MUNICIPIO_PADRAO = "N/I"
PLACEHOLDERS = {"", "-", "x", "n/a", "na", "n/i", "ni"}


def linhas(caminho: str, aba: str) -> list[dict]:
    ws = load_workbook(caminho, read_only=True, data_only=True)[aba]
    it = ws.iter_rows(values_only=True)
    cab = [str(c or "").strip() for c in next(it)]
    return [{cab[i]: ("" if v is None else str(v).strip()) for i, v in enumerate(row)} for row in it]


def aprovada(l: dict) -> bool:
    sit = l["Situação"]
    if sit == "OK":
        return True
    marcada = l.get("Conferido", "").strip().lower() in SIM
    return marcada and (sit.startswith("Conferir") or sit == "FAV repetida no EvidenceOS")


def pje_digitos(texto: str) -> str | None:
    d = re.sub(r"\D", "", texto or "")
    return d if len(d) == 20 else None


def reds_da_linha(l: dict) -> str | None:
    reds = l.get("REDS a gravar") or l.get("REDS 1 (FAV)") or ""
    return reds if RE_REDS.match(reds) else None


def requisicao_sem_ano(texto: str) -> str | None:
    """'2024-051772381' -> '51772381': só dígitos e sem ano, como as demais requisições do sistema."""
    grupos = re.findall(r"\d+", texto or "")
    if not grupos:
        return None
    if len(grupos) >= 2 and len(grupos[0]) == 4:
        grupos = grupos[1:]
    numero = max(grupos, key=len).lstrip("0")
    return numero or None


def gravar(dados: dict, saida: str) -> None:
    Path(saida).parent.mkdir(parents=True, exist_ok=True)
    texto = json.dumps(dados, ensure_ascii=False, indent=1)
    Path(saida).write_text(texto, encoding="utf-8")
    sha = hashlib.sha256(Path(saida).read_bytes()).hexdigest()
    print(f"Gravado: {saida}\n{len(dados['itens'])} itens\nSHA-256: {sha}")


def cmd_principal(planilha: str, saida: str) -> int:
    itens, ignoradas = [], 0
    for l in linhas(planilha, "Conferência"):
        if not aprovada(l):
            ignoradas += 1
            continue
        reds = reds_da_linha(l)
        if not reds:
            ignoradas += 1
            continue
        itens.append({"id": l["Id do vestígio"], "fav": l["FAV"], "reds": reds, "pje": pje_digitos(l["PJe (FAV)"])})
    gravar({"tipo": "reds-pje", "gerado_em": datetime.now().isoformat(timespec="seconds"),
            "origem": Path(planilha).name, "itens": itens}, saida)
    print(f"{ignoradas} linhas fora (erro, não conferidas ou sem REDS válido)")
    return 0


def cmd_municoes(planilha: str, snapshot: str, saida: str) -> int:
    snap = json.loads(Path(snapshot).read_text(encoding="utf-8"))
    municoes = [i for i in snap["items"] if str(i.get("planilhaOrigem") or "").strip() == "Munições"]
    # Ponte: na aba deslocada, 'fav' é o lacre e 'municipio' é a FAV verdadeira; 'data' é o município.
    por_par = {(str(i.get("fav") or "").strip(), str(i.get("municipio") or "").strip()): i for i in municoes}

    itens, ignoradas, sem_municipio = [], 0, 0
    for l in linhas(planilha, "Correções Munições"):
        if not aprovada(l):
            ignoradas += 1
            continue
        lacre, fav = l["Hoje no campo FAV (é o lacre)"], l["FAV correta (campo município)"]
        inv_fav = l["Invólucro atual na FAV (PCNET)"].upper()
        # O invólucro gravado é o lacre. Só nas linhas conferidas em que o lacre não bate e a FAV traz
        # outro número de invólucro (lacre trocado depois), vale o da FAV, que é o atual.
        involucro = inv_fav if l["Lacre confere?"] == "Não" and re.fullmatch(r"[A-Z0-9]+", inv_fav) else lacre
        item = por_par.get((lacre, fav))
        muni_bruto = str((item or {}).get("data") or "").strip()
        municipio = MUNICIPIO.get(muni_bruto, muni_bruto) if muni_bruto.lower() not in PLACEHOLDERS else ""
        if not municipio:
            municipio, sem_municipio = MUNICIPIO_PADRAO, sem_municipio + 1
        natureza_bruta = l["Hoje no campo requisição (é a natureza)"]
        requisicoes = [r for r in (requisicao_sem_ano(l.get(f"Requisição {i} (FAV)", "")) for i in range(1, 6)) if r]
        itens.append({
            "id": l["Id do vestígio"],
            "fav_atual": lacre,
            "fav_correta": fav,
            "involucro": involucro,
            "requisicoes": requisicoes,
            "natureza": NATUREZA.get(natureza_bruta, natureza_bruta) or None,
            "municipio": municipio,
            # Só o "REDS a gravar": a planilha o deixa vazio quando a leitura do REDS teve problema.
            "reds": l["REDS a gravar"] if RE_REDS.match(l["REDS a gravar"]) else None,
            "pje": pje_digitos(l["PJe (FAV)"]),
            "fonte": "PCNET (lacre confere)" if l["Lacre confere?"] == "Sim" else "PCNET (conferido pelo usuário)",
        })
    gravar({"tipo": "correcao-municoes", "gerado_em": datetime.now().isoformat(timespec="seconds"),
            "origem": Path(planilha).name, "itens": itens}, saida)
    print(f"{ignoradas} linhas fora (erro ou não conferidas) · {sem_municipio} sem município na planilha (vão como N/I)")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) >= 4 and sys.argv[1] == "principal":
        sys.exit(cmd_principal(sys.argv[2], sys.argv[3]))
    if len(sys.argv) >= 5 and sys.argv[1] == "municoes":
        sys.exit(cmd_municoes(sys.argv[2], sys.argv[3], sys.argv[4]))
    print(__doc__)
    sys.exit(1)
