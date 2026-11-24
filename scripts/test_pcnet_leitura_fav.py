"""Testes do leitor de FAVs (scripts/pcnet-leitura-fav.py).

Rodar:  python -E -P -m unittest scripts/test_pcnet_leitura_fav.py -v   (a partir da raiz do projeto)

- Os testes de interpretação não precisam de PDF.
- Os testes com as 7 FAVs de amostra leem c:\\tmp\\pcnet-favs-amostra\\ (fora do repositório, com dados
  pessoais). Se a pasta não existir, são pulados. Conferem só a ESTRUTURA do resultado (tabela da seção 3
  do plano), sem copiar nenhum número real para o repositório.
"""
import importlib.util
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("leitor", AQUI / "pcnet-leitura-fav.py")
leitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(leitor)

AMOSTRA = Path(r"c:\tmp\pcnet-favs-amostra")

# DV válido construído pela regra do CNJ (número fictício)
PJE_OK = "50058181820268130382"


def bruto(**kw):
    base = {"fav_impressa": "002351072", "reds": "2026-045817588-001", "pje": "",
            "requisicoes": "2026-059354601", "involucro": "6616437"}
    base.update(kw)
    return base


class Interpretacao(unittest.TestCase):
    def test_caso_simples_pje_vazio(self):
        r = leitor.interpretar(bruto(), "2351072")
        self.assertEqual(r["situacao"], "OK")
        self.assertIsNone(r["pje"])
        self.assertEqual(r["pje_formatado"], "Não informado")
        self.assertEqual(r["reds_gravar"], "2026-045817588-001")
        self.assertEqual(r["avisos"], [])

    def test_pje_valido_e_formatado(self):
        r = leitor.interpretar(bruto(pje=PJE_OK), "2351072")
        self.assertEqual(r["pje"], PJE_OK)
        self.assertEqual(r["pje_formatado"], "5005818-18.2026.8.13.0382")

    def test_pje_pontuado_e_aceito(self):
        r = leitor.interpretar(bruto(pje="5005818-18.2026.8.13.0382"), "2351072")
        self.assertEqual(r["pje"], PJE_OK)

    def test_pje_digito_invalido_vira_nao_informado_com_aviso(self):
        r = leitor.interpretar(bruto(pje="50058181920268130382"), "2351072")
        self.assertEqual(r["situacao"], "OK")  # não é mais erro: o REDS segue para a gravação
        self.assertIsNone(r["pje"])
        self.assertEqual(r["pje_formatado"], "Não informado")
        self.assertTrue(any("PJe fora do padrão" in a and "50058181920268130382" in a for a in r["avisos"]))
        self.assertEqual(r["reds_gravar"], "2026-045817588-001")

    def test_pje_em_formato_antigo_ou_cortado_vira_nao_informado_com_aviso(self):
        for texto in ("0018600-26.2018", "500587-35.2023.8.13.0343"):
            r = leitor.interpretar(bruto(pje=texto), "2351072")
            self.assertEqual(r["situacao"], "OK")
            self.assertIsNone(r["pje"])
            self.assertTrue(any(texto in a for a in r["avisos"]))

    def test_pje_com_lixo_vira_nao_informado_sem_aviso(self):
        for texto in (".", "x", "0", "1", "-", ".1"):
            r = leitor.interpretar(bruto(pje=texto), "2351072")
            self.assertEqual(r["situacao"], "OK")
            self.assertIsNone(r["pje"])
            self.assertEqual(r["avisos"], [], texto)

    def test_pje_texto_sem_digitos_nao_pega_a_linha_de_baixo(self):
        r = leitor.interpretar(bruto(pje="FICHA DE ACOMPANHAMENTO"), "2351072")
        self.assertIsNone(r["pje"])
        self.assertEqual(r["avisos"], [])

    def test_dois_reds_grava_o_primeiro(self):
        r = leitor.interpretar(bruto(reds="2025-054543092-002 2025-054543092-001"), "2351072")
        self.assertEqual(r["reds"], ["2025-054543092-002", "2025-054543092-001"])
        self.assertEqual(r["reds_gravar"], "2025-054543092-002")
        self.assertIn("FAV com dois REDS", r["avisos"])

    def test_dois_reds_separados_por_virgula(self):
        r = leitor.interpretar(bruto(reds="2026-038416566-001, 2026-045010560-001"), "2351072")
        self.assertEqual(len(r["reds"]), 2)

    def test_tres_reds_grava_o_primeiro_com_alerta(self):
        # visto em FAVs reais: três REDS separados por vírgula, com vírgula sobrando no fim
        r = leitor.interpretar(
            bruto(reds="2024-036560477-001, 2024-053526241-001, 2024-036559799-001,"), "2351072")
        self.assertEqual(r["situacao"], "OK")
        self.assertEqual(len(r["reds"]), 3)
        self.assertEqual(r["reds_gravar"], "2024-036560477-001")
        self.assertIn("FAV com três REDS", r["avisos"])

    def test_reds_adicional_cortado_vira_alerta_e_grava_o_primeiro(self):
        # visto na FAV real 1280038: o REDS do meio perdeu o último dígito
        r = leitor.interpretar(
            bruto(reds="2024-000000001-001 2024-000000002-00 2024-000000003-001"), "2351072")
        self.assertEqual(r["situacao"], "OK")
        self.assertEqual(r["reds_gravar"], "2024-000000001-001")
        self.assertTrue(any("REDS adicional fora do padrão" in a and "2024-000000002-00" in a for a in r["avisos"]))

    def test_primeiro_reds_fora_do_padrao_continua_erro(self):
        r = leitor.interpretar(bruto(reds="2024-000000001-00 2024-000000002-001"), "2351072")
        self.assertIn("REDS fora do padrão", r["erros"])
        self.assertIsNone(r["reds_gravar"])

    def test_mais_de_tres_reds_e_erro(self):
        r = leitor.interpretar(
            bruto(reds="2026-000000001-001 2026-000000002-001 2026-000000003-001 2026-000000004-001"), "2351072")
        self.assertIn("FAV com mais de três REDS", r["erros"])
        self.assertIsNone(r["reds_gravar"])

    def test_reds_vazio_e_fora_do_padrao(self):
        self.assertIn("FAV sem REDS", leitor.interpretar(bruto(reds=""), "2351072")["erros"])
        r = leitor.interpretar(bruto(reds="26-45817588-1"), "2351072")
        self.assertIn("REDS fora do padrão", r["erros"])
        self.assertEqual(r["reds"], ["26-45817588-1"])  # o valor lido vai para a planilha
        self.assertIsNone(r["reds_gravar"])

    def test_rotulo_nao_encontrado_nao_vira_campo_vazio(self):
        r = leitor.interpretar(bruto(pje=None), "2351072")
        self.assertIn("Rótulo Nº PJe não encontrado", r["erros"])

    def test_fav_diferente_da_pedida_ignora_zeros(self):
        self.assertEqual(leitor.interpretar(bruto(), "002351072")["situacao"], "OK")
        self.assertIn("FAV diferente da pedida", leitor.interpretar(bruto(), "2351073")["erros"])

    def test_requisicoes(self):
        r = leitor.interpretar(bruto(requisicoes="2026-057767956, 2026-057701581"), "2351072")
        self.assertEqual(r["qtde_requisicoes"], 2)
        self.assertIn("Mais de uma requisição", r["avisos"])
        r = leitor.interpretar(bruto(requisicoes="2026-1"), "2351072")
        self.assertIn("Requisição fora do formato", r["avisos"])
        self.assertEqual(r["situacao"], "OK")  # só aviso

    def test_cinco_requisicoes_quebradas_em_linhas(self):
        txt = "2026-000000001, 2026-000000002, 2026-000000003, 2026-000000004, 2026-000000005"
        self.assertEqual(leitor.interpretar(bruto(requisicoes=txt), "2351072")["qtde_requisicoes"], 5)

    def test_quebra_de_linha_no_meio_do_numero_da_requisicao(self):
        # visto em FAVs reais com 3 requisições: o PDF quebra depois do hífen
        r = leitor.interpretar(bruto(requisicoes="2026-000000001, 2026-000000002, 2026- 000000003"), "2351072")
        self.assertEqual(r["requisicoes"], ["2026-000000001", "2026-000000002", "2026-000000003"])
        self.assertEqual(r["qtde_requisicoes"], 3)
        self.assertNotIn("Requisição fora do formato", r["avisos"])

    def test_resposta_que_nao_e_pdf_e_sessao_caida(self):
        r = leitor.ler_pdf(b"<html>login</html>", "2351072")
        self.assertEqual(r["situacao"], leitor.SIT_SESSAO)

    def test_pdf_corrompido_vira_erro_e_nao_excecao(self):
        r = leitor.ler_pdf(b"%PDF-1.4 lixo", "2351072")
        self.assertTrue(r["situacao"].startswith("Erro"))

    def test_dv_cnj(self):
        self.assertTrue(leitor.pje_dv_valido(PJE_OK))
        self.assertFalse(leitor.pje_dv_valido("50058181920268130382"))  # DV 19 em vez de 18
        self.assertFalse(leitor.pje_dv_valido("123"))


class ListaDeFavs(unittest.TestCase):
    def _arquivo(self, conteudo, sufixo):
        import tempfile
        d = tempfile.mkdtemp()
        p = Path(d) / f"lista{sufixo}"
        p.write_text(conteudo, encoding="utf-8")
        return p

    def test_txt_sem_repetidas_e_sem_zeros(self):
        p = self._arquivo("2351072\n002351072\n\n2397628\n", ".txt")
        self.assertEqual(leitor.carregar_favs(p), ["2351072", "2397628"])

    def test_fav_nao_numerica_e_ignorada_e_nao_vira_outro_numero(self):
        p = self._arquivo("id,fav\n1,A230699112\n2,x\n3,\n4,2397628\n5,12 34\n", ".csv")
        self.assertEqual(leitor.carregar_favs(p), ["2397628"])

    def test_csv_com_coluna_fav(self):
        p = self._arquivo("id;fav;categoria\n1;2351072;X\n2;2397628;Y\n3;2351072;Z\n", ".csv")
        self.assertEqual(leitor.carregar_favs(p), ["2351072", "2397628"])


@unittest.skipUnless(AMOSTRA.exists() and leitor.fitz, "amostras ou PyMuPDF indisponíveis")
class AmostrasNoDisco(unittest.TestCase):
    """Tabela da seção 3 do plano: caso -> (nº de REDS, tem PJe, nº de requisições)."""
    ESPERADO = {
        "2351072": (1, False, 1),  # A
        "2397628": (1, False, 2),  # B (alerta de requisição)
        "2399621": (1, True, 1),   # C
        "2406799": (1, False, 1),  # D (veículo, sem PCnet)
        "2408071": (1, True, 1),   # E
        "2317127": (2, True, 1),   # F (layout deslocado, dois REDS diferentes)
        "2200920": (2, True, 2),   # G (layout deslocado, mesmo REDS -002 e -001, duas requisições)
    }

    @classmethod
    def setUpClass(cls):
        cls.r = {fav: leitor.ler_pdf((AMOSTRA / f"FAV{fav}.pdf").read_bytes(), fav) for fav in cls.ESPERADO}

    def test_todas_ok(self):
        for fav, r in self.r.items():
            with self.subTest(fav=fav):
                self.assertEqual(r["situacao"], "OK", r["situacao"])

    def test_quantidades(self):
        for fav, (n_reds, tem_pje, n_req) in self.ESPERADO.items():
            with self.subTest(fav=fav):
                r = self.r[fav]
                self.assertEqual(len(r["reds"]), n_reds)
                self.assertEqual(r["pje"] is not None, tem_pje)
                self.assertEqual(r["qtde_requisicoes"], n_req)

    def test_pje_ausente_nao_pega_a_linha_de_baixo(self):
        # a leitura ingênua devolvia "FICHA DE ACOMPANHAMENTO..." em 3 das amostras
        for fav in ("2351072", "2397628", "2406799"):
            with self.subTest(fav=fav):
                self.assertEqual(self.r[fav]["bruto"]["pje"], "")
                self.assertEqual(self.r[fav]["pje_formatado"], "Não informado")

    def test_alertas(self):
        self.assertEqual(self.r["2351072"]["avisos"], [])
        self.assertIn("Mais de uma requisição", self.r["2397628"]["avisos"])
        self.assertIn("FAV com dois REDS", self.r["2317127"]["avisos"])
        self.assertEqual(set(self.r["2200920"]["avisos"]), {"FAV com dois REDS", "Mais de uma requisição"})

    def test_dois_reds_grava_o_primeiro_da_linha(self):
        f = self.r["2317127"]
        self.assertNotEqual(f["reds"][0], f["reds"][1])
        self.assertEqual(f["reds_gravar"], f["reds"][0])
        g = self.r["2200920"]
        self.assertEqual(g["reds"][0][:15], g["reds"][1][:15])  # mesmo REDS
        self.assertEqual((g["reds"][0][-3:], g["reds"][1][-3:]), ("002", "001"))
        self.assertEqual(g["reds_gravar"], g["reds"][0])  # o primeiro impresso, o -002

    def test_pje_de_todas_tem_dv_valido(self):
        for fav, r in self.r.items():
            if r["pje"]:
                with self.subTest(fav=fav):
                    self.assertTrue(leitor.pje_dv_valido(r["pje"]))

    def test_nao_guarda_nada_alem_dos_campos_previstos(self):
        permitidos = {"fav_impressa", "reds", "pje", "requisicoes", "involucro"}
        for r in self.r.values():
            self.assertEqual(set(r["bruto"]), permitidos)


if __name__ == "__main__":
    unittest.main()
