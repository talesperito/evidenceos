"""Compara dois bancos restaurados (ANTES e DEPOIS) e aponta toda mudança fora do previsto no deploy de REDS/PJe.

Plano: docs/plans/2026-11-17-leitura-fav-reds-pje-design.md (seção 12). Nunca roda contra a produção: os dois bancos
são backups restaurados num container descartável deste PC.

  python -E -P scripts/comparar-bancos-reds-pje.py --container evidenceos-restore-lavras \
      --antes lavras_original --depois lavras_restore \
      --importacao C:/tmp/pcnet-leitura/importacao-2026-11-24/importacao-reds-pje.json \
      --municoes  C:/tmp/pcnet-leitura/importacao-2026-11-24/correcao-municoes.json \
      --saida C:/tmp/pcnet-leitura/comparacao-<data>

O que é PREVISTO (tudo o mais é ALARME ou, quando há auditoria de usuário, "edição pela tela"):
  - migration: colunas numero_reds e numero_pje (nulas no ANTES) e 1 linha nova em _prisma_migrations;
  - importar-reds-pje: no vestígio, só numero_reds/numero_pje (de vazio para o valor do JSON), updated_by, updated_at;
  - corrigir-municoes: FAV = fav_correta, município, observações (o texto antigo continua no começo), tipo do material
    (só se estava vazio), REDS/PJe, imported_from/imported_at, updated_by/updated_at; invólucros e requisições antigos
    recebem removed_at e os novos entram com motivo CORRECAO_CADASTRO;
  - excluir-duplicatas-fav: deleted_at, updated_by, updated_at, com auditoria DELETE "cadastro em dobro";
  - audit_logs: só linhas novas (nenhuma antiga muda ou some).
Sessões e tokens de senha mudam a cada login: só são contados.
"""
import argparse
import csv
import json
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

DOCKER = r"C:\Users\PPI-Lavras\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe"
SO_CONTAGEM = {"sessions", "password_reset_tokens"}
CAMPOS_TECNICOS = {"updated_at", "updated_by"}


def tabela(container: str, banco: str, nome: str) -> dict:
    sql = f'select coalesce(json_agg(t), \'[]\') from public."{nome}" t'
    out = subprocess.run([DOCKER, "exec", container, "psql", "-U", "postgres", "-d", banco, "-Atc", sql],
                         capture_output=True, text=True, encoding="utf-8", check=True).stdout
    return {str(r["id"]): r for r in json.loads(out)}


def tabelas(container: str, banco: str) -> list[str]:
    sql = "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
    out = subprocess.run([DOCKER, "exec", container, "psql", "-U", "postgres", "-d", banco, "-Atc", sql],
                         capture_output=True, text=True, encoding="utf-8", check=True).stdout
    return sorted(out.split())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--container", required=True)
    ap.add_argument("--antes", required=True)
    ap.add_argument("--depois", required=True)
    ap.add_argument("--importacao", required=True)
    ap.add_argument("--municoes", required=True)
    ap.add_argument("--saida", required=True)
    a = ap.parse_args()

    imp = {i["id"]: i for i in json.loads(Path(a.importacao).read_text(encoding="utf-8"))["itens"]}
    mun = {i["id"]: i for i in json.loads(Path(a.municoes).read_text(encoding="utf-8"))["itens"]}

    nomes_a, nomes_d = tabelas(a.container, a.antes), tabelas(a.container, a.depois)
    alarmes, info, linhas = [], [], []  # linhas = detalhe para o CSV
    cont = Counter()

    def reg(nivel, tab, id_, oque, antes="", depois=""):
        linhas.append([nivel, tab, id_, oque, antes, depois])
        (alarmes if nivel == "ALARME" else info).append(f"{tab} {id_}: {oque}")

    for t in sorted(set(nomes_a) - set(nomes_d)):
        reg("ALARME", t, "", "tabela sumiu")
    for t in sorted(set(nomes_d) - set(nomes_a)):
        reg("ALARME", t, "", "tabela nova")

    A = {t: tabela(a.container, a.antes, t) for t in nomes_a if t in nomes_d}
    D = {t: tabela(a.container, a.depois, t) for t in nomes_a if t in nomes_d}

    # Auditoria nova: classifica cada vestígio tocado
    novas_aud = [D["audit_logs"][k] for k in D["audit_logs"].keys() - A["audit_logs"].keys()]
    aud_por_alvo = defaultdict(list)
    for r in novas_aud:
        aud_por_alvo[str(r.get("target_id") or "")].append(r)
    acoes = Counter(r["action"] for r in novas_aud)
    excluidos = {str(r["target_id"]) for r in novas_aud
                 if r["action"] == "DELETE" and isinstance(r["details"], dict) and r["details"].get("motivo")
                 and "dobro" in str(r["details"].get("motivo"))}
    editados_tela = {alvo for alvo, rs in aud_por_alvo.items()
                     if any(r["action"] in ("UPDATE", "DELETE", "CREATE") and alvo not in excluidos for r in rs)}

    # Itens (invólucro/requisição) por vestígio, para as munições
    for t in ("vestige_involucros", "vestige_requisicoes"):
        for k in A[t].keys() - D[t].keys():
            reg("ALARME", t, k, "linha apagada (deveria ter só removed_at)")
        for k in D[t].keys() - A[t].keys():
            r = D[t][k]
            if r["vestige_id"] in mun and r["motivo"] == "CORRECAO_CADASTRO":
                cont[f"{t}: novo (munições)"] += 1
            elif r["vestige_id"] in editados_tela or r["vestige_id"] not in A["vestiges"]:
                cont[f"{t}: novo (cadastro/edição pela tela)"] += 1
                reg("INFO", t, k, f"novo item {r['numero']} do vestígio {r['vestige_id']} (tela, auditado)")
            else:
                reg("ALARME", t, k, f"item novo {r['numero']} no vestígio {r['vestige_id']} sem script nem auditoria")
        for k in A[t].keys() & D[t].keys():
            x, y = A[t][k], D[t][k]
            mud = {c for c in y if x.get(c) != y.get(c)}
            if not mud:
                continue
            if mud == {"removed_at"} and x["removed_at"] is None and x["vestige_id"] in mun:
                cont[f"{t}: removido (munições)"] += 1
            elif x["vestige_id"] in editados_tela:
                cont[f"{t}: alterado (edição pela tela)"] += 1
                reg("INFO", t, k, f"alterado {sorted(mud)} (tela, auditado)")
            else:
                reg("ALARME", t, k, f"alterado {sorted(mud)} fora do previsto", x, y)

    # Vestígios
    va, vd = A["vestiges"], D["vestiges"]
    for k in va.keys() - vd.keys():
        reg("ALARME", "vestiges", k, "vestígio APAGADO do banco")
    for k in vd.keys() - va.keys():
        r = vd[k]
        cont["vestiges: cadastro novo (pela tela)"] += 1
        reg("INFO", "vestiges", k, f"cadastro novo FAV {r['registro_fav']} (REDS {r.get('numero_reds')})")
    for k in va.keys() & vd.keys():
        x, y = va[k], vd[k]
        mud = {c for c in y if x.get(c) != y.get(c)}
        if not mud:
            cont["vestiges: sem mudança"] += 1
            continue
        restantes = set(mud) - CAMPOS_TECNICOS
        ok = True
        if k in excluidos:
            if restantes - {"deleted_at"} or x["deleted_at"] is not None:
                ok = False
            else:
                cont["vestiges: exclusão lógica (cadastro em dobro)"] += 1
        elif k in mun:
            m = mun[k]
            permitidos = {"registro_fav", "municipio", "observacoes", "tipo_material", "numero_reds", "numero_pje",
                          "imported_from", "imported_at"}
            if restantes - permitidos:
                ok = False
            elif y["registro_fav"] != m["fav_correta"] or not (y["observacoes"] or "").startswith(x["observacoes"] or ""):
                ok = False
            elif "tipo_material" in restantes and x["tipo_material"]:
                ok = False
            else:
                cont["vestiges: munição corrigida"] += 1
        elif k in imp:
            i = imp[k]
            if restantes - {"numero_reds", "numero_pje"}:
                ok = k in editados_tela
            elif y.get("numero_reds") != i["reds"] or (i.get("pje") and y.get("numero_pje") != i["pje"]):
                ok = k in editados_tela
            elif x.get("numero_reds") or x.get("numero_pje"):
                ok = False
            else:
                cont["vestiges: só REDS/PJe preenchidos (importação)"] += 1
                continue
            if ok:
                cont["vestiges: importação + edição pela tela"] += 1
                reg("INFO", "vestiges", k, f"importado e também editado pela tela: {sorted(restantes)}")
                continue
        elif k in editados_tela:
            cont["vestiges: edição pela tela (auditada)"] += 1
            reg("INFO", "vestiges", k, f"editado pela tela: {sorted(restantes)}")
            continue
        else:
            ok = False
        if not ok:
            reg("ALARME", "vestiges", k, f"mudança fora do previsto: {sorted(mud)}",
                {c: x.get(c) for c in mud}, {c: y.get(c) for c in mud})

    # Conferência das quantidades contra os JSONs
    faltou_imp = [k for k in imp if k in vd and k not in excluidos and not vd[k].get("numero_reds")]
    for k in faltou_imp:
        reg("ALARME", "vestiges", k, "estava no JSON de importação e ficou sem REDS")
    faltou_mun = [k for k in mun if k in vd and vd[k]["deleted_at"] is None and vd[k]["registro_fav"] != mun[k]["fav_correta"]]
    for k in faltou_mun:
        reg("INFO", "vestiges", k, "munição do JSON não corrigida (pulada pelo script: conferir a lista de pulados)")

    # Demais tabelas
    for t in sorted(A):
        if t in ("vestiges", "vestige_involucros", "vestige_requisicoes"):
            continue
        apag, novos = A[t].keys() - D[t].keys(), D[t].keys() - A[t].keys()
        alt = [k for k in A[t].keys() & D[t].keys() if A[t][k] != D[t][k]]
        if t in SO_CONTAGEM:
            info.append(f"{t}: {len(novos)} novas, {len(alt)} alteradas, {len(apag)} apagadas (muda a cada login)")
            continue
        if t == "audit_logs":
            for k in apag:
                reg("ALARME", t, k, "registro de auditoria APAGADO")
            for k in alt:
                reg("ALARME", t, k, "registro de auditoria ALTERADO", A[t][k], D[t][k])
            continue
        if t == "_prisma_migrations":
            nomes = [D[t][k]["migration_name"] for k in novos]
            if nomes != ["20261123_0001_add_reds_pje"] or apag or alt:
                reg("ALARME", t, "", f"migrations inesperadas: novas {nomes}, apagadas {len(apag)}, alteradas {len(alt)}")
            else:
                cont["_prisma_migrations: 20261123_0001_add_reds_pje"] += 1
            continue
        if t == "users":
            for k in alt:
                mud = {c for c in D[t][k] if A[t][k].get(c) != D[t][k].get(c)}
                if mud <= {"last_login_at", "updated_at"}:
                    cont["users: só último login"] += 1
                else:
                    reg("ALARME", t, k, f"usuário alterado: {sorted(mud)}")
            for k in apag | novos:
                reg("ALARME", t, k, "usuário apagado/criado")
            continue
        for k in apag:
            reg("ALARME", t, k, "linha apagada")
        for k in novos:
            r = D[t][k]
            alvo = str(r.get("vestige_id") or "")
            if alvo and alvo in editados_tela | set(vd.keys() - va.keys()):
                reg("INFO", t, k, "linha nova ligada a vestígio editado/criado pela tela")
            else:
                reg("ALARME", t, k, "linha nova fora do previsto")
        for k in alt:
            reg("ALARME", t, k, "linha alterada", A[t][k], D[t][k])

    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    with open(saida / "diferencas.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Nível", "Tabela", "Id", "O que", "Antes", "Depois"])
        for l in linhas:
            w.writerow([json.dumps(v, ensure_ascii=False, default=str) if isinstance(v, (dict, list)) else v for v in l])

    resumo = [f"COMPARAÇÃO  antes = {a.antes}   depois = {a.depois}", "",
              f"Vestígios no ANTES: {len(va)}   no DEPOIS: {len(vd)}",
              f"JSON de importação: {len(imp)} itens   JSON de munições: {len(mun)} itens", "",
              "PREVISTO / CONTADO:"] + [f"  {n:6}  {k}" for k, n in sorted(cont.items())] + [
              "", "AUDITORIA NOVA por ação:"] + [f"  {n:6}  {k}" for k, n in acoes.most_common()] + [
              "", f"INFORMAÇÕES ({len(info)}):"] + [f"  {l}" for l in info[:40]] + (
              [f"  ... e mais {len(info) - 40} (ver diferencas.csv)"] if len(info) > 40 else []) + [
              "", f"ALARMES ({len(alarmes)}):"] + [f"  {l}" for l in alarmes[:60]] + (
              [f"  ... e mais {len(alarmes) - 60} (ver diferencas.csv)"] if len(alarmes) > 60 else []) + [
              "", "RESULTADO: " + ("NENHUMA mudança fora do previsto." if not alarmes else "HÁ MUDANÇAS FORA DO PREVISTO.")]
    texto = "\n".join(resumo)
    (saida / "resumo.txt").write_text(texto, encoding="utf-8")
    print(texto)
    return 1 if alarmes else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
