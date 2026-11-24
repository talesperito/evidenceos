"""Leitor das FAVs do PCNET: extrai o Nº REDS, o Nº PJe e as requisições do cabeçalho.

Plano: docs/plans/2026-11-17-leitura-fav-reds-pje-design.md (seções 3, 5.3 e 5.4).

Este arquivo tem só o LEITOR (extração + interpretação) e os comandos que rodam sem o PCNET:

  python -E -P scripts/pcnet-leitura-fav.py disco <pasta-com-pdfs> [--saida progresso.jsonl]
        lê os PDFs de uma pasta (FAV<número>.pdf) e mostra o resultado em tabela
  python -E -P scripts/pcnet-leitura-fav.py reprocessar <progresso.jsonl> [--saida novo.jsonl]
        refaz a interpretação a partir do texto bruto guardado, sem acessar o PCNET

  python -E -P scripts/pcnet-leitura-fav.py ler (--favs N N ... | --lista arquivo) [--pasta DIR] [--limite N]
        busca as FAVs no PCNET, numa janela do Chrome aberta pelo script sem automação (o Cloudflare
        do login barra navegador controlado: o usuário loga à mão, com TFA, e só então o script se
        conecta por CDP em 127.0.0.1:9222 para fazer as buscas). Lotes
        de 1000, e grava cada resultado na hora em <pasta>/progresso.jsonl. Se parar, rode o mesmo
        comando com a MESMA --pasta: continua de onde parou. --lista: .txt (uma FAV por linha) ou
        .csv com coluna "fav".

NÃO use `-I`: com ele o Python não acha o PyMuPDF (fitz), instalado no site-packages do usuário.
Usa o Chrome já instalado no Windows (não precisa instalar navegador do Playwright).

Regras que valem para tudo aqui:
- O PDF é lido na memória e descartado. Nunca é gravado.
- O que sai do leitor tem só: FAV, REDS, PJe, requisições, invólucro atual, situação e o texto bruto
  dessas linhas. Nada de nomes, matrículas ou descrição do material.
- A posição dos rótulos muda de uma FAV para outra: o leitor acha o rótulo e lê o que está na MESMA
  ALTURA dele. Nunca usa coordenada fixa. Nada nessa altura = campo vazio (não a linha de baixo).
"""
import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:  # só o leitor de PDF precisa dele; interpretar() e --reprocessar funcionam sem
    fitz = None

# Qual REDS gravar quando a FAV trouxer dois (plano, P6): 1 = o primeiro (o da esquerda).
# Parâmetro único: o gerador da importação e o importador de Campo Belo devem usar o mesmo.
REDS_ESCOLHIDO = 1
# Quantos REDS uma FAV pode trazer sem virar erro (decisão de 23/11: até 3; grava-se sempre o primeiro).
MAX_REDS = 3
MAX_REDS_EXTENSO = "três"

RE_REDS = re.compile(r"^\d{4}-\d{9}-\d{3}$")
RE_REQUISICAO = re.compile(r"^\d{4}-\d{9}$")
RE_PJE_20 = re.compile(r"^\d{20}$")

SIT_OK = "OK"
SIT_SESSAO = "Sessão caída"


# ---------------------------------------------------------------------------
# Interpretação (não depende do PDF; é o que o --reprocessar refaz)
# ---------------------------------------------------------------------------

def pje_dv_valido(pje20: str) -> bool:
    """Dígito verificador do número único do CNJ (módulo 97, ISO 7064).

    Formato: NNNNNNN DD AAAA J TR OOOO. DD = 98 - ((NNNNNNN AAAA J TR OOOO 00) mod 97).
    """
    if not RE_PJE_20.match(pje20):
        return False
    sequencial, dv, resto = pje20[:7], pje20[7:9], pje20[9:]
    return int(dv) == 98 - (int(sequencial + resto + "00") % 97)


def formatar_pje(pje20: str) -> str:
    """NNNNNNN-DD.AAAA.J.TR.OOOO"""
    return f"{pje20[:7]}-{pje20[7:9]}.{pje20[9:13]}.{pje20[13]}.{pje20[14:16]}.{pje20[16:]}"


def _sem_zeros(numero: str) -> str:
    return numero.lstrip("0") or "0"


def interpretar(bruto: dict, fav_pedida: str) -> dict:
    """Transforma o texto bruto (extraído do PDF) no resultado de uma FAV.

    `bruto` tem: fav_impressa, reds, pje, requisicoes, involucro. Cada um é o texto como saiu do PDF;
    `None` quer dizer "o rótulo não foi encontrado" (layout mudou), `""` quer dizer "rótulo sem valor".
    """
    erros: list[str] = []
    avisos: list[str] = []

    # FAV impressa x pedida
    impressa = bruto.get("fav_impressa")
    if not impressa:
        erros.append("FAV não encontrada no PDF")
    elif _sem_zeros(impressa) != _sem_zeros(str(fav_pedida)):
        erros.append("FAV diferente da pedida")

    # REDS
    reds: list[str] = []
    texto_reds = bruto.get("reds")
    if texto_reds is None:
        erros.append("Rótulo Nº REDS não encontrado")
    else:
        reds = [t for t in re.split(r"[\s,;]+", texto_reds.strip()) if t]
        if not reds:
            erros.append("FAV sem REDS")
        elif len(reds) > MAX_REDS:
            erros.append(f"FAV com mais de {MAX_REDS_EXTENSO} REDS")
        elif not RE_REDS.match(reds[REDS_ESCOLHIDO - 1]):
            # só o REDS que será gravado precisa estar no padrão (decisão de 23/11)
            erros.append("REDS fora do padrão")
        else:
            if len(reds) == 2:
                avisos.append("FAV com dois REDS")
            elif len(reds) == 3:
                avisos.append("FAV com três REDS")
            outros_ruins = [r for i, r in enumerate(reds) if i != REDS_ESCOLHIDO - 1 and not RE_REDS.match(r)]
            if outros_ruins:
                avisos.append(f"REDS adicional fora do padrão (lido: {', '.join(outros_ruins)[:60]})")

    # PJe
    pje: str | None = None
    texto_pje = bruto.get("pje")
    if texto_pje is None:
        erros.append("Rótulo Nº PJe não encontrado")
    elif texto_pje.strip():
        # Só o PJe com os 20 dígitos padrão e DV válido segue. Todo o resto vira "Não informado" (decisão
        # de 23/11). Se havia número de verdade (mais de 1 dígito), fica um aviso com o valor lido, para o
        # usuário poder olhar; campo com lixo (".", "x", "0", "1") é tratado como vazio, sem aviso.
        digitos = re.sub(r"[.\-\s]", "", texto_pje)
        if RE_PJE_20.match(digitos) and pje_dv_valido(digitos):
            pje = digitos
        elif len(re.sub(r"\D", "", texto_pje)) > 1:
            avisos.append(f"PJe fora do padrão, tratado como Não informado (lido: {texto_pje.strip()[:40]})")

    # Requisições
    requisicoes: list[str] = []
    texto_req = bruto.get("requisicoes")
    if texto_req is None:
        erros.append("Linha de requisições não encontrada")
    else:
        # A quebra de linha do PDF pode cair no meio do número ("2026-" / "056016134"): junta de volta.
        texto_req = re.sub(r"(?<=\d)-\s+(?=\d)", "-", texto_req)
        requisicoes = [t for t in re.split(r"[\s,;]+", texto_req.strip()) if t]
        if any(not RE_REQUISICAO.match(r) for r in requisicoes):
            avisos.append("Requisição fora do formato")
        if len(requisicoes) > 1:
            avisos.append("Mais de uma requisição")

    ok = not erros
    reds_gravar = reds[REDS_ESCOLHIDO - 1] if ok and reds else None
    return {
        "fav": str(fav_pedida),
        "situacao": SIT_OK if ok else "Erro: " + "; ".join(erros),
        "erros": erros,
        "avisos": avisos,
        "reds": reds,
        "reds_gravar": reds_gravar,
        "pje": pje,
        "pje_formatado": formatar_pje(pje) if pje else "Não informado",
        "requisicoes": requisicoes,
        "qtde_requisicoes": len(requisicoes),
        "involucro": (bruto.get("involucro") or "").strip() or None,
    }


# ---------------------------------------------------------------------------
# Extração do PDF
# ---------------------------------------------------------------------------

def _linha_do_rotulo(palavras: list, padrao_rotulo: str) -> str | None:
    """Texto que está na mesma altura do rótulo, à direita dele. None = rótulo não achado.

    `palavras` vem de page.get_text("words"): (x0, y0, x1, y1, texto, bloco, linha, palavra).
    """
    rotulo = next((p for p in palavras if re.match(padrao_rotulo, p[4], re.I)), None)
    if rotulo is None:
        return None
    x1, y0, y1 = rotulo[2], rotulo[1], rotulo[3]
    na_linha = [
        p for p in palavras
        if p is not rotulo and p[0] >= x1 - 1 and y0 <= (p[1] + p[3]) / 2 <= y1
    ]
    na_linha.sort(key=lambda p: p[0])
    return " ".join(p[4] for p in na_linha)


def extrair_bruto(pdf: bytes) -> dict:
    """Lê o PDF na memória e devolve só o texto bruto dos campos de interesse."""
    if fitz is None:
        raise RuntimeError("PyMuPDF (fitz) não instalado. Rode com `python -E -P`, não com `-I`.")
    doc = fitz.open(stream=pdf, filetype="pdf")
    try:
        pagina = doc[0]
        palavras = pagina.get_text("words")
        texto = pagina.get_text("text")
    finally:
        doc.close()

    # Os acentos saem trocados na extração: as expressões aceitam qualquer coisa no lugar deles.
    m_fav = re.search(r"FICHA DE ACOMPANHAMENTO[^\n]*?:\s*(\d+)", texto)
    m_inv = re.search(r"inv.{1,3}lucro atual:[ \t]*([^\n]*)", texto)
    m_req = re.search(r"Exame pericial \(n.{1,3} requisi.{1,4}o\):(.*?)\nCOLETA", texto, re.S)

    return {
        "fav_impressa": m_fav.group(1) if m_fav else None,
        "reds": _linha_do_rotulo(palavras, r"^REDS:?$"),
        "pje": _linha_do_rotulo(palavras, r"^PJe:?$"),
        # com 5 requisições a linha quebra: junta tudo até a seção COLETA
        "requisicoes": " ".join(m_req.group(1).split()) if m_req else None,
        "involucro": m_inv.group(1).strip()[:200] if m_inv else None,
    }


def ler_pdf(pdf: bytes, fav_pedida: str) -> dict:
    """Ponto de entrada: bytes da resposta do PCNET + FAV pedida -> registro de progresso."""
    agora = datetime.now().isoformat(timespec="seconds")
    if not pdf.startswith(b"%PDF"):
        # página de login ou erro: quem chama deve parar e pedir novo login, não seguir
        return {"fav": str(fav_pedida), "situacao": SIT_SESSAO, "erros": [SIT_SESSAO], "avisos": [],
                "lido_em": agora}
    try:
        bruto = extrair_bruto(pdf)
    except Exception as exc:  # PDF corrompido etc.: vira linha de erro, não derruba a rodada
        return {"fav": str(fav_pedida), "situacao": f"Erro: PDF ilegível ({type(exc).__name__})",
                "erros": ["PDF ilegível"], "avisos": [], "lido_em": agora}
    registro = interpretar(bruto, fav_pedida)
    registro["bruto"] = bruto
    registro["lido_em"] = agora
    return registro


# ---------------------------------------------------------------------------
# Comandos
# ---------------------------------------------------------------------------

def _resumo(r: dict) -> str:
    alertas = ", ".join(r.get("avisos") or []) or "-"
    return (
        f"{r['fav']:>9}  {r['situacao'][:34]:<34}  "
        f"REDS: {' | '.join(r.get('reds') or []) or '-':<40}  "
        f"PJe: {r.get('pje_formatado', '-'):<27}  "
        f"req: {r.get('qtde_requisicoes', '-')}  alertas: {alertas}"
    )


def _gravar_jsonl(registros: list[dict], caminho: Path) -> None:
    with caminho.open("w", encoding="utf-8") as f:
        for r in registros:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"\nGravado: {caminho}")


def cmd_disco(args) -> int:
    pasta = Path(args.pasta)
    arquivos = sorted(pasta.glob("FAV*.pdf"))
    if not arquivos:
        print(f"Nenhum FAV*.pdf em {pasta}. Se a pasta foi apagada, peça novas amostras ao usuário.")
        return 1
    registros = []
    for arq in arquivos:
        fav = re.sub(r"\D", "", arq.stem)
        registros.append(ler_pdf(arq.read_bytes(), fav))
    for r in registros:
        print(_resumo(r))
    if args.saida:
        _gravar_jsonl(registros, Path(args.saida))
    return 0 if all(r["situacao"] == SIT_OK for r in registros) else 2


def cmd_reprocessar(args) -> int:
    origem = Path(args.progresso)
    novos = []
    for linha in origem.read_text(encoding="utf-8").splitlines():
        if not linha.strip():
            continue
        antigo = json.loads(linha)
        bruto = antigo.get("bruto")
        if bruto is None:  # sessão caída / PDF ilegível: não há texto para reinterpretar
            novos.append(antigo)
            continue
        novo = interpretar(bruto, antigo["fav"])
        novo["bruto"] = bruto
        novo["lido_em"] = antigo.get("lido_em")
        novos.append(novo)
    mudou = sum(1 for a, b in zip(
        (json.loads(l) for l in origem.read_text(encoding="utf-8").splitlines() if l.strip()), novos
    ) if any(a.get(c) != b.get(c) for c in
             ("situacao", "reds", "reds_gravar", "pje", "requisicoes", "avisos")))
    for r in novos:
        print(_resumo(r))
    print(f"\n{len(novos)} FAVs reinterpretadas; {mudou} com resultado diferente.")
    if args.saida:
        _gravar_jsonl(novos, Path(args.saida))
    return 0


# ---------------------------------------------------------------------------
# Leitura ao vivo no PCNET
# ---------------------------------------------------------------------------

URL_FAV = "https://www.pcnet.mg.gov.br/PCnet/cadeiacustodiasel.do?evento=gerarFav&idMaterial={fav}"
URL_INICIO = "https://www.pcnet.mg.gov.br/PCnet/"
BASE_TRABALHO = Path(r"c:\tmp\pcnet-leitura")  # fora do repositório; nada daqui vai para o Git
PERFIL = BASE_TRABALHO / "perfil-chrome"       # perfil próprio do Chrome do script (sem as senhas do dia a dia)
PORTA_CDP = 9222
CHROME_EXE = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
TAMANHO_LOTE = 1000
PAUSA_ENTRE_LOTES_S = 60
ESPERA_LOGIN_MAX_S = 30 * 60
ERROS_SEGUIDOS_PARA_PARAR = 10


def carregar_favs(caminho: Path) -> list[str]:
    """FAVs de um .txt (uma por linha) ou .csv com coluna 'fav'. Sem repetidas, na ordem do arquivo."""
    import csv
    linhas = caminho.read_text(encoding="utf-8-sig").splitlines()
    favs: list[str] = []
    if linhas and re.search(r"(^|[;,])\s*fav\s*($|[;,])", linhas[0], re.I):
        sep = ";" if linhas[0].count(";") > linhas[0].count(",") else ","
        for row in csv.DictReader(linhas, delimiter=sep):
            chave = next(k for k in row if k.strip().lower() == "fav")
            favs.append((row[chave] or "").strip())
    else:
        favs = [l.split(";")[0].split(",")[0].strip() for l in linhas]
    visto: set[str] = set()
    unicas = []
    for f in favs:
        # só número puro: "A230699112" ou "x" NÃO viram um número qualquer pedido ao PCNET
        f = _sem_zeros(f) if re.fullmatch(r"\d+", f) else ""
        if f and f not in visto:
            visto.add(f)
            unicas.append(f)
    return unicas


def _ja_lidas(arquivo: Path) -> set[str]:
    if not arquivo.exists():
        return set()
    feitas = set()
    for linha in arquivo.read_text(encoding="utf-8").splitlines():
        if linha.strip():
            feitas.add(_sem_zeros(json.loads(linha)["fav"]))
    return feitas


def _porta_aberta() -> bool:
    import socket
    with socket.socket() as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", PORTA_CDP)) == 0


def _abrir_chrome() -> None:
    """Abre o Chrome SEM automação (o Cloudflare do login barra navegador controlado por script) e
    com a porta de depuração só em 127.0.0.1. O script entra depois do login, só para fazer as buscas.
    Se o Chrome do script já estiver aberto (rodada anterior), reaproveita: a sessão continua."""
    import subprocess
    import time
    if _porta_aberta():
        print("Chrome do script já aberto; reaproveitando a janela e a sessão.")
        return
    if not CHROME_EXE.exists():
        raise SystemExit(f"Chrome não encontrado em {CHROME_EXE}")
    PERFIL.mkdir(parents=True, exist_ok=True)
    subprocess.Popen(
        [str(CHROME_EXE), f"--remote-debugging-port={PORTA_CDP}", "--remote-debugging-address=127.0.0.1",
         f"--user-data-dir={PERFIL}", "--no-first-run", "--no-default-browser-check", URL_INICIO],
        creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    for _ in range(30):
        if _porta_aberta():
            return
        time.sleep(1)
    raise SystemExit("O Chrome não abriu a porta de depuração em 30 s.")


def _abas_abertas() -> list[str]:
    """URLs das abas do Chrome do script, pelo endereço HTTP /json (não abre sessão de depuração)."""
    import urllib.request
    with urllib.request.urlopen(f"http://127.0.0.1:{PORTA_CDP}/json", timeout=5) as r:
        return [a.get("url", "") for a in json.loads(r.read()) if a.get("type") == "page"]


def _esperar_login_na_aba() -> bool:
    """Espera o usuário terminar o login (com TFA) SEM conectar no navegador.

    Conectar por CDP durante o login poderia fazer o Cloudflare barrar a verificação. Aqui só se olha
    a lista de abas: quando alguma estiver na tela inicial do PCNET (/APP/inicial), o login terminou."""
    import time
    print("\n>>> Faça o login (com o TFA) na janela do Chrome que o script abriu.")
    print(f">>> Espero até {ESPERA_LOGIN_MAX_S // 60} minutos. O script só se conecta depois do login.")
    limite = time.time() + ESPERA_LOGIN_MAX_S
    while time.time() < limite:
        try:
            if any(re.search(r"pcnet\.mg\.gov\.br/APP/inicial", u) for u in _abas_abertas()):
                print(">>> Login detectado. Conectando.\n")
                time.sleep(3)
                return True
        except Exception:
            pass
        time.sleep(3)
    return False


def _buscar(contexto, fav: str):
    """GET da mesma URL do botão 'Ver FAV', com a sessão (cookies) da janela. Devolve (bytes, status)."""
    resp = contexto.request.get(URL_FAV.format(fav=fav), timeout=60_000)
    return resp.body(), resp.status


def _buscar_tolerante(contexto, fav: str):
    """Como _buscar, mas falha de rede (conexão fechada, tempo esgotado) vira (b'', 0) e é mostrada."""
    try:
        return _buscar(contexto, fav)
    except Exception as exc:
        print(f"    (falha de rede: {str(exc).splitlines()[0][:120]})")
        return b"", 0


def _esperar_login(contexto, fav_teste: str) -> bool:
    """Espera o usuário entrar na janela. Testa a próxima FAV a cada 10 s; True quando vier um PDF."""
    print("\n>>> Sessão inativa. Faça o login (com o TFA) na janela do Chrome que o script abriu.")
    print(f">>> Espero até {ESPERA_LOGIN_MAX_S // 60} minutos, testando a cada 10 segundos.")
    import time
    limite = time.time() + ESPERA_LOGIN_MAX_S
    while time.time() < limite:
        time.sleep(10)
        corpo, _ = _buscar_tolerante(contexto, fav_teste)
        if corpo.startswith(b"%PDF"):
            print(">>> Sessão ativa. Continuando.\n")
            return True
    return False


def cmd_ler(args) -> int:
    import random
    import time
    from playwright.sync_api import sync_playwright

    if args.favs:
        favs = [_sem_zeros(re.sub(r"\D", "", f)) for f in args.favs]
    else:
        favs = carregar_favs(Path(args.lista))
    if args.fav_max:
        acima = [f for f in favs if int(f) > args.fav_max]
        favs = [f for f in favs if int(f) <= args.fav_max]
        print(f"{len(acima)} FAVs acima de {args.fav_max} NÃO serão pedidas ao PCNET (número suspeito).")
    pasta = Path(args.pasta) if args.pasta else BASE_TRABALHO / datetime.now().strftime("%Y-%m-%d")
    pasta.mkdir(parents=True, exist_ok=True)
    arquivo = pasta / "progresso.jsonl"
    feitas = _ja_lidas(arquivo)
    pendentes = [f for f in favs if f not in feitas]
    if args.limite:
        pendentes = pendentes[: args.limite]
    print(f"{len(favs)} FAVs na lista; {len(feitas & set(favs))} já lidas; {len(pendentes)} nesta rodada.")
    print(f"Progresso: {arquivo}")
    if not pendentes:
        return 0

    lidas = erros_seguidos = 0
    ultima_ok = None
    with sync_playwright() as p:
        _abrir_chrome()
        if not _esperar_login_na_aba():
            print(">>> Login não detectado. Nada foi lido.")
            return 3
        navegador = p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORTA_CDP}")
        contexto = navegador.contexts[0]
        try:
            for i, fav in enumerate(pendentes):
                if i and i % args.lote == 0:
                    print(f"\n--- Lote de {args.lote} concluído ({i} nesta rodada). "
                          f"Pausa de {PAUSA_ENTRE_LOTES_S} s ---\n")
                    time.sleep(PAUSA_ENTRE_LOTES_S)
                corpo, status = _buscar_tolerante(contexto, fav)
                if not corpo.startswith(b"%PDF"):
                    if status in (429,) or status >= 500:
                        print(f">>> PCNET respondeu HTTP {status}. Parando; o progresso está salvo.")
                        return 3
                    # Sessão caída ou FAV sem PDF (inexistente)? Pede de novo uma FAV que já deu certo.
                    if b"No row with the given identifier exists" in corpo:
                        # resposta do PCNET para número que não é FAV nenhuma (visto em 23/11)
                        motivo = "FAV não existe no PCNET"
                    elif ultima_ok and _buscar_tolerante(contexto, ultima_ok)[0].startswith(b"%PDF"):
                        motivo = f"PCNET não devolveu PDF (HTTP {status})"
                    else:
                        motivo = None
                    if motivo:
                        registro = {"fav": fav, "situacao": f"Erro: {motivo}",
                                    "erros": [motivo], "avisos": [],
                                    "lido_em": datetime.now().isoformat(timespec="seconds")}
                        with arquivo.open("a", encoding="utf-8") as f:
                            f.write(json.dumps(registro, ensure_ascii=False) + "\n")
                        lidas += 1
                        print(f"[{i + 1}/{len(pendentes)}] {_resumo(registro)}")
                        erros_seguidos += 1
                        if erros_seguidos >= ERROS_SEGUIDOS_PARA_PARAR:
                            print(f">>> {ERROS_SEGUIDOS_PARA_PARAR} FAVs seguidas com erro. Parando para conferir.")
                            return 4
                        time.sleep(random.uniform(2.0, 3.0))
                        continue
                    if not _esperar_login(contexto, fav):
                        print(">>> Sem login. Parando; o progresso está salvo.")
                        return 3
                    corpo, status = _buscar_tolerante(contexto, fav)
                    if not corpo.startswith(b"%PDF"):
                        print(">>> Resposta ainda não é PDF. Parando.")
                        return 3
                ultima_ok = fav  # a sessão está ativa: serve de controle se uma próxima FAV não vier em PDF
                registro = ler_pdf(corpo, fav)
                with arquivo.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(registro, ensure_ascii=False) + "\n")
                lidas += 1
                print(f"[{i + 1}/{len(pendentes)}] {_resumo(registro)}")
                erros_seguidos = 0 if registro["situacao"] == SIT_OK else erros_seguidos + 1
                if erros_seguidos >= ERROS_SEGUIDOS_PARA_PARAR:
                    print(f">>> {ERROS_SEGUIDOS_PARA_PARAR} FAVs seguidas com erro: provável mudança de "
                          "layout ou problema na resposta. Parando para conferir.")
                    return 4
                time.sleep(random.uniform(2.0, 3.0))
        finally:
            # só desconecta: o Chrome continua aberto e logado, para a próxima rodada reaproveitar a sessão
            navegador.close()
    print(f"\nRodada concluída: {lidas} FAVs lidas. Progresso em {arquivo}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("ler", help="busca as FAVs no PCNET (Chrome do script, login manual)")
    origem = v.add_mutually_exclusive_group(required=True)
    origem.add_argument("--favs", nargs="+", help="números de FAV (para o piloto)")
    origem.add_argument("--lista", help=".txt (uma FAV por linha) ou .csv com coluna fav")
    v.add_argument("--pasta", help="onde fica o progresso.jsonl (use a mesma para retomar)")
    v.add_argument("--lote", type=int, default=TAMANHO_LOTE, help=f"FAVs por lote (padrão {TAMANHO_LOTE})")
    v.add_argument("--limite", type=int, help="máximo de FAVs nesta rodada")
    v.add_argument("--fav-max", type=int,
                   help="não pede ao PCNET FAVs com número acima deste (números fora da faixa são suspeitos)")
    v.set_defaults(func=cmd_ler)
    d = sub.add_parser("disco", help="lê PDFs de uma pasta, sem acessar o PCNET")
    d.add_argument("pasta")
    d.add_argument("--saida", help="grava o resultado em .jsonl (formato do progresso)")
    d.set_defaults(func=cmd_disco)
    r = sub.add_parser("reprocessar", help="refaz a interpretação a partir do texto bruto")
    r.add_argument("progresso")
    r.add_argument("--saida")
    r.set_defaults(func=cmd_reprocessar)
    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
