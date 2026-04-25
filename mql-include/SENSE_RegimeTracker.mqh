//+------------------------------------------------------------------+
//| SENSE_RegimeTracker.mqh                                          |
//| Rastreador temporal (basis mini×ref) + regime + log CSV opcional.|
//| Copiar junto a SENSE.mq5.                                        |
//+------------------------------------------------------------------+
#ifndef SENSE_REGIME_TRACKER_MQH
#define SENSE_REGIME_TRACKER_MQH

#define SENSE_REGIME_CAP 2400

/** Alinhar com painel (renderer): abaixo disto o lado é «suspeito / não confiável» para entrada só com EA. */
#ifndef SENSE_REGIME_CONFIAVEL_MIN
#define SENSE_REGIME_CONFIAVEL_MIN 0.45
#endif

// Limiar efetivo em runtime (padrão: macro acima). Pode ser alterado pela EA via input.
double g_sense_regime_confiavel_min = SENSE_REGIME_CONFIAVEL_MIN;

double SenseRegimeConfiavelMinGet()
  {
   return g_sense_regime_confiavel_min;
  }

void SenseRegimeConfiavelMinSet(const double v)
  {
   double x = v;
   // Faixa segura: evita extremos que deixam tudo sempre true/false.
   if(x < 0.05)
      x = 0.05;
   if(x > 0.95)
      x = 0.95;
   g_sense_regime_confiavel_min = x;
  }

struct SenseRegimeSample
  {
   datetime t;
   double   spread;
   double   zMini;
   double   zRef;
   bool     spreadValid;
  };

SenseRegimeSample g_sr_buf[SENSE_REGIME_CAP];
int               g_sr_len = 0;
datetime          g_sr_lastCsv = 0;
bool              g_sr_csvHeader = false;

string SenseRegimeJsonEscape(const string s)
  {
   string out = s;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   StringReplace(out, "\r", " ");
   StringReplace(out, "\n", " ");
   return out;
  }

void SenseRegimeBufTrimTime(datetime now, const int windowSec)
  {
   if(windowSec <= 0)
      return;
   const datetime lim = now - (datetime)windowSec;
   int cut = 0;
   while(cut < g_sr_len && g_sr_buf[cut].t < lim)
      cut++;
   if(cut == 0)
      return;
   for(int i = 0; i < g_sr_len - cut; i++)
      g_sr_buf[i] = g_sr_buf[i + cut];
   g_sr_len -= cut;
  }

void SenseRegimeBufPush(const SenseRegimeSample &s, datetime now, const int windowSec)
  {
   SenseRegimeBufTrimTime(now, windowSec);
   if(g_sr_len >= SENSE_REGIME_CAP)
     {
      for(int i = 0; i < g_sr_len - 1; i++)
         g_sr_buf[i] = g_sr_buf[i + 1];
      g_sr_len--;
     }
   g_sr_buf[g_sr_len++] = s;
  }

double SenseRegimeRangeRatioM1(const string sym)
  {
   if(StringLen(sym) < 2)
      return -1.0;
   if(!SymbolSelect(sym, true))
      return -1.0;
   double c = iClose(sym, PERIOD_M1, 0);
   if(c <= 0.0)
      return -1.0;
   const int n = 14;
   double sumTR = 0.0;
   for(int i = 0; i < n; i++)
     {
      double h = iHigh(sym, PERIOD_M1, i);
      double l = iLow(sym, PERIOD_M1, i);
      double pc = iClose(sym, PERIOD_M1, i + 1);
      if(h <= 0.0 || l <= 0.0)
         return -1.0;
      double tr = h - l;
      double a = MathAbs(h - pc);
      double b = MathAbs(l - pc);
      if(a > tr)
         tr = a;
      if(b > tr)
         tr = b;
      sumTR += tr;
     }
   return (sumTR / (double)n) / c;
  }

bool SenseRegimeMidPrice(const string sym, double &outMid)
  {
   if(StringLen(sym) < 2)
      return false;
   if(!SymbolSelect(sym, true))
      return false;
   double b = SymbolInfoDouble(sym, SYMBOL_BID);
   double a = SymbolInfoDouble(sym, SYMBOL_ASK);
   if(b <= 0.0 || a <= 0.0)
      return false;
   outMid = (b + a) / 2.0;
   return true;
  }

// Último spread na amostra com t <= alvo (mais recente possível).
bool SenseRegimeSpreadNearTime(const datetime alvo, double &outSp)
  {
   double bestT = 0;
   bool   found = false;
   for(int i = g_sr_len - 1; i >= 0; i--)
     {
      if(!g_sr_buf[i].spreadValid)
         continue;
      datetime ti = g_sr_buf[i].t;
      if(ti <= alvo)
        {
         if(!found || ti > bestT)
           {
            bestT = ti;
            outSp = g_sr_buf[i].spread;
            found = true;
           }
        }
     }
   return found;
  }

void SenseRegimeAppendCsv(const bool csvLog,
                         const string csvFile,
                         const int csvIntervalSec,
                         const datetime now,
                         const string symMini,
                         const string symRef,
                         const double spreadTaxa,
                         const bool haveSpread,
                         const double zMini,
                         const double zRef,
                         const double basisZ,
                         const bool basisZOk,
                         const string codigo,
                         const double atrR)
  {
   if(!csvLog || StringLen(csvFile) < 4)
      return;
   if(MQLInfoInteger(MQL_TESTER) != 0)
      return;
   if(csvIntervalSec > 0 && g_sr_lastCsv > 0 &&
      (now - g_sr_lastCsv) < (datetime)csvIntervalSec)
      return;

   int fh = FileOpen(csvFile,
                     FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(fh == INVALID_HANDLE)
      return;
   FileSeek(fh, 0, SEEK_END);
   const long sz = FileTell(fh);
   if(sz == 0 && !g_sr_csvHeader)
     {
      FileWriteString(fh, "data_hora;sym_mini;sym_ref;spread_ref_minus_mini;z_mini;z_ref;basis_z;basis_z_ok;codigo;atr_pct_m1\r\n");
      g_sr_csvHeader = true;
     }
   string line = TimeToString(now, TIME_DATE | TIME_SECONDS) + ";";
   line += symMini + ";" + symRef + ";";
   line += (haveSpread ? DoubleToString(spreadTaxa, 8) : "") + ";";
   line += DoubleToString(zMini, 4) + ";" + DoubleToString(zRef, 4) + ";";
   line += (basisZOk ? DoubleToString(basisZ, 4) : "") + ";";
   line += (basisZOk ? "1" : "0") + ";";
   line += codigo + ";" + (atrR >= 0.0 ? DoubleToString(atrR, 6) : "") + "\r\n";
   FileWriteString(fh, line);
   FileClose(fh);
   g_sr_lastCsv = now;
  }

// Monta objeto JSON { ... } para chave "regimeMercado" no dashboard (inclui rastreador).
bool SenseRegimeMercadoBuildJson(
   const bool enable,
   const string symMini,
   const string symRef,
   const bool useRef,
   const double zMini,
   const double zRef,
   const double ntslZNorm,
   const double trendDir,
   const bool ativoLateralNtsl,
   const double ntslZpctDisplay,
   const double trendWeakPct,
   const double trendStrongPct,
   const double atrCompressMax,
   const int janelaSegundos,
   const int driftLagSegundos,
   const bool csvLog,
   const string csvFile,
   const int csvIntervalSec,
   string &outObjectJson,
   const bool appendSpreadSample = true)
  {
   if(!enable)
     {
      outObjectJson = "";
      return false;
     }

   const int janela = (janelaSegundos < 30 ? 30 : (janelaSegundos > 7200 ? 7200 : janelaSegundos));
   const int driftLag = (driftLagSegundos < 5 ? 5 : (driftLagSegundos > janela ? janela / 2 : driftLagSegundos));

   double atrR = SenseRegimeRangeRatioM1(symMini);
   double midMini = 0.0, midRef = 0.0;
   bool hasMini = SenseRegimeMidPrice(symMini, midMini);
   bool hasRef = (symRef != symMini) ? SenseRegimeMidPrice(symRef, midRef) : hasMini;
   double spreadTaxa = 0.0;
   bool haveSpread = false;
   if(symRef != symMini && hasMini && hasRef)
     {
      spreadTaxa = midRef - midMini;
      haveSpread = true;
     }

   datetime now = TimeCurrent();
   if(appendSpreadSample)
     {
      SenseRegimeSample smp;
      smp.t = now;
      smp.spread = spreadTaxa;
      smp.zMini = zMini;
      smp.zRef = zRef;
      smp.spreadValid = haveSpread;
      SenseRegimeBufPush(smp, now, janela);
     }

   // --- estatísticas na janela (só spreads válidos) ---
   double sumS = 0.0, sumS2 = 0.0;
   int nS = 0;
   double sumZm = 0.0, sumZr = 0.0, nz = 0;
   for(int i = 0; i < g_sr_len; i++)
     {
      if(g_sr_buf[i].spreadValid)
        {
         double x = g_sr_buf[i].spread;
         sumS += x;
         sumS2 += x * x;
         nS++;
        }
      sumZm += g_sr_buf[i].zMini;
      sumZr += g_sr_buf[i].zRef;
      nz++;
     }

   double mediaS = 0.0, desvioS = 0.0, basisZ = 0.0;
   bool basisZOk = false;
   if(nS >= 2)
     {
      mediaS = sumS / (double)nS;
      double varS = sumS2 / (double)nS - mediaS * mediaS;
      if(varS < 0.0)
         varS = 0.0;
      desvioS = MathSqrt(varS);
      const double eps = 1.0e-9;
      if(nS >= 5 && desvioS > eps && haveSpread)
        {
         basisZ = (spreadTaxa - mediaS) / (desvioS + eps);
         basisZOk = true;
        }
     }

   double zMiniMed = (nz > 0 ? sumZm / (double)nz : 0.0);
   double zRefMed = (nz > 0 ? sumZr / (double)nz : 0.0);

   double spreadDrift = 0.0;
   bool haveDrift = false;
   if(haveSpread && driftLag > 0)
     {
      double spAnt;
      if(SenseRegimeSpreadNearTime(now - (datetime)driftLag, spAnt))
        {
         spreadDrift = spreadTaxa - spAnt;
         haveDrift = true;
        }
     }

   bool divSig = false;
   if(useRef && (symRef != symMini))
     {
      if((zMini > 0.12 && zRef < -0.12) || (zMini < -0.12 && zRef > 0.12))
         divSig = true;
     }

   string codigo = "neutro";
   string rotulo = "Sem regime dominante claro no recorte — mistura de sinais.";
   string vies = "neutro";

   double zMedia = zMini;
   if(useRef)
      zMedia = (zMini + zRef) * 0.5;
   if(zMedia > 0.15)
      vies = "compra";
   else if(zMedia < -0.15)
      vies = "venda";

   double conf = MathMin(1.0,
                         (MathAbs(zMini) + (useRef ? MathAbs(zRef) : 0.0)) /
                            (useRef ? 4.0 : 2.2));
   if(conf < 0.0)
      conf = 0.0;

   const bool forteC =
      (trendDir >= trendStrongPct || ntslZNorm >= trendStrongPct);
   const bool forteV =
      (trendDir <= -trendStrongPct || ntslZNorm <= -trendStrongPct);

   if(ativoLateralNtsl)
     {
      codigo = "lateral_ntsl";
      rotulo = "Lateral (faixa NTSL): consolidação ou espera de catalisador — cuidado com armadilha de liquidez.";
      conf *= 0.9;
     }
   else if(divSig)
     {
      codigo = "divergencia_mini_ref";
      rotulo = "Mini e referência em tensão (Z com sinais opostos) — resolução pendente; não assuma só um book.";
      conf *= 0.75;
     }
   else if(basisZOk && MathAbs(basisZ) >= 2.2)
     {
      codigo = "curva_tensa";
      rotulo = "Basis ref−mini fora do padrão da janela (|z| alto) — possível stress de curva / arbitragem.";
      conf = MathMin(1.0, conf + 0.08);
     }
   else if(haveSpread && haveDrift && MathAbs(spreadDrift) > desvioS * 0.5 && nS >= 8)
     {
      codigo = "basis_em_movimento";
      rotulo = "Spread ref−mini em movimento vs. instantes anteriores — acompanhe continuidade.";
     }
   else if(atrR >= 0.0 && atrR < atrCompressMax && !forteC && !forteV)
     {
      codigo = "compressao";
      rotulo = "Volatilidade curta comprimida (M1) — possível acumulação antes de expansão.";
     }
   else if(forteC && !forteV)
     {
      codigo = "tendencia_alta";
      rotulo = "Indicadores de tendência/NTSL mais alinhados com alta no recorte atual.";
     }
   else if(forteV && !forteC)
     {
      codigo = "tendencia_baixa";
      rotulo = "Indicadores de tendência/NTSL mais alinhados com baixa no recorte atual.";
     }
   else
     {
      codigo = "misto";
      rotulo = "Sinais mistos — viés fraco ou transição entre zonas.";
     }

   // Confiança por lado (0..1) — alinhado ao `codigo`/viés; limiar SENSE_REGIME_CONFIAVEL_MIN no painel + EA gatilho.
   double confCompra = 0.0;
   double confVenda = 0.0;
   if(codigo == "tendencia_alta")
     {
      confCompra = conf;
      confVenda = conf * 0.22;
     }
   else if(codigo == "tendencia_baixa")
     {
      confVenda = conf;
      confCompra = conf * 0.22;
     }
   else if(codigo == "misto")
     {
      confCompra = conf * 0.55;
      confVenda = conf * 0.55;
     }
   else if(codigo == "lateral_ntsl" || codigo == "divergencia_mini_ref")
     {
      confCompra = conf * 0.38;
      confVenda = conf * 0.38;
     }
   else if(codigo == "compressao" || codigo == "basis_em_movimento" || codigo == "curva_tensa")
     {
      confCompra = conf * 0.48;
      confVenda = conf * 0.48;
     }
   else
     {
      confCompra = (vies == "compra" ? conf * 0.78 : conf * 0.35);
      confVenda = (vies == "venda" ? conf * 0.78 : conf * 0.35);
     }
   if(confCompra > 1.0)
      confCompra = 1.0;
   if(confVenda > 1.0)
      confVenda = 1.0;
   // Exclusão mútua: evita COMPRA e VENDA confiáveis ao mesmo tempo.
   // Se ambos passarem no limiar com diferença pequena, assume estado neutro (ambos false).
   const double confGapMin = 0.03;
   bool regimeCompraConfiavel = (confCompra >= g_sense_regime_confiavel_min);
   bool regimeVendaConfiavel = (confVenda >= g_sense_regime_confiavel_min);
   if(regimeCompraConfiavel && regimeVendaConfiavel)
     {
      const double gap = MathAbs(confCompra - confVenda);
      if(gap < confGapMin)
        {
         regimeCompraConfiavel = false;
         regimeVendaConfiavel = false;
        }
      else if(confCompra > confVenda)
         regimeVendaConfiavel = false;
      else
         regimeCompraConfiavel = false;
     }

   string notas = StringFormat("Z%% NTSL ~ %.2f | ATR%% M1 ~ %.4f", ntslZpctDisplay, atrR >= 0.0 ? atrR : 0.0);
   if(haveSpread)
      notas += StringFormat(" | Δtaxa ref−mini %.5f", spreadTaxa);
   if(basisZOk)
      notas += StringFormat(" | basisZ ~ %.2f", basisZ);
   if(haveDrift)
      notas += StringFormat(" | drift ~ %.6f", spreadDrift);

   string jr = "{";
   jr += "\"janelaSegundos\":" + IntegerToString(janela);
   jr += ",\"amostrasTotal\":" + IntegerToString(g_sr_len);
   jr += ",\"amostrasSpread\":" + IntegerToString(nS);
   jr += ",\"spreadMediaJanela\":" + (nS > 0 ? DoubleToString(mediaS, 8) : "null");
   jr += ",\"spreadDesvioJanela\":" + (nS >= 2 ? DoubleToString(desvioS, 8) : "null");
   jr += ",\"basisZ\":" + (basisZOk ? DoubleToString(basisZ, 4) : "null");
   jr += ",\"basisZConfiavel\":" + (basisZOk ? "true" : "false");
   jr += ",\"spreadDrift\":" + (haveDrift ? DoubleToString(spreadDrift, 8) : "null");
   jr += ",\"spreadDriftLagSeg\":" + IntegerToString(driftLag);
   int digM = (int)SymbolInfoInteger(symMini, SYMBOL_DIGITS);
   if(digM < 1)
      digM = 4;
   int digR = (symRef != symMini ? (int)SymbolInfoInteger(symRef, SYMBOL_DIGITS) : digM);
   if(digR < 1)
      digR = 4;
   jr += ",\"midMini\":" + (hasMini ? DoubleToString(midMini, digM) : "null");
   jr += ",\"midRef\":" + ((symRef != symMini && hasRef) ? DoubleToString(midRef, digR) : "null");
   jr += ",\"temDuasPernas\":" + ((symRef != symMini && haveSpread) ? "true" : "false");
   jr += ",\"zMiniMediaJanela\":" + DoubleToString(zMiniMed, 4);
   jr += ",\"zRefMediaJanela\":" + DoubleToString(zRefMed, 4);
   jr += "}";

   string j = "{";
   j += "\"ativo\":true";
   j += ",\"schemaRegime\":2";
   j += ",\"codigo\":\"" + SenseRegimeJsonEscape(codigo) + "\"";
   j += ",\"rotulo\":\"" + SenseRegimeJsonEscape(rotulo) + "\"";
   j += ",\"vies\":\"" + SenseRegimeJsonEscape(vies) + "\"";
   j += ",\"confianca\":" + DoubleToString(conf, 3);
   j += ",\"confiancaCompra\":" + DoubleToString(confCompra, 3);
   j += ",\"confiancaVenda\":" + DoubleToString(confVenda, 3);
   j += ",\"regimeConfiavelMin\":" + DoubleToString(g_sense_regime_confiavel_min, 3);
   j += ",\"regimeCompraConfiavel\":" + (regimeCompraConfiavel ? "true" : "false");
   j += ",\"regimeVendaConfiavel\":" + (regimeVendaConfiavel ? "true" : "false");
   j += ",\"atrRatioM1\":" + DoubleToString((atrR >= 0.0 ? atrR : -1.0), 6);
   j += ",\"spreadTaxaMiniRef\":" + (haveSpread ? DoubleToString(spreadTaxa, 5) : "null");
   j += ",\"divergenciaMiniRef\":" + (divSig ? "true" : "false");
   j += ",\"rastreador\":" + jr;
   j += ",\"notas\":\"" + SenseRegimeJsonEscape(notas) + "\"";
   j += "}";
   outObjectJson = j;

   if(appendSpreadSample)
      SenseRegimeAppendCsv(csvLog, csvFile, csvIntervalSec, now,
                          symMini, symRef, spreadTaxa, haveSpread,
                          zMini, zRef, basisZ, basisZOk, codigo, atrR);
   return true;
  }

#endif // SENSE_REGIME_TRACKER_MQH
